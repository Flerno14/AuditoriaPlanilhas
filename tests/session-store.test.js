const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSession, writeSession } = require('../electron/session-store');

test('session survives reload with typed cell values, rules and decisions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-session-'));
  try {
    const target = path.join(dir, 'session.json');
    assert.equal(readSession(target), null);
    const session = {
      version: 1, fingerprint: 'a'.repeat(64), sheet: 'Dados', newRows: 2,
      file1: { path: path.join(dir, '1.xlsx'), name: '1.xlsx', sheets: ['Dados'] },
      file2: { path: path.join(dir, '2.xlsx'), name: '2.xlsx', sheets: ['Dados'] },
      rules: { alignByFirstColumn: true, validateUniqueFirstColumn: false },
      report: [{ 'Índice/Linha': 2, 'Nome da Coluna': 'Data', 'Valor no Arquivo 1': null,
        'Valor no Arquivo 2': { __excel_datetime__: '2026-01-01', date_only: true }, 'Decisão': 'Usar Arquivo 2' }]
    };
    writeSession(target, session);
    assert.deepEqual(readSession(target).report, session.report);
    session.report[0]['Decisão'] = 'Manter Arquivo 1';
    writeSession(target, session);
    assert.deepEqual(readSession(target).rules, session.rules);
    assert.equal(readSession(target).report[0]['Decisão'], 'Manter Arquivo 1');
    assert.equal(fs.existsSync(`${target}.tmp`), false);
    assert.throws(() => writeSession(target, { ...session, version: 99 }), /incompatível/);
    assert.equal(readSession(target).version, 1);
    fs.writeFileSync(target, '{broken');
    assert.throws(() => readSession(target), /recuperar a sessão/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
