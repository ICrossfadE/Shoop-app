import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePrice } from '../lib/money.ts';

// Financial input must reject implicit rounding, exponent syntax and nonfinite values.
test('actual prices parse decimal kopecks and enforce monetary bounds', () => {
  for (const [text, expected] of [['0', 0], ['0,01', .01], [' 19.99 ', 19.99], ['99999999.99', 99999999.99]] as const) assert.equal(parsePrice(text), expected);
  for (const text of ['', '-1', '1e3', 'NaN', 'Infinity', '1.001', '100000000', '1,2.3', '12 грн']) assert.equal(parsePrice(text), null);
  assert.equal(parsePrice(12), null);
});
