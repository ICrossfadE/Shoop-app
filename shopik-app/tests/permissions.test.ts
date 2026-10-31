import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsRecord, canDeleteExpense } from '../lib/permissions.ts';

// Owner role never overrides authorship; archived and old unknown schemas fail closed.
test('management hints require authorship and a live expense', () => {
  assert.equal(ownsRecord('a', {created_by:'a'}), true);
  assert.equal(ownsRecord('owner', {created_by:'a'}), false);
  assert.equal(ownsRecord('', {created_by:''}), false);
  assert.equal(canDeleteExpense('a',{created_by:'a',archived:false}),true);
  assert.equal(canDeleteExpense('a',{created_by:'a',archived:true}),false);
  assert.equal(canDeleteExpense('owner',{created_by:'a',archived:false}),false);
  assert.equal(canDeleteExpense('a',{}),false);
});
