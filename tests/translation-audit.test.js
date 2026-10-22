const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspect, rank } = require('../renderer/translation-audit-rules');
const { validateTranslationSession } = require('../electron/translation-session');
test('bulk review spans pages, respects a filtered snapshot and can reopen reviews', () => {
  const { applyReview } = require('../renderer/translation-audit-rules');
  const rows = Array.from({ length: 300 }, (_, line) => ({ line, review: 'Não revisado', source: 'Hello' }));
  const filtered = rows.filter((row) => row.line % 2 === 0);
  assert.equal(applyReview(filtered, 'Revisado'), 150);
  assert.ok(rows.every((row) => row.review === (row.line % 2 === 0 ? 'Revisado' : 'Não revisado')));
  assert.equal(applyReview(filtered, 'Revisado'), 0);
  assert.equal(applyReview(rows, 'Precisa corrigir'), 300);
  assert.equal(applyReview(rows, 'Não revisado'), 300);
  assert.equal(applyReview(rows, 'Invalid'), 0);
  assert.ok(rows.every((row) => row.review === 'Não revisado' && row.source === 'Hello'));
});
test('alert filter groups variable details and matches any alert on a row', () => {
  const { alertType, matchesAlert } = require('../renderer/translation-audit-rules');
  const row = { issues: ['Tags: removido "<b>" (1×).', 'Números divergentes: confira valores e formatos locais.'] };
  assert.equal(alertType('Tags: adicionado "<i>" (1×).'), 'Tags');
  assert.equal(alertType('Tradução vazia.'), 'Tradução vazia');
  assert.equal(matchesAlert(row, 'Tags'), true);
  assert.equal(matchesAlert(row, 'Números divergentes'), true);
  assert.equal(matchesAlert(row, 'Tradução vazia'), false);
  assert.equal(matchesAlert(row, ''), true);
  assert.equal(matchesAlert(row, '__none__'), false);
  assert.equal(matchesAlert({ issues: [] }, '__none__'), true);
});
test('translation audit keeps missing translations and structural alerts prominent', () => {
  assert.equal(inspect({ source: 'Hello', target: '' }).priority, 'Alta');
  assert.equal(inspect({ source: 'Hello {name}', target: 'Olá' }).priority, 'Alta');
  assert.equal(inspect({ source: '5 files', target: '6 arquivos' }).priority, 'Alta');
  assert.equal(inspect({ source: '', target: '' }).priority, 'Não avaliado');
  assert.equal(inspect({ source: 'Name', target: 'Nome' }).priority, 'Sem alerta objetivo');
});

test('audit does not prioritize literal percent movement as a printf mismatch', () => {
  for (const [source, target] of [
    ['% shared a view with you.', '% compartilhou uma visualização com você.'],
    ['Added tag s%', 'Tag s% adicionada'],
  ]) {
    const result = inspect({ source, target });
    assert.equal(result.priority, 'Sem alerta objetivo');
    assert.deepEqual(result.issues, []);
  }
});

test('numeric comparison accepts English to Portuguese localization without hiding changed values', () => {
  const warnings = (source, target) => inspect({ source, target }).issues.filter((issue) => issue.startsWith('Números'));
  for (const [source, target] of [
    ['1,000 files', '1000 arquivos'], ['1,234.50 dollars', '1.234,50 dólares'],
    ['12.5% complete', '12,50% concluído'], ['1,000 files', '1\u00a0000 arquivos'],
    ['−12.5 degrees', '-12,5 graus'], ['5 files and 2 folders', '2 pastas e 5 arquivos'],
  ]) assert.deepEqual(warnings(source, target), [], `${source} → ${target}`);
  for (const [source, target] of [
    ['12.5%', '5,12%'], ['-5 degrees', '5 graus'], ['1,000 files', '1,000 arquivos'],
    ['5 files and 5 folders', '5 arquivos'], ['Version 1.2.3', 'Versão 1.3.2'], ['Code 001', 'Código 1'],
  ]) assert.equal(warnings(source, target).length, 1, `${source} → ${target}`);
});
test('relative semantic ordering never hides structural alerts or claims correctness', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ source: 'Hello', target: 'Olá', score: i / 10 }));
  rows[9].source = 'Hello {name}';
  rank(rows);
  assert.equal(rows[0].priority, 'Conferir'); assert.equal(rows[1].priority, 'Conferir');
  assert.equal(rows[8].priority, 'Sem alerta objetivo'); assert.equal(rows[9].priority, 'Alta');
  rank(rows); assert.equal(rows[0].issues.length, 1);
});
test('translation sessions reject malformed data and preserve partial analysis', () => {
  const session = { version: 1, file: { path: __filename, name: 'test.xlsx' }, fingerprint: 'a'.repeat(64), sheet: 'Sheet', source: 'EN', target: 'PT', identifier: '', model: '',
    rows: [{ line: 2, source: 'Hello', target: 'Olá', identifier: '', score: null, semanticIssue: 'Pendente', review: 'Não revisado' }] };
  assert.equal(validateTranslationSession(session), session);
  assert.throws(() => validateTranslationSession({ ...session, fingerprint: 'bad' }));
  assert.throws(() => validateTranslationSession({ ...session, rows: [{ ...session.rows[0], score: NaN }] }));
});
