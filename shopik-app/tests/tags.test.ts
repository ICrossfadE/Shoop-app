import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTagIds, readTagFilter, tagTextColor, validateTag } from '../lib/tags.ts';

const first = 'b8bc6ee0-9ddb-456a-8f41-637ec271d001';
const second = 'b8bc6ee0-9ddb-456a-8f41-637ec271d002';

// URL and action inputs must agree about identity, duplicates and malformed IDs.
test('tag selection is normalized without silently dropping malformed values', () => {
  assert.deepEqual(parseTagIds(undefined), []);
  assert.deepEqual(parseTagIds([second, first.toUpperCase(), first]), [first, second]);
  for (const value of [null, first, [first, 'bad'], [null], [123]]) assert.equal(parseTagIds(value), null);
  assert.deepEqual(readTagFilter(first), [first]);
  assert.deepEqual(readTagFilter([second, first]), [first, second]);
  assert.equal(readTagFilter(''), null);
  assert.equal(readTagFilter(`${first},${second}`), null);
});

test('tag creation only accepts bounded names and six-digit hex colors', () => {
  assert.deepEqual(validateTag(' Сніданок ', '#aabbcc'), { name: 'Сніданок', color: '#AABBCC' });
  assert.ok(validateTag('🍎'.repeat(120), '#000000'));
  for (const name of ['', ' ', null, 1, 'а'.repeat(121)]) assert.equal(validateTag(name, '#FFFFFF'), null);
  for (const color of ['red', '#abc', '#FF000000', 'url(example)', '', null]) assert.equal(validateTag('Тег', color), null);
});

test('tag text color provides contrast for dark and light backgrounds', () => {
  assert.equal(tagTextColor('#000000'), '#FFFFFF');
  assert.equal(tagTextColor('#FFFFFF'), '#000000');
  assert.equal(tagTextColor('#FFFF00'), '#000000');
  assert.equal(tagTextColor('#0000FF'), '#FFFFFF');
});
