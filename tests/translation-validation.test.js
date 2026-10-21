const assert = require('node:assert/strict');
const { test } = require('node:test');
const { check } = require('../renderer/translation-validation');

test('ordinary translated text and non-text values have no warnings', () => {
  for (const [a, b] of [['Hello', 'Olá'], [null, 12], [false, null], ['100%%', '100%%']]) assert.deepEqual(check(a, b), []);
});
test('markers allow reordering but detect renaming and repeated occurrences', () => {
  assert.deepEqual(check('{name} {0} {{user}}', '{{user}} {0} {name}'), []);
  assert.equal(check('{name} {name}', '{name}').length, 1);
  assert.equal(check('{name}', '{nome}').length, 2);
  assert.match(check('{name}', '')[0], /removido/);
});
test('printf formats preserve type, count and implicit argument order', () => {
  assert.equal(check('%s', '%d').length, 2);
  assert.equal(check('%s %d', '%d %s').length, 1);
  assert.deepEqual(check('%1$s %2$d', '%2$d %1$s'), []);
  assert.deepEqual(check('%% %.2f', '%.2f %%'), []);
});
test('tags detect missing markup, attributes and altered nesting', () => {
  assert.deepEqual(check('<b>Hello</b>', '<b>Olá</b>'), []);
  assert.equal(check('<b>Hello</b>', 'Olá').length, 2);
  assert.equal(check('<a href="a">x</a>', '<a href="b">x</a>').length, 2);
  assert.equal(check('<b><i>x</i></b>', '<i><b>x</b></i>').length, 1);
});
test('URLs detect changed destinations while ignoring surrounding punctuation', () => {
  assert.deepEqual(check('Go https://example.com.', 'Veja https://example.com!'), []);
  assert.equal(check('https://a.test/x?q=1', 'https://a.test/x?q=2').length, 2);
  assert.equal(check('www.example.com', '').length, 1);
});
