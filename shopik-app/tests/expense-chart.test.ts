import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expenseCategoryColor } from '../lib/expense-chart.ts';

// Reordering and filtering must never change a historical category's color.
test('chart colors follow historical identity rather than order or name alone', () => {
  const identities = [['id-a', 'Їжа'], ['id-b', 'Їжа'], ['id-a', 'Попередня назва']];
  const colors = new Map(identities.map(([id, name]) => [`${id}:${name}`, expenseCategoryColor(id, name)]));
  for (const [id, name] of identities.toReversed().slice(1)) {
    assert.equal(expenseCategoryColor(id, name), colors.get(`${id}:${name}`));
  }
  assert.notEqual(colors.get('id-a:Їжа'), colors.get('id-b:Їжа'));
  assert.notEqual(colors.get('id-a:Їжа'), colors.get('id-a:Попередня назва'));
});
