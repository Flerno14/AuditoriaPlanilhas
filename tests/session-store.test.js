const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSession, writeSession } = require('../electron/session-store');

function sessionFor(dir) {
  return {
    version: 1, fingerprint: 'a'.repeat(64), sheet: 'Dados', newRows: 0,
    file1: { path: path.join(dir, '1.xlsx'), name: '1.xlsx', sheets: ['Dados'] },
    file2: { path: path.join(dir, '2.xlsx'), name: '2.xlsx', sheets: ['Dados'] },
    rules: { alignByFirstColumn: false, validateUniqueFirstColumn: true },
    report: [{ 'Índice/Linha': 2, 'Nome da Coluna': 'Nome', 'Valor no Arquivo 1': 'A',
      'Valor no Arquivo 2': 'B', 'Decisão': 'Pendente' }]
  };
}

test('async writes are serialized and a failed replacement preserves the previous session', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-session-'));
  try {
    const target = path.join(dir, 'session.json');
    const initial = sessionFor(dir);
    await writeSession(target, initial);
    const rename = fs.promises.rename;
    let entered, release;
    const started = new Promise((resolve) => { entered = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    let attempts = 0;
    t.mock.method(fs.promises, 'rename', async (...args) => {
      if (++attempts === 1) {
        entered();
        await blocked;
        throw new Error('Disco indisponível');
      }
      return rename(...args);
    });
    const failed = writeSession(target, { ...initial, newRows: 1 });
    const rejected = assert.rejects(failed, /Disco indisponível/);
    const latest = writeSession(target, { ...initial, newRows: 2 });
    await started;
    assert.equal(readSession(target).newRows, 0);
    assert.equal(attempts, 1);
    release();
    await rejected;
    await latest;
    assert.equal(attempts, 2);
    assert.equal(readSession(target).newRows, 2);
    assert.equal(fs.existsSync(`${target}.tmp`), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('session survives reload with typed cell values, rules and decisions', async () => {
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
    await writeSession(target, session);
    assert.deepEqual(readSession(target).report, session.report);
    session.report[0]['Decisão'] = 'Manter Arquivo 1';
    await writeSession(target, session);
    assert.deepEqual(readSession(target).rules, session.rules);
    assert.equal(readSession(target).report[0]['Decisão'], 'Manter Arquivo 1');
    session.report[0]['Decisão'] = 'Valor personalizado';
    await assert.rejects(() => writeSession(target, session), /decisões inválidas/);
    session.report[0]['Valor personalizado'] = '001\nTexto';
    await writeSession(target, session);
    assert.deepEqual(readSession(target).report, session.report);
    session.report[0]['Valor personalizado'] = '';
    await writeSession(target, session);
    assert.equal(readSession(target).report[0]['Valor personalizado'], '');
    assert.equal(fs.existsSync(`${target}.tmp`), false);
    await assert.rejects(() => writeSession(target, { ...session, version: 99 }), /incompatível/);
    assert.equal(readSession(target).version, 1);
    fs.writeFileSync(target, '{broken');
    assert.throws(() => readSession(target), /recuperar a sessão/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
