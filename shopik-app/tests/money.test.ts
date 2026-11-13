import assert from 'node:assert/strict';
import test from 'node:test';
import { expenseTone, parsePrice } from '../lib/money.ts';

// Financial input must reject implicit rounding, exponent syntax and nonfinite values.
test('actual prices parse decimal kopecks and enforce monetary bounds', () => {
  for (const [text, expected] of [['0', 0], ['0,01', .01], [' 19.99 ', 19.99], ['99999999.99', 99999999.99]] as const) assert.equal(parsePrice(text), expected);
  for (const text of ['', '-1', '1e3', 'NaN', 'Infinity', '1.001', '100000000', '1,2.3', '12 грн']) assert.equal(parsePrice(text), null);
  assert.equal(parsePrice(12), null);
});

// Repeated edits compare with the original plan, including exact kopeck equality.
test('expense price tone follows the immutable plan and leaves unknown history neutral', () => {
  const item = { planned_amount: 300, amount: 250 };
  assert.equal(expenseTone(item), 'saving');
  assert.equal(expenseTone({ ...item, amount: 350 }), 'overrun');
  assert.equal(expenseTone({ ...item, amount: 275 }), 'saving');
  assert.equal(expenseTone({ ...item, amount: 300 }), 'neutral');
  assert.equal(expenseTone({ amount: 350, planned_amount: null }), 'neutral');
  assert.equal(expenseTone({ amount: 350 }), 'neutral');
  assert.equal(expenseTone({ amount: 0.1 + 0.2, planned_amount: 0.3 }), 'neutral');
  assert.equal(expenseTone({ amount: 0, planned_amount: 0.01 }), 'saving');
  assert.equal(item.planned_amount, 300);
});
