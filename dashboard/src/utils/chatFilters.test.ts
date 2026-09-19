import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterChats, filterChannels, groupStatusesByContact, excludeGroups } from './chatFilters.ts';

const chat = (id: string, name?: string, kind?: string) => ({ id, name, kind });

test('the chats tab hides channel and status rows, which have their own tabs', () => {
  const all = [chat('a@c.us', 'Alice'), chat('n@newsletter', 'News', 'channel'), chat('s@broadcast', 'S', 'status')];

  assert.deepEqual(
    filterChats(all, '').map(c => c.id),
    ['a@c.us'],
  );
});

test('search matches name or id, case-insensitively, and an absent name never throws', () => {
  const all = [chat('628111@c.us', 'Alice'), chat('628222@c.us'), chat('628333@c.us', 'Bob')];

  assert.deepEqual(
    filterChats(all, 'ALI').map(c => c.id),
    ['628111@c.us'],
  );
  assert.deepEqual(
    filterChats(all, '628222').map(c => c.id),
    ['628222@c.us'],
  );
  assert.deepEqual(
    filterChats(all, 'zzz').map(c => c.id),
    [],
  );
});

test('channels match on their own name and id', () => {
  const channels = [
    { id: '111@newsletter', name: 'OpenWA News' },
    { id: '222@newsletter', name: 'Other' },
  ];

  assert.deepEqual(
    filterChannels(channels, 'openwa').map(c => c.id),
    ['111@newsletter'],
  );
  assert.deepEqual(
    filterChannels(channels, '222').map(c => c.id),
    ['222@newsletter'],
  );
});

const item = (contactId: string, timestamp: string, name?: string) => ({
  contact: { id: contactId, name },
  timestamp,
});

test('statuses collapse to one row per contact, newest contact first', () => {
  // Store order is newest-first overall.
  const statuses = [
    item('b', '2026-08-01T03:00:00Z', 'Bob'),
    item('a', '2026-08-01T02:00:00Z', 'Alice'),
    item('a', '2026-08-01T01:00:00Z', 'Alice'),
  ];

  const groups = groupStatusesByContact(statuses, '');

  assert.deepEqual(
    groups.map(g => g.contact.id),
    ['b', 'a'],
    'group order is newest-contact-first',
  );
  assert.equal(groups[1].items.length, 2, 'one row per contact, items kept together');
  assert.equal(groups[1].latest, '2026-08-01T02:00:00Z', 'latest is the newest timestamp in the group');
});

test("a group's items run oldest-first, opposite to the group ordering", () => {
  // The viewer opens at the newest and reads like a story: newest at the bottom, where the scroll
  // lands. The store hands them over newest-first, so the group must flip them.
  const groups = groupStatusesByContact(
    [item('a', '2026-08-01T03:00:00Z'), item('a', '2026-08-01T02:00:00Z'), item('a', '2026-08-01T01:00:00Z')],
    '',
  );

  assert.deepEqual(
    groups[0].items.map(i => i.timestamp),
    ['2026-08-01T01:00:00Z', '2026-08-01T02:00:00Z', '2026-08-01T03:00:00Z'],
  );
});

test('status search matches name, pushName or id', () => {
  const statuses = [
    { contact: { id: '628111@c.us', name: 'Alice', pushName: 'Ali' }, timestamp: '2026-08-01T01:00:00Z' },
    { contact: { id: '628222@c.us', name: undefined, pushName: 'Bobby' }, timestamp: '2026-08-01T02:00:00Z' },
  ];

  assert.deepEqual(
    groupStatusesByContact(statuses, 'alice').map(g => g.contact.id),
    ['628111@c.us'],
  );
  assert.deepEqual(
    groupStatusesByContact(statuses, 'bobby').map(g => g.contact.id),
    ['628222@c.us'],
  );
  assert.deepEqual(
    groupStatusesByContact(statuses, '628111').map(g => g.contact.id),
    ['628111@c.us'],
  );
});

const gchat = (id: string, name?: string, isGroup?: boolean) => ({ id, name, isGroup });
const roster = [
  gchat('573001112222@c.us', 'Ana', false),
  gchat('120363001@g.us', 'Barrio Norte', true),
  gchat('573004445555@c.us', 'Beto'),
  gchat('120363002@g.us', 'Comite', true),
];

test('excludeGroups off is a no-op, and returns every chat', () => {
  assert.equal(excludeGroups(roster, false).length, 4);
});

test('excludeGroups on drops exactly the groups', () => {
  assert.deepEqual(
    excludeGroups(roster, true).map(c => c.name),
    ['Ana', 'Beto'],
  );
});

test('a chat with isGroup absent survives the filter', () => {
  assert.deepEqual(
    excludeGroups([gchat('x@c.us', 'Sin dato')], true).map(c => c.name),
    ['Sin dato'],
  );
});

test('excludeGroups and filterChats compose in either order', () => {
  const a = excludeGroups(filterChats(roster, 'b'), true);
  const b = filterChats(excludeGroups(roster, true), 'b');
  assert.deepEqual(
    a.map(c => c.id),
    b.map(c => c.id),
  );
  assert.deepEqual(
    a.map(c => c.name),
    ['Beto'],
  );
});
