const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compare } = require('../renderer/text-diff');
const joined = (parts, changed) => parts.filter((p) => changed === undefined || p.changed === changed).map((p) => p.text).join('');

test('highlights words and punctuation independently of unchanged context', () => {
  const diff = compare('Olá, Ana! Bom dia.', 'Olá, Bia? Bom dia.');
  assert.equal(joined(diff.left, true), 'Ana!');
  assert.equal(joined(diff.right, true), 'Bia?');
  assert.equal(joined(diff.left, false), 'Olá,  Bom dia.');
});

test('preserves exact spaces, line endings, Unicode, literal markup and empty values', () => {
  for (const [a, b] of [
    ['', 'novo'], ['antigo', ''], ['igual', 'igual'], [' a  b\r\n', 'a b\n'],
    ['a\tb', 'a b'], ['a\u00a0b', 'a b'], ['a\u200bb', 'ab'],
    ['ação 😀', 'ação 😃'], ['<b>{name}</b>', '<script>literal</script>'],
    ['um dois um três', 'um três um dois']
  ]) {
    const diff = compare(a, b);
    assert.equal(joined(diff.left), a);
    assert.equal(joined(diff.right), b);
    assert.equal(joined(diff.left, false), joined(diff.right, false));
    assert.equal(diff.left.some((p) => p.changed) || diff.right.some((p) => p.changed), a !== b);
  }
  assert.equal(joined(compare('a b', 'a  b').right, true), ' ');
  assert.equal(joined(compare('a\nb', 'a b').left, true), '\n');
});

test('large texts use bounded fallback and retain common edges without truncating', () => {
  const a = 'início ' + 'a '.repeat(10000) + 'fim';
  const b = 'início ' + 'b '.repeat(10000) + 'fim';
  const diff = compare(a, b);
  assert.equal(diff.coarse, true);
  assert.equal(joined(diff.left), a);
  assert.equal(joined(diff.right), b);
  assert.equal(diff.left[0].changed, false);
  assert.equal(diff.left.at(-1).changed, false);
});
