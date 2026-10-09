const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('interface acompanha progresso e ignora respostas antigas sem expor HTML remoto', async () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { addEventListener() {}, textContent: '', hidden: false, disabled: false });
    return elements.get(id);
  };
  let receive;
  let resolveInitial;
  const auditoria = {
    onUpdateState: (callback) => { receive = callback; return () => {}; },
    getUpdateState: () => new Promise((resolve) => { resolveInitial = resolve; })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/updates.js'), 'utf8'), {
    document: { getElementById: get }, window: { auditoria, addEventListener() {} }
  });
  const state = { revision: 1, currentVersion: '1.0.3', status: 'available', message: '<b>1.0.4 disponível</b>', percent: 0 };
  receive(state);
  resolveInitial({ ...state, revision: 0, status: 'idle', message: 'Antigo' });
  await new Promise(setImmediate);
  assert.equal(get('current-version').textContent, '1.0.3');
  assert.equal(get('update-status').textContent, '<b>1.0.4 disponível</b>');
  assert.equal(get('download-update').hidden, false);
  assert.equal(get('install-update').hidden, true);
  receive({ ...state, revision: 2, status: 'downloading', percent: 42 });
  assert.equal(get('update-progress').hidden, false);
  assert.equal(get('update-progress').value, 42);
  assert.equal(get('check-updates').disabled, true);
  receive({ ...state, revision: 3, status: 'downloaded', percent: 100 });
  assert.equal(get('install-update').hidden, false);
  assert.equal(get('download-update').hidden, true);
});
