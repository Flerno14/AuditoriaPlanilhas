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

test('literal percent and relocated s% or asterisks do not consume following prose as printf', () => {
  for (const [source, target] of [
    ['% shared a view with you.', '% compartilhou uma visualização com você.'],
    ['Added tag s%', 'Tag s% adicionada'],
    ['50% discount', 'Desconto de 50%'],
    ['50% of the total', '50% do total'],
    ['% a', '% s'],
    ['Required * field', 'Campo obrigatório *'],
  ]) assert.deepEqual(check(source, target), [], `${source} → ${target}`);
});

test('explicit printf width, precision, positions and stars remain validated', () => {
  for (const token of ['%s', '%d', '%.2f', '% 8.2f', '% 08d', '%1$ s', '%*.*f', '% *d']) {
    assert.equal(check(`Value: ${token}`, 'Valor:').length, 1, token);
  }
  assert.deepEqual(check('Value % 8.2f', '% 8.2f valor'), []);
  assert.deepEqual(check('Literal % 8shared', 'Literal'), []);
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

test('printf does not read ordinary words, URL escapes or environment variables as formats', () => {
  for (const [source, target] of [
    ['%discount', '%desconto'], ['%complete', '%concluído'],
    ['Open %APPDATA% now', 'Agora abra %APPDATA%'],
    ['https://example.com/%20file', 'https://example.com/%20arquivo'],
  ]) assert.equal(check(source, target).filter((issue) => issue.startsWith('Formatos:')).length, 0);
  assert.equal(check('%s%d', '%s').filter((issue) => issue.startsWith('Formatos:')).length, 1);
  assert.equal(check('%s%%', '%%').filter((issue) => issue.startsWith('Formatos:')).length, 1);
  assert.equal(check('https://example.com/%20file', 'https://example.com/%20arquivo').length, 2);
});

test('URL parentheses are preserved when balanced and surrounding punctuation may move', () => {
  assert.deepEqual(check('[(https://example.com)].', 'https://example.com'), []);
  assert.deepEqual(check('(https://example.com/wiki/Title_(topic)).', 'Veja https://example.com/wiki/Title_(topic)!'), []);
  assert.equal(check('https://example.com/wiki/Title_(topic)', 'https://example.com/wiki/Title_(other)').length, 2);
  assert.equal(check('https://example.com/wiki/Title_(topic)', 'https://example.com/wiki/Title_(topic').length, 2);
});

test('unsupported brace syntax is not partially classified as simple markers', () => {
  assert.deepEqual(check('{{{name}}}', '{{{nome}}}'), []);
  assert.deepEqual(check('{{name}', '{name}}'), []);
  assert.equal(check('{{name}}', '{name}').length, 2);
  assert.equal(check('{name} {name}', '{name}').length, 1);
});

test('literal markup is never executed and actual markup changes remain visible', () => {
  assert.deepEqual(check('a < 5 and b > 2', 'a < 5 e b > 2'), []);
  assert.deepEqual(check('<img src="x" onerror="alert(1)">Hello', '<img src="x" onerror="alert(1)">Olá'), []);
  assert.equal(check('<b>Hello</b>', '<i>Olá</i>').length, 4);
});

test('equivalent tag whitespace, attribute order and quote styles do not cause warnings', () => {
  assert.deepEqual(check('<b >Hello</b >', '<b>Olá</b>'), []);
  assert.deepEqual(check('<br />', '<br/>'), []);
  assert.deepEqual(check('<a href="x" title="a b">Hello</a>', "<a title='a b' href = 'x'>Olá</a>"), []);
  assert.equal(check('<a title="a b">', '<a title="a  b">').length, 2);
  assert.equal(check('<a href="x">', '<a href="y">').length, 2);
  assert.equal(check('<b><i>x</i></b>', '<i><b>x</b></i>').length, 1);
});
