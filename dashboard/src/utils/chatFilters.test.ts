import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterChats, excludeGroups } from './chatFilters.ts';

const chat = (id: string, name?: string, isGroup?: boolean) => ({ id, name, isGroup });

const roster = [
  chat('573001112222@c.us', 'Ana', false),
  chat('120363001@g.us', 'Barrio Norte', true),
  chat('573004445555@c.us', 'Beto'),
  chat('120363002@g.us', 'Comite', true),
];

test('empty query keeps every chat', () => {
  assert.equal(filterChats(roster, '').length, 4);
});

test('query matches the display name, case-insensitively', () => {
  assert.deepEqual(filterChats(roster, 'ANA').map(c => c.name), ['Ana']);
});

test('query matches the raw JID when the name does not', () => {
  assert.deepEqual(filterChats(roster, '120363002').map(c => c.name), ['Comite']);
});

test('a chat with no name is still matchable by id', () => {
  const anon = [chat('573009998888@c.us')];
  assert.equal(filterChats(anon, '5730099').length, 1);
  assert.equal(filterChats(anon, 'nope').length, 0);
});

test('excludeGroups off is a no-op, and returns every chat', () => {
  assert.equal(excludeGroups(roster, false).length, 4);
});

test('excludeGroups on drops exactly the groups', () => {
  assert.deepEqual(excludeGroups(roster, true).map(c => c.name), ['Ana', 'Beto']);
});

test('a chat with isGroup absent survives the filter', () => {
  // The engine did not report the flag. Hiding a private conversation is the worse error,
  // so an unknown chat stays visible rather than being swept up with the groups.
  assert.deepEqual(excludeGroups([chat('x@c.us', 'Sin dato')], true).map(c => c.name), ['Sin dato']);
});

test('the two predicates compose in either order with the same result', () => {
  const a = excludeGroups(filterChats(roster, 'b'), true);
  const b = filterChats(excludeGroups(roster, true), 'b');
  assert.deepEqual(a.map(c => c.id), b.map(c => c.id));
  assert.deepEqual(a.map(c => c.name), ['Beto']);
});
