'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { applyMediaStreamErrorPatch, PIPE_FIND, MARKER } = require('./patch-baileys-media-stream-error');

/**
 * Same contract as the sibling patcher specs: fire only on the exact shape, refuse anything else,
 * be safe to run twice.
 *
 * The defect is a process crash, so the behaviour is exercised in a CHILD process: an unhandled
 * 'error' event would take down the test runner itself. The child pipes a source that dies with
 * undici's `TypeError: terminated` and reports whether the consumer saw it.
 */

/** A media file with the real upstream pipe line, in CommonJS so the child can run it. */
function fakeBaileys() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-media-'));
  fs.mkdirSync(path.join(dir, 'lib', 'Utils'), { recursive: true });
  const file = path.join(dir, 'lib', 'Utils', 'messages-media.js');
  fs.writeFileSync(
    file,
    `'use strict';
const downloadEncryptedContent = (fetched, output) => {
${PIPE_FIND}
};
module.exports = { downloadEncryptedContent };
`,
  );
  return { dir, file };
}

/** Run a dropped download against `file` in a child; returns its exit status and stdout. */
function dropDownload(file) {
  const script = `
const { Readable, Transform } = require('stream');
const { downloadEncryptedContent } = require(${JSON.stringify(file)});
const fetched = new Readable({ read() {} });
const output = new Transform({ transform(chunk, _, cb) { cb(null, chunk); } });
const stream = downloadEncryptedContent(fetched, output);
(async () => {
  try {
    for await (const _chunk of stream) { /* drain */ }
    console.log('ended');
  } catch (error) {
    console.log('caught:' + error.message);
  }
})();
fetched.push(Buffer.from('partial'));
setImmediate(() => fetched.destroy(new TypeError('terminated')));
`;
  const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout.trim(), stderr: res.stderr };
}

test('CONTROL — the unpatched pipe crashes the process when the source dies', () => {
  // Without this the test below could pass against a pipe that never had the defect.
  const { dir, file } = fakeBaileys();
  const res = dropDownload(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /TypeError: terminated/);
  assert.doesNotMatch(res.stdout, /caught:/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the patched pipe hands the source error to the consumer and the process survives', () => {
  const { dir, file } = fakeBaileys();
  const result = applyMediaStreamErrorPatch(dir);
  assert.equal(result.skipped, undefined);

  const res = dropDownload(file);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, 'caught:terminated');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('is idempotent — a second run does not double-patch', () => {
  const { dir, file } = fakeBaileys();
  applyMediaStreamErrorPatch(dir);
  const once = fs.readFileSync(file, 'utf8');
  const second = applyMediaStreamErrorPatch(dir);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already patched');
  assert.equal(fs.readFileSync(file, 'utf8'), once);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('refuses an unknown shape rather than shipping unpatched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-media-'));
  fs.mkdirSync(path.join(dir, 'lib', 'Utils'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'Utils', 'messages-media.js'), 'const x = 1;\n');
  assert.throws(() => applyMediaStreamErrorPatch(dir), /expected exactly 1 media decrypt pipe site/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('skips a tree with no baileys rather than failing the install', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-media-'));
  const result = applyMediaStreamErrorPatch(dir);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the marker the idempotence check keys on is actually written', () => {
  const { dir, file } = fakeBaileys();
  applyMediaStreamErrorPatch(dir);
  assert.ok(fs.readFileSync(file, 'utf8').includes(MARKER));
  fs.rmSync(dir, { recursive: true, force: true });
});
