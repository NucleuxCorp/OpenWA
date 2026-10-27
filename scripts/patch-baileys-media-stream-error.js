/**
 * Stop a dropped media download from killing the whole process.
 *
 * `downloadEncryptedContent` (lib/Utils/messages-media.js) wires the HTTP body into the decrypt
 * Transform with `fetched.pipe(output, { end: true })`. `.pipe()` does NOT forward errors from the
 * source to the destination, and nothing else listens on `fetched`. So when WhatsApp's media CDN
 * closes the socket mid-download — which happens whenever the session's connection drops (428) while
 * an inbound media message is being fetched — undici destroys the body with `TypeError: terminated`,
 * the `'error'` event fires on a Readable with no listener, and Node turns it into an uncaught
 * exception. The bootstrap handler then exits the process: every session goes down, the dashboard
 * loses its socket and the QR screens reappear.
 *
 * The caller (downloadInboundMediaCapped) already iterates the returned stream inside a try and
 * treats a rejected download as "no media", but it can never see this error: it only ever holds
 * `output`. Forwarding the source error onto `output` routes it into that existing handling.
 *
 * Exact and self-disabling, like the other patchers: an unknown shape fails rather than silently
 * shipping unpatched.
 *
 * **RETIRE THIS, do not keep it.** It compensates for an upstream bug with an obvious upstream fix
 * (`stream.pipeline`). Delete it once @whiskeysockets/baileys forwards the fetch body's error.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BAILEYS = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys');
const MEDIA_PATH = path.join('lib', 'Utils', 'messages-media.js');

const MARKER = 'OpenWA: .pipe() does not forward source errors';

const PIPE_FIND = `    return fetched.pipe(output, { end: true });`;

const PIPE_REPLACE = `    // ${MARKER}. Without this, a CDN socket closed mid-download
    // emits 'error' on \`fetched\` with no listener and crashes the process; forwarding it onto
    // \`output\` lets the consumer that iterates the returned stream reject and handle it.
    fetched.once('error', (error) => output.destroy(error));
    return fetched.pipe(output, { end: true });`;

/** Apply the transform. Returns {skipped, reason} or {note} — never a partial write. */
function applyMediaStreamErrorPatch(baileysDir = DEFAULT_BAILEYS) {
  const file = path.join(baileysDir, MEDIA_PATH);
  if (!fs.existsSync(file)) {
    return { skipped: true, reason: `${MEDIA_PATH} not found — nothing to patch` };
  }
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(MARKER)) {
    return { skipped: true, reason: 'already patched' };
  }
  const occurrences = source.split(PIPE_FIND).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected exactly 1 media decrypt pipe site in ${MEDIA_PATH}, found ${occurrences} — ` +
        'the upstream shape changed; re-check whether a dropped media download still crashes the ' +
        'process before removing this patcher',
    );
  }
  fs.writeFileSync(file, source.replace(PIPE_FIND, PIPE_REPLACE), 'utf8');
  return {
    note: 'forwarded the media fetch stream error to the decrypt stream so a dropped download no longer crashes',
  };
}

function run() {
  const bestEffort = process.argv.includes('--best-effort');
  try {
    const result = applyMediaStreamErrorPatch();
    console.log(`patch-baileys-media-stream-error: ${result.skipped ? `skipped — ${result.reason}` : result.note}`);
  } catch (error) {
    if (bestEffort) {
      console.warn(`patch-baileys-media-stream-error: skipped — ${error.message}`);
      return;
    }
    console.error(`patch-baileys-media-stream-error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) run();

/**
 * The stand-down branch above as a predicate, for the startup guard (engine-patch-status.ts).
 * Unreadable reads as applied: a tree we cannot inspect is not evidence of a broken one, and a
 * missing messages-media.js already fails the image build, where the apply function refuses it.
 */
function isApplied(baileysDir = DEFAULT_BAILEYS) {
  try {
    return fs.readFileSync(path.join(baileysDir, MEDIA_PATH), 'utf8').includes(MARKER);
  } catch {
    return true;
  }
}

module.exports = { applyMediaStreamErrorPatch, isApplied, PIPE_FIND, PIPE_REPLACE, MARKER };
