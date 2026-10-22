const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the actual renderer handlers with a minimal DOM and mocked desktop API.
async function createReview({ aligned = false, decision = 'Usar Arquivo 2', savedSettings = {} } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const listeners = {};
      const attributes = {};
      elements.set(id, {
        value: '', checked: false, disabled: false, dataset: {},
        classList: { add() {}, remove() {} },
        addEventListener(name, handler) { listeners[name] = handler; },
        emit(name, extra = {}) { return listeners[name]?.({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra }); },
        focus() {}, getBoundingClientRect() { return this.rect || { left: 20, right: 210, top: 20, bottom: 54, width: 190 }; },
        dispatchEvent(event) { return this.emit(event.type); },
        replaceChildren(...children) { this.children = children; },
        insertRow() { const row = { cells: [], append(cell) { this.cells.push(cell); }, insertCell() { const listeners = {}; const cell = { append(...children) { (this.children ||= []).push(...children); }, setAttribute() {}, addEventListener(name, handler) { listeners[name] = handler; }, emit(name, extra = {}) { return listeners[name]?.({ target: this, preventDefault() {}, ...extra }); } }; this.cells.push(cell); return cell; } }; (this.children ||= []).push(row); return row; },
        setAttribute(name, value) { attributes[name] = value; },
        getAttribute(name) { return attributes[name] ?? null; },
        removeAttribute(name) { delete attributes[name]; }, showModal() { this.open = true; },
        close(value = '') { this.returnValue = value; this.open = false; return this.emit('close'); }
      });
    }
    return elements.get(id);
  }
  const calls = { saves: [], comparisons: [], confirmations: 0 };
  const controls = { confirm: false, sheets: ['Dados'], failSave: false, compareError: null, session: null, sessionError: null };
  calls.sessions = [];
  calls.generated = 0;
  controls.preview = { columns: ['ID'], rows: [{ line: 3, values: [2] }] };
  const windowListeners = {};
  const timers = new Map();
  let nextTimer = 0;
  calls.clones = 0;
  controls.runTimers = (delay) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay === delay) { timers.delete(id); timer.callback(); }
    }
  };
  const api = {
    onPythonProgress(callback) { controls.progress = callback; },
    async cancelPython() { calls.cancelled = true; },
    async getSettings() { return savedSettings; },
    async saveFile() { return 'saved.xlsx'; },
    async getSession() { return controls.session; },
    async clearSession() {
      if (controls.sessionError) throw new Error(controls.sessionError);
      calls.cleared = true; controls.session = null;
    },
    async saveSession(session) {
      if (controls.sessionError) throw new Error(controls.sessionError);
      calls.sessions.push(session);
      if (controls.onSessionSave) await controls.onSessionSave(session);
      return '2026-01-01T00:00:00Z';
    },
    async confirmDiscardReview() { calls.confirmations++; return controls.confirm; },
    async saveSettings(next) {
      if (controls.failSave) throw new Error('Falha ao salvar');
      calls.saves.push(next);
      return next;
    },
    async openFile() { return { path: 'novo.xlsx', name: 'novo.xlsx' }; },
    async callPython(action, payload) {
      if (action === 'row-details') {
        calls.details = payload;
        if (controls.detailsError) throw new Error(controls.detailsError);
        return controls.details;
      }
      if (action === 'preview-new-rows') return controls.preview;
      if (action === 'generate') { calls.generated++; calls.generation = payload; return { content: '', changes: 1, rows: 1 }; }
      if (action === 'validate-session') {
        if (controls.sessionError) throw new Error(controls.sessionError);
        return true;
      }
      if (action === 'sheets') return controls.sheets;
      assert.equal(action, 'compare');
      calls.comparisons.push(payload);
      if (controls.compareError) throw new Error(controls.compareError);
      return { report: [{ 'Decisão': 'Pendente' }], newRows: 0, fingerprint: 'a'.repeat(64) };
    }
  };
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, body: { append(node) { calls.menu = node; } }, createElement: () => {
      const listeners = {};
      return { dataset: {}, style: {}, children: [], offsetHeight: 140, setAttribute() {}, append(...children) { this.children.push(...children); },
        addEventListener(name, handler) { listeners[name] = handler; },
        emit(name) { return listeners[name]?.({ target: this, preventDefault() {} }); },
        getBoundingClientRect() { return this.rect || { left: 20, right: 210, top: 20, bottom: 54, width: 190 }; },
        focus() {}, remove() { this.removed = true; }, contains(target) { return this === target || this.children.includes(target); } };
    },
      querySelector: (selector) => ({ scrollIntoView() {}, focus() { calls.focused = selector; } }) },
    window: { auditoria: api, addEventListener: (name, handler) => { windowListeners[name] = handler; },
      removeEventListener: (name, handler) => { if (windowListeners[name] === handler) delete windowListeners[name]; },
      close: () => { calls.closed = true; } },
    structuredClone: (value) => { calls.clones++; return structuredClone(value); },
    innerWidth: 1280, innerHeight: 800, Event: class Event { constructor(type) { this.type = type; } },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    Option: function (text, value) { this.text = text; this.value = value; }
  });
  vm.runInContext(readFileSync(path.join(__dirname, '../renderer/text-diff.js'), 'utf8'), context);
  vm.runInContext(readFileSync(path.join(__dirname, '../renderer/translation-validation.js'), 'utf8'), context);
  vm.runInContext(readFileSync(path.join(__dirname, '../renderer/renderer.js'), 'utf8'), context);
  await vm.runInContext('initialization', context);
  vm.runInContext(`
    const actualRenderRows = renderRows;
    renderRows = () => {};
    state.file1 = { path: 'original.xlsx', name: 'original.xlsx', sheets: ['Dados', 'Outra'] };
    state.file2 = { path: 'modificado.xlsx', name: 'modificado.xlsx', sheets: ['Dados', 'Outra'] };
    state.sheet = 'Dados';
    state.comparisonReady = true;
    state.fingerprint = 'a'.repeat(64);
    state.report = [{ 'Decisão': ${JSON.stringify(decision)} }];
    settings.alignByFirstColumn = ${aligned};
  `, context);
  element('sheet').value = 'Dados';
  const read = (expression) => vm.runInContext(expression, context);
  const originalReport = read('state.report');
  return { element, calls, controls, read, originalReport, windowListeners };
}

test('custom popup saves, edits, merges cells, filters and undoes without losing originals', async () => {
  const r = await createReview();
  r.read(`state.report[0]['Valor no Arquivo 1'] = 'Ana'; state.report[0]['Valor no Arquivo 2'] = 'Bia'; openCustomDecision(0)`);
  assert.equal(r.element('custom-file1').value, 'Ana');
  assert.equal(r.element('custom-file2').value, 'Bia');
  r.element('custom-value').value = 'João';
  r.element('custom-cancel').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  r.read('openCustomDecision(0)');
  r.element('custom-value').value = 'João';
  r.element('custom-form').emit('submit');
  await r.read('flushSessionWrites()');
  assert.equal(r.calls.sessions.at(-1).report[0]['Valor personalizado'], 'João');
  r.read('actualRenderRows()');
  assert.equal(r.element('rows').children[0].cells.length, 4);
  assert.equal(r.element('rows').children[0].cells[2].colSpan, 2);
  assert.equal(r.element('rows').children[0].cells[2].textContent, 'João');
  r.element('search').value = 'joao';
  assert.equal(r.read('filteredReportIndices().length'), 1);
  r.read('openCustomDecision(0)');
  assert.equal(r.element('custom-value').value, 'João');
  r.element('custom-value').value = '';
  r.element('custom-form').emit('submit');
  assert.equal(r.read('filteredReportIndices().length'), 0);
  r.read('undoDecision()');
  assert.equal(r.read("state.report[0]['Valor personalizado']"), 'João');
  r.element('search').value = '';
  r.read("changeDecisions([0], 'Manter Arquivo 1'); actualRenderRows()");
  assert.equal(r.element('rows').children[0].cells.length, 5);
  assert.equal(r.element('rows').children[0].cells[2].textContent, 'Ana');
  assert.equal(r.element('rows').children[0].cells[3].textContent, 'Bia');
  r.read('undoDecision()');
  assert.equal(r.read("state.report[0]['Valor personalizado']"), 'João');
});

test('filename dates are replaced only after saving the preference, preserving review', async () => {
  const r = await createReview();
  const filename = (name) => r.read(`datedOutputName(${JSON.stringify(name)}, new Date(2026, 9, 12))`);
  assert.equal(filename('Planilha_20260817_corrigido.xlsm'), 'Planilha_20260817_corrigido_20261012.xlsm');
  r.element('open-settings').emit('click');
  r.element('replace-filename-dates').checked = true;
  r.element('replace-filename-dates').emit('change');
  assert.equal(r.read('settings.replaceFilenameDates'), false);
  r.element('cancel-settings').emit('click');
  assert.equal(r.read('settings.replaceFilenameDates'), false);
  r.element('open-settings').emit('click');
  r.element('replace-filename-dates').checked = true;
  r.controls.failSave = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.read('settings.replaceFilenameDates'), false);
  r.controls.failSave = false;
  await r.element('save-settings').emit('click');
  assert.equal(r.calls.saves.at(-1).replaceFilenameDates, true);
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.calls.confirmations, 0);
  assert.equal(filename('Planilha_20260817_corrigido.xlsm'), 'Planilha_20261012_corrigido.xlsm');
  assert.equal(filename('Planilha_20260817_corrigido_20260911.xlsx'), 'Planilha_20261012_corrigido_20261012.xlsx');
  assert.equal(filename('diferencas_entre_arquivos.xlsx'), 'diferencas_entre_arquivos_20261012.xlsx');
  assert.equal(filename('Planilha_20240229.xlsx'), 'Planilha_20261012.xlsx');
  assert.equal(filename('Planilha_20260229.xlsx'), 'Planilha_20260229_20261012.xlsx');
  assert.equal(filename('Planilha_1202608179.xlsx'), 'Planilha_1202608179_20261012.xlsx');
  r.element('open-settings').emit('click');
  assert.equal(r.element('replace-filename-dates').checked, true);
});

test('saving color and template preferences preserves decisions without comparing or prompting', async () => {
  const r = await createReview();
  r.element('open-settings').emit('click');
  r.element('change-color').value = '#123456';
  r.element('change-color').emit('input');
  r.read("settingsDraft.templates.differences = 'modelo.xlsx'");
  await r.element('save-settings').emit('click');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.read('state.comparisonReady'), true);
  assert.equal(r.read('settings.changeColor'), '#123456');
  assert.equal(r.read('settings.templates.differences'), 'modelo.xlsx');
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.calls.confirmations, 0);
});

test('canceling settings leaves active rules and review intact', async () => {
  const r = await createReview();
  r.element('open-settings').emit('click');
  r.element('align-first-column').checked = true;
  r.element('align-first-column').emit('change');
  assert.equal(r.read('settings.alignByFirstColumn'), false);
  r.element('cancel-settings').emit('click');
  assert.equal(r.read('settings.alignByFirstColumn'), false);
  assert.equal(r.read('state.report'), r.originalReport);
});

test('declining rule changes does not save or discard decisions', async () => {
  const r = await createReview();
  r.element('open-settings').emit('click');
  r.element('align-first-column').checked = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.calls.saves.length, 0);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.read('settings.alignByFirstColumn'), false);
  assert.equal(r.read('state.report'), r.originalReport);
});

test('accepting alignment changes compares once with the saved rules', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  r.element('open-settings').emit('click');
  r.element('align-first-column').checked = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.calls.comparisons.length, 1);
  assert.equal(r.calls.comparisons[0].alignByFirstColumn, true);
  assert.equal(r.read("state.report[0]['Decisão']"), 'Pendente');
});

for (const aligned of [false, true]) {
  test(`unique-key preference only compares when alignment is active (${aligned})`, async () => {
    const r = await createReview({ aligned });
    r.controls.confirm = true;
    r.element('open-settings').emit('click');
    r.element('validate-unique-first-column').checked = false;
    await r.element('save-settings').emit('click');
    assert.equal(r.calls.comparisons.length, aligned ? 1 : 0);
    assert.equal(r.calls.confirmations, aligned ? 1 : 0);
    if (!aligned) assert.equal(r.read('state.report'), r.originalReport);
  });
}

test('settings persistence failure preserves active rules and decisions', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  r.controls.failSave = true;
  r.element('open-settings').emit('click');
  r.element('align-first-column').checked = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.read('settings.alignByFirstColumn'), false);
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.element('save-settings').disabled, false);
});

test('declining a sheet change restores the selected sheet and review', async () => {
  const r = await createReview();
  r.element('sheet').value = 'Outra';
  await r.element('sheet').emit('change');
  assert.equal(r.element('sheet').value, 'Dados');
  assert.equal(r.read('state.sheet'), 'Dados');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
});

test('declining file replacement preserves the original file and review', async () => {
  const r = await createReview();
  await r.element('choose1').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.read('state.file1.path'), 'original.xlsx');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
});

test('incompatible file does not replace the current comparison context', async () => {
  const r = await createReview();
  r.controls.sheets = ['Incompativel'];
  await r.element('choose1').emit('click');
  assert.equal(r.read('state.file1.path'), 'original.xlsx');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.confirmations, 0);
});

test('accepted file replacement prompts once and compares the new file', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  await r.element('choose1').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.calls.comparisons.length, 1);
  assert.equal(r.calls.comparisons[0].file1, 'novo.xlsx');
});

test('manual comparison protects existing decisions', async () => {
  const r = await createReview();
  await r.element('compare').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
});

test('comparison with only pending differences does not require confirmation', async () => {
  const r = await createReview({ decision: 'Pendente' });
  await r.element('compare').emit('click');
  assert.equal(r.calls.confirmations, 0);
  assert.equal(r.calls.comparisons.length, 1);
});

test('structural errors appear only in the modal and leave export and generation unavailable', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.controls.compareError = 'Estruturas incompatíveis. Colunas exclusivas do Arquivo 2: Observação.';
  await r.element('compare').emit('click');
  assert.equal(r.read('state.comparisonReady'), false);
  assert.equal(r.read('state.report.length'), 0);
  assert.equal(r.element('error-dialog').open, true);
  assert.equal(r.element('error-description').textContent, r.controls.compareError);
  assert.ok(!r.element('summary').textContent.includes(r.controls.compareError));
  assert.notEqual(r.element('toast').textContent, r.controls.compareError);
  r.element('close-error').emit('click');
  assert.equal(r.element('error-dialog').open, false);
  await r.element('generate').emit('click');
  await r.element('export-differences').emit('click');
  assert.equal(r.calls.comparisons.length, 1);
});

test('error modal removes the Electron wrapper and can be reopened', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.controls.compareError = "Error invoking remote method 'python:call': Error: Estruturas incompatíveis.";
  await r.element('compare').emit('click');
  assert.equal(r.element('error-description').textContent, 'Estruturas incompatíveis.');
  r.element('close-error').emit('click');
  r.controls.compareError = 'Não foi possível ler o arquivo.';
  await r.element('compare').emit('click');
  assert.equal(r.element('error-dialog').open, true);
  assert.equal(r.element('error-description').textContent, r.controls.compareError);
});

test('bulk decisions are automatically saved and closing waits for persistence', async () => {
  const r = await createReview();
  r.element('bulk-choice').value = 'Manter Arquivo 1';
  r.element('apply').emit('click');
  let prevented = false;
  r.windowListeners.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await r.read('flushSessionWrites()');
  await Promise.resolve();
  assert.equal(r.calls.sessions.at(-1).report[0]['Decisão'], 'Manter Arquivo 1');
  assert.equal(r.calls.closed, true);
});

test('rapid decisions and undo debounce to one snapshot containing the latest review', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  r.read("changeDecisions([0], 'Usar Arquivo 2')");
  r.read('undoDecision()');
  assert.equal(r.calls.clones, 0);
  assert.equal(r.calls.sessions.length, 0);
  assert.equal(r.read('sessionDirty'), true);
  r.controls.runTimers(250);
  await r.read('sessionWrites');
  assert.equal(r.calls.clones, 1);
  assert.equal(r.calls.sessions.length, 1);
  assert.equal(r.calls.sessions[0].report[0]['Decisão'], 'Manter Arquivo 1');
  assert.equal(r.read('sessionDirty'), false);
});

test('a slow save keeps one latest pending revision and closing waits for both writes', async () => {
  const r = await createReview({ decision: 'Pendente' });
  const releases = [];
  r.controls.onSessionSave = () => new Promise((resolve) => releases.push(resolve));
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  r.controls.runTimers(250);
  await Promise.resolve();
  assert.equal(r.calls.sessions.length, 1);
  r.read("changeDecisions([0], 'Usar Arquivo 2')");
  r.read("changeDecisions([0], 'Pendente')");
  r.read("changeDecisions([0], 'Valor personalizado', 'Última escolha')");
  assert.equal(r.calls.clones, 1);
  assert.equal(r.calls.sessions[0].report[0]['Decisão'], 'Manter Arquivo 1');
  r.windowListeners.beforeunload({ preventDefault() {} });
  assert.notEqual(r.calls.closed, true);
  releases[0]();
  for (let i = 0; i < 10 && releases.length < 2; i++) await Promise.resolve();
  assert.equal(r.calls.sessions.length, 2);
  assert.equal(r.calls.clones, 2);
  assert.equal(r.calls.sessions[1].report[0]['Valor personalizado'], 'Última escolha');
  assert.equal(r.read('sessionDirty'), true);
  assert.notEqual(r.calls.closed, true);
  releases[1]();
  await r.read('sessionWrites');
  await Promise.resolve();
  assert.equal(r.calls.closed, true);
  assert.equal(r.read('sessionDirty'), false);
});

test('failure during a slow save retains the latest revision for manual retry', async () => {
  const r = await createReview({ decision: 'Pendente' });
  let rejectWrite;
  r.controls.onSessionSave = () => new Promise((_, reject) => { rejectWrite = reject; });
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  r.controls.runTimers(250);
  await Promise.resolve();
  r.read("changeDecisions([0], 'Valor personalizado', 'Mais recente')");
  rejectWrite(new Error('Disco indisponível'));
  await r.read('sessionWrites').catch(() => {});
  assert.equal(r.read('sessionDirty'), true);
  assert.equal(r.element('error-dialog').open, true);
  r.controls.onSessionSave = null;
  r.element('save-session').emit('click');
  await r.read('sessionWrites');
  assert.equal(r.calls.sessions.at(-1).report[0]['Valor personalizado'], 'Mais recente');
  assert.equal(r.read('sessionDirty'), false);
});

test('failed comparison preserves a debounced review for saving', async () => {
  const r = await createReview();
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  r.controls.confirm = true;
  r.controls.compareError = 'Comparação inválida';
  await r.element('compare').emit('click');
  r.controls.runTimers(250);
  await r.read('sessionWrites');
  assert.equal(r.calls.sessions[0].report[0]['Decisão'], 'Manter Arquivo 1');
  assert.equal(r.read('sessionDirty'), false);
});

test('clearing during debounce flushes and cancels the timer before deleting the session', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  await r.element('clear-files').emit('click');
  const writes = r.calls.sessions.length;
  assert.equal(writes, 1);
  assert.equal(r.calls.cleared, true);
  r.controls.runTimers(250);
  await Promise.resolve();
  assert.equal(r.calls.sessions.length, writes);
  assert.equal(r.read('pendingSessionSnapshot'), null);
});

test('session write failures keep the window open and allow retry', async () => {
  const r = await createReview();
  r.controls.sessionError = 'Disco indisponível';
  await r.read('saveReview()').catch(() => {});
  r.windowListeners.beforeunload({ preventDefault() {} });
  await r.read('flushSessionWrites()').catch(() => {});
  assert.notEqual(r.calls.closed, true);
  // An unsuccessful new comparison must not prevent retrying the last snapshot.
  r.read('state.comparisonReady = false; state.fingerprint = null');
  r.controls.sessionError = null;
  await r.element('save-session').emit('click');
  await r.read('flushSessionWrites()');
  assert.equal(r.read('sessionDirty'), false);
});

test('resume restores decisions and comparison rules without recalculating', async () => {
  const r = await createReview();
  await r.read('saveReview()');
  r.controls.session = structuredClone(r.calls.sessions[0]);
  r.controls.session.rules.alignByFirstColumn = true;
  r.controls.session.report[0]['Decisão'] = 'Manter Arquivo 1';
  r.controls.confirm = true;
  await r.element('resume-session').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Manter Arquivo 1');
  assert.equal(r.read('settings.alignByFirstColumn'), true);
  assert.equal(r.calls.comparisons.length, 0);
});

test('changed or missing sources do not replace the current review on resume', async () => {
  const r = await createReview();
  await r.read('saveReview()');
  r.controls.session = r.calls.sessions[0];
  r.controls.confirm = true;
  r.controls.sessionError = 'Os arquivos mudaram desde a comparação.';
  await r.element('resume-session').emit('click');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.element('error-description').textContent, r.controls.sessionError);
});

test('filtered bulk changes only matching rows and persists the untouched decisions', async () => {
  const r = await createReview();
  r.read(`state.report = [
    {'Nome da Coluna': 'Descrição', 'Decisão': 'Pendente'},
    {'Nome da Coluna': 'Preço', 'Decisão': 'Manter Arquivo 1'},
    {'Nome da Coluna': 'DESCRIÇÃO', 'Decisão': 'Pendente'}
  ]`);
  r.element('search').value = 'descricao';
  r.element('bulk-scope').value = 'filtered';
  r.element('bulk-choice').value = 'Usar Arquivo 2';
  r.element('apply').emit('click');
  await r.read('flushSessionWrites()');
  assert.deepEqual(Array.from(r.read("state.report.map(row => row['Decisão'])")),
    ['Usar Arquivo 2', 'Manter Arquivo 1', 'Usar Arquivo 2']);
  assert.equal(r.calls.sessions.at(-1).report[1]['Decisão'], 'Manter Arquivo 1');
});

test('case-sensitive search and no matches preserve excluded rows', async () => {
  const r = await createReview();
  r.read(`state.report = [
    {'Nome da Coluna': 'Descrição', 'Decisão': 'Pendente'},
    {'Nome da Coluna': 'DESCRIÇÃO', 'Decisão': 'Pendente'}
  ]`);
  r.element('match-case').setAttribute('aria-pressed', 'true');
  r.element('search').value = 'Descricao';
  r.element('bulk-scope').value = 'filtered';
  r.element('bulk-choice').value = 'Usar Arquivo 2';
  r.element('apply').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  assert.equal(r.read("state.report[1]['Decisão']"), 'Pendente');
  r.element('search').value = 'sem resultados';
  r.element('bulk-choice').value = 'Manter Arquivo 1';
  r.element('apply').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  assert.equal(r.read("state.report[1]['Decisão']"), 'Pendente');
  await r.read('flushSessionWrites()');
});

test('bulk scope all affects every decision even with an active search', async () => {
  const r = await createReview();
  r.read("state.report = [{'Decisão': 'Pendente'}, {'Decisão': 'Usar Arquivo 2'}]");
  r.element('search').value = 'sem resultados';
  r.element('bulk-scope').value = 'all';
  r.element('bulk-choice').value = 'Manter Arquivo 1';
  r.element('apply').emit('click');
  assert.deepEqual(Array.from(r.read("state.report.map(row => row['Decisão'])")), ['Manter Arquivo 1', 'Manter Arquivo 1']);
  await r.read('flushSessionWrites()');
});

test('pending decisions block generation and choices export before calling Python', async () => {
  const r = await createReview({ decision: 'Pendente' });
  await r.element('generate').emit('click');
  assert.match(r.element('toast').textContent, /Resolva todas/);
  await r.element('export-choices').emit('click');
  assert.match(r.element('toast').textContent, /Resolva todas/);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.calls.generated, 0);
});

test('decision and column filters intersect with search; undo restores a filtered batch', async () => {
  const r = await createReview();
  r.read(`state.report = [
    {'Nome da Coluna': 'Nome', 'Valor no Arquivo 2': 'José', 'Decisão': 'Pendente'},
    {'Nome da Coluna': 'Nome', 'Valor no Arquivo 2': 'José', 'Decisão': 'Manter Arquivo 1'},
    {'Nome da Coluna': 'Apelido', 'Valor no Arquivo 2': 'José', 'Decisão': 'Pendente'}
  ]`);
  r.element('search').value = 'jose';
  r.element('filter-column').value = 'Nome';
  r.element('filter-decision').value = 'Pendente';
  assert.deepEqual(Array.from(r.read('filteredReportIndices()')), [0]);
  r.element('bulk-scope').value = 'filtered';
  r.element('bulk-choice').value = 'Usar Arquivo 2';
  r.element('apply').emit('click');
  assert.deepEqual(Array.from(r.read('filteredReportIndices()')), []);
  r.element('filter-column').value = 'Apelido';
  r.element('undo-decision').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Pendente');
  assert.equal(r.read("state.report[1]['Decisão']"), 'Manter Arquivo 1');
  await r.read('flushSessionWrites()');
  assert.equal(r.calls.sessions.at(-1).report[0]['Decisão'], 'Pendente');
});

test('undo reverses individual and bulk actions in order and resets on comparison', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.read("changeDecisions([0], 'Usar Arquivo 2')");
  r.read("changeDecisions([0], 'Usar Arquivo 2')");
  assert.equal(r.read('undoHistory.length'), 1);
  r.element('bulk-scope').value = 'all';
  r.element('bulk-choice').value = 'Manter Arquivo 1';
  r.element('apply').emit('click');
  r.element('undo-decision').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  r.element('undo-decision').emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Pendente');
  assert.equal(r.element('undo-decision').disabled, true);
  r.read("changeDecisions([0], 'Usar Arquivo 2')");
  r.controls.confirm = true;
  await r.element('compare').emit('click');
  assert.equal(r.read('undoHistory.length'), 0);
  await r.read('flushSessionWrites()');
});

test('o menu de decisão mantém a escolha no relatório e permite desfazer', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.read(`state.report = [{ 'Índice/Linha': 5, 'Nome da Coluna': 'Nome',
    'Valor no Arquivo 1': 'Antes', 'Valor no Arquivo 2': 'Depois', 'Decisão': 'Pendente' }]`);
  r.read('actualRenderRows()');
  const button = r.element('rows').children[0].cells[4].children[0];
  assert.equal(button.className, 'decision');
  assert.equal(button.textContent, 'Pendente');
  button.emit('click');
  assert.deepEqual(r.calls.menu.children.map((item) => item.textContent), ['✓  Pendente', 'Manter Arquivo 1', 'Usar Arquivo 2', 'Valor personalizado']);
  r.calls.menu.children[3].emit('click');
  assert.equal(r.element('custom-dialog').open, true);
  assert.equal(r.read("state.report[0]['Decisão']"), 'Pendente');
  r.element('custom-cancel').emit('click');
  button.emit('click');
  r.calls.menu.children[2].emit('click');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  assert.equal(r.element('undo-decision').disabled, false);
});

test('double click opens full row details including custom decisions without modifying the review', async () => {
  const r = await createReview();
  const longText = '<b>Texto literal</b>\n' + 'Conteúdo longo '.repeat(100);
  r.controls.details = { columns: ['ID', 'Nome', 'Nota'], line1: 5, line2: 9,
    values1: [1, longText, 'Contexto'], values2: [1, 'Depois', null], missingColumns2: ['Nota'] };
  r.read(`state.report = [{ 'Índice/Linha': 5, 'Nome da Coluna': 'Nome',
    'Valor no Arquivo 1': 'Antes', 'Valor no Arquivo 2': 'Depois',
    'Decisão': 'Valor personalizado', 'Valor personalizado': 'Minha escolha' }]`);
  r.read('actualRenderRows()');
  await r.element('rows').children[0].cells[2].emit('dblclick');
  assert.equal(r.element('row-details-dialog').open, true);
  assert.equal(r.calls.details.line, 5);
  assert.equal(r.calls.details.fingerprint, 'a'.repeat(64));
  const rows = r.element('row-details-rows').children;
  assert.equal(rows.length, 3);
  assert.equal(rows[1].cells[1].textContent, longText);
  assert.equal(rows[1].cells[3].children[0].textContent, 'Valor personalizado:\nMinha escolha');
  assert.equal(rows[2].cells[2].textContent, '(coluna ausente)');
  assert.match(r.element('row-details-context').textContent, /Arquivo 2: linha 9/);
  r.element('row-details-close').emit('click');
  assert.equal(r.element('row-details-dialog').open, false);
  assert.equal(r.read("state.report[0]['Valor personalizado']"), 'Minha escolha');
  assert.equal(r.calls.sessions.length, 0);
});

test('row details can be opened by keyboard and failed source validation stays in the error modal', async () => {
  const r = await createReview();
  r.read(`state.report = [{ 'Índice/Linha': 2, 'Nome da Coluna': 'Nome', 'Decisão': 'Pendente' }]`);
  r.read('actualRenderRows()');
  r.controls.detailsError = 'Os arquivos mudaram desde a comparação.';
  await r.element('rows').children[0].cells[0].emit('dblclick');
  assert.equal(r.element('error-dialog').open, true);
  assert.equal(r.element('row-details-dialog').open, undefined);
  r.controls.detailsError = null;
  r.controls.details = { columns: ['Nome'], line1: 2, line2: 2, values1: ['A'], values2: ['B'], missingColumns2: [] };
  r.element('rows').children[0].cells[0].emit('keydown', { key: 'Enter' });
  for (let i = 0; i < 10 && !r.element('row-details-dialog').open; i++) await Promise.resolve();
  assert.equal(r.element('row-details-dialog').open, true);
  assert.equal(r.read("state.report[0]['Decisão']"), 'Pendente');
});

test('o filtro usa o mesmo menu e envia a mudança ao controle original', async () => {
  const r = await createReview({ decision: 'Pendente' });
  const select = r.element('filter-decision');
  select.options = [{ value: '', text: 'Todas as decisões' }, { value: 'Pendente', text: 'Pendente' }];
  r.read("enhanceNativeSelect($('filter-decision'))");
  select.emit('pointerdown');
  assert.equal(r.calls.menu.children[0].textContent, '✓  Todas as decisões');
  r.calls.menu.children[1].emit('click');
  assert.equal(select.value, 'Pendente');
  assert.equal(r.read('filteredReportIndices().length'), 1);
});

test('o menu acompanha rolagem e redimensionamento e fecha quando o seletor sai da tela', async () => {
  const r = await createReview();
  const select = r.element('filter-decision');
  select.options = [{ value: '', text: 'Todas as decisões' }, { value: 'Pendente', text: 'Pendente' }];
  r.read("enhanceNativeSelect($('filter-decision'))");
  select.emit('pointerdown');
  const menu = r.calls.menu;
  assert.equal(menu.style.top, '59px');
  select.rect = { left: 700, right: 890, top: 100, bottom: 134, width: 190 };
  r.windowListeners.scroll();
  assert.equal(menu.style.top, '139px');
  assert.equal(menu.style.left, '700px');
  r.read('innerWidth = 800');
  r.windowListeners.resize();
  assert.equal(menu.style.left, '602px');
  select.rect = { left: 20, right: 210, top: -100, bottom: -66, width: 190 };
  r.windowListeners.scroll();
  assert.equal(menu.removed, true);
  assert.equal(r.windowListeners.resize, undefined);
});

test('next pending navigates filtered rows and wraps around', async () => {
  const r = await createReview();
  r.read(`state.report = [
    {'Nome da Coluna': 'Nome', 'Decisão': 'Pendente'},
    {'Nome da Coluna': 'Outra', 'Decisão': 'Pendente'},
    {'Nome da Coluna': 'Nome', 'Decisão': 'Pendente'}
  ]`);
  r.element('filter-column').value = 'Nome';
  for (const index of [0, 2, 0]) {
    r.element('next-pending').emit('click');
    assert.equal(r.calls.focused, `.decision[data-index="${index}"]`);
  }
  r.element('filter-decision').value = 'Manter Arquivo 1';
  r.element('next-pending').emit('click');
  assert.match(r.element('toast').textContent, /Nenhuma pendência/);
});

test('summary counts changed cells separately from additional rows', async () => {
  const r = await createReview();
  r.read('state.newRows = 10; updateSummary()');
  assert.match(r.element('summary').textContent, /Células a alterar: 1\s/);
  assert.match(r.element('summary').textContent, /Linhas novas disponíveis: 10/);
});

for (const markChanges of [false, true]) {
test(`generation with marking=${markChanges} confirms new rows and supports cancellation`, async () => {
  const r = await createReview();
  r.element('mark-changes').checked = markChanges;
  r.read("settings.changeColor = '#123456'");
  r.read('state.newRows = 1');
  let generating = r.element('generate').emit('click');
  assert.equal(r.element('generation-dialog').open, true);
  assert.equal(r.calls.generated, 0);
  r.element('generation-confirm').emit('click');
  for (let i = 0; i < 10 && !r.element('preview-dialog').open; i++) await Promise.resolve();
  assert.equal(r.element('preview-dialog').open, true);
  assert.equal(r.calls.generated, 0);
  r.element('preview-close').emit('click');
  await generating;
  assert.equal(r.calls.generated, 0);
  generating = r.element('generate').emit('click');
  r.element('generation-confirm').emit('click');
  for (let i = 0; i < 10 && !r.element('preview-dialog').open; i++) await Promise.resolve();
  r.element('preview-confirm').emit('click');
  await generating;
  assert.equal(r.calls.generated, 1);
  assert.equal(r.calls.generation.includeNewRows, true);
  assert.equal(r.calls.generation.markChanges, markChanges);
  assert.equal(r.calls.generation.changeColor, '#123456');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
});
}

test('generation options cancel or Escape stops generation without changing decisions', async () => {
  const r = await createReview();
  for (const cancelButton of [true, false]) {
    const generating = r.element('generate').emit('click');
    assert.equal(r.element('generation-dialog').open, true);
    r.element('mark-changes').checked = true;
    if (cancelButton) r.element('generation-cancel').emit('click');
    else r.element('generation-dialog').close(); // Native Escape closes with no return value.
    await generating;
    assert.equal(r.calls.generated, 0);
    assert.equal(r.element('preview-dialog').open, undefined);
    assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
  }
});

test('generation options continue without new rows passes selected marking to Python', async () => {
  const r = await createReview();
  r.read('state.newRows = 0');
  const generating = r.element('generate').emit('click');
  r.element('mark-changes').checked = true;
  r.element('generation-confirm').emit('click');
  await generating;
  assert.equal(r.calls.generated, 1);
  assert.equal(r.calls.generation.markChanges, true);
  assert.equal(r.calls.generation.includeNewRows, true);
  assert.equal(r.element('preview-dialog').open, undefined);
});

test('preview paginates all additional rows', async () => {
  const r = await createReview();
  r.controls.preview.rows = Array.from({ length: 51 }, (_, i) => ({ line: i + 2, values: [i] }));
  const showing = r.element('preview-new-rows').emit('click');
  for (let i = 0; i < 10 && !r.element('preview-dialog').open; i++) await Promise.resolve();
  assert.equal(r.element('preview-rows').children.length, 50);
  r.element('preview-next').emit('click');
  assert.equal(r.element('preview-rows').children.length, 1);
  assert.equal(r.element('preview-next').disabled, true);
  r.element('preview-close').emit('click');
  await showing;
});

test('100,000 differences render only the selected page and reuse the filter result', async (t) => {
  const { performance } = require('node:perf_hooks');
  const r = await createReview();
  r.read(`state.report = Array.from({length: 100000}, (_, i) => ({
    'Índice/Linha': i + 2, 'Nome da Coluna': 'Descrição', 'Valor no Arquivo 1': 'Anterior',
    'Valor no Arquivo 2': 'Atualizado ' + i, 'Decisão': 'Pendente'
  })); renderRows = actualRenderRows; resetReviewTools()`);
  const start = performance.now();
  r.read('renderRows()');
  const firstMs = performance.now() - start;
  assert.equal(r.read('reportPageSize()'), 50);
  assert.equal(r.element('rows').children.length, 50);
  const filtered = r.read('filteredReportIndices()');
  const next = performance.now();
  r.element('page-next').emit('click');
  const nextMs = performance.now() - next;
  assert.equal(r.element('rows').children.length, 50);
  assert.equal(r.element('rows').children[0].cells[0].textContent, '52');
  assert.equal(r.read('filteredReportIndices()'), filtered);
  r.element('page-size').value = '250';
  r.element('page-size').emit('change');
  assert.equal(r.element('rows').children.length, 250);
  r.element('search').value = 'Atualizado 99999';
  const searchStart = performance.now();
  r.read('applyFilters()');
  const searchMs = performance.now() - searchStart;
  assert.equal(r.element('rows').children.length, 1);
  assert.equal(r.element('rows').children[0].cells[0].textContent, '100001');
  t.diagnostic(`100 mil diferenças, DOM simulado: primeira página ${firstMs.toFixed(1)} ms; próxima página ${nextMs.toFixed(1)} ms; primeira busca ${searchMs.toFixed(1)} ms.`);
});

test('filtered bulk scope and undo include rows outside the visible page', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.read("state.report = Array.from({length: 501}, () => ({'Nome da Coluna': 'Nome', 'Decisão': 'Pendente'})); resetReviewTools()");
  r.element('filter-column').value = 'Nome';
  r.element('bulk-scope').value = 'filtered';
  r.element('bulk-choice').value = 'Usar Arquivo 2';
  r.element('apply').emit('click');
  assert.equal(r.read("state.report.filter(row => row['Decisão'] === 'Usar Arquivo 2').length"), 501);
  r.element('undo-decision').emit('click');
  assert.equal(r.read("state.report.filter(row => row['Decisão'] === 'Pendente').length"), 501);
  await r.read('flushSessionWrites()');
});

test('next pending changes pages and decision filters invalidate cached results', async () => {
  const r = await createReview();
  r.read("state.report = Array.from({length: 151}, (_, i) => ({'Decisão': i === 150 ? 'Pendente' : 'Manter Arquivo 1'})); resetReviewTools()");
  r.element('next-pending').emit('click');
  assert.equal(r.read('reportPage'), 3);
  r.element('filter-decision').value = 'Pendente';
  assert.equal(r.read('filteredReportIndices().length'), 1);
  r.read("changeDecisions([150], 'Usar Arquivo 2')");
  assert.equal(r.read('filteredReportIndices().length'), 0);
  r.element('undo-decision').emit('click');
  assert.equal(r.read('filteredReportIndices().length'), 1);
  await r.read('flushSessionWrites()');
});

test('progress updates the active loading task and cancellation invokes desktop API', async () => {
  const r = await createReview();
  r.read("startLoading('Comparando...')");
  r.controls.progress('Preparando diferenças...');
  assert.equal(r.read('[...loadingTasks.values()].at(-1).message'), 'Preparando diferenças...');
  await r.element('cancel-processing').emit('click');
  assert.equal(r.calls.cancelled, true);
  r.read("showError(new Error('Operação cancelada.'))");
  assert.notEqual(r.element('error-dialog').open, true);
});

test('clearing files resets review and saved session after pending writes', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  r.read('saveReview()');
  await r.element('clear-files').emit('click');
  assert.equal(r.calls.cleared, true);
  assert.equal(r.read('state.file1'), null);
  assert.equal(r.read('state.file2'), null);
  assert.equal(r.read('state.report.length'), 0);
  assert.equal(r.read('state.comparisonReady'), false);
  assert.equal(r.read('sessionDirty'), false);
  assert.equal(r.element('sheet').disabled, true);
  assert.equal(r.element('file1-name').textContent, 'Nenhum arquivo selecionado');
});

test('declining clear or swap keeps the current selections and decisions', async () => {
  const r = await createReview();
  await r.element('clear-files').emit('click');
  await r.element('swap-files').emit('click');
  assert.notEqual(r.calls.cleared, true);
  assert.equal(r.read('state.file1.path'), 'original.xlsx');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
});

test('swapping files compares once with reversed paths and preserves selected sheet', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  await r.element('swap-files').emit('click');
  assert.equal(r.calls.confirmations, 1);
  assert.equal(r.calls.comparisons.length, 1);
  assert.equal(r.calls.comparisons[0].file1, 'modificado.xlsx');
  assert.equal(r.calls.comparisons[0].file2, 'original.xlsx');
  assert.equal(r.calls.comparisons[0].sheet, 'Dados');
  assert.equal(r.element('file1-name').textContent, 'modificado.xlsx');
  await r.read('flushSessionWrites()');
  assert.equal(r.calls.sessions.at(-1).file1.path, 'modificado.xlsx');
});

test('failed session removal preserves the review and swapping requires both files', async () => {
  const r = await createReview();
  r.controls.confirm = true;
  r.controls.sessionError = 'Não foi possível remover a sessão.';
  await r.element('clear-files').emit('click');
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.read('state.file1.path'), 'original.xlsx');
  r.read('state.file2 = null');
  await r.element('swap-files').emit('click');
  assert.equal(r.calls.comparisons.length, 0);
  assert.match(r.element('toast').textContent, /Selecione os dois/);
});

test('Excel dates display and filter as text in the table and new-row preview', async () => {
  const r = await createReview();
  r.read(`state.report = [{
    'Índice/Linha': 2, 'Nome da Coluna': 'Data',
    'Valor no Arquivo 1': {__excel_datetime__: '2026-02-03', date_only: true},
    'Valor no Arquivo 2': {__excel_datetime__: '2026-10-11T14:30:45', date_only: false},
    'Decisão': 'Pendente'
  }]; renderRows = actualRenderRows; resetReviewTools(); renderRows()`);
  const cells = r.element('rows').children[0].cells;
  assert.equal(cells[2].textContent, '2026-02-03');
  assert.equal(cells[3].textContent, '2026-10-11 14:30:45');
  r.element('search').value = '14:30:45';
  assert.deepEqual(Array.from(r.read('filteredReportIndices()')), [0]);
  r.read(`previewData = {columns: ['Data'], rows: [{line: 3, values: [state.report[0]['Valor no Arquivo 2']]}]}; renderPreview()`);
  assert.equal(r.element('preview-rows').children[0].cells[1].textContent, '2026-10-11 14:30:45');
  assert.equal(r.read("state.report[0]['Valor no Arquivo 2'].__excel_datetime__"), '2026-10-11T14:30:45');
});

test('translation validation is optional and settings preserve decisions on cancel, failure and save', async () => {
  const r = await createReview();
  r.read(`state.report[0]['Valor no Arquivo 1'] = 'Hello {name}'; state.report[0]['Valor no Arquivo 2'] = 'Olá';`);
  assert.equal(r.read('translationIssues(state.report[0]).length'), 0);
  r.element('open-settings').emit('click');
  r.element('validate-translation-elements').checked = true;
  r.element('cancel-settings').emit('click');
  assert.equal(r.read('settings.validateTranslationElements'), false);
  r.element('open-settings').emit('click');
  r.element('validate-translation-elements').checked = true;
  r.controls.failSave = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.read('settings.validateTranslationElements'), false);
  r.controls.failSave = false;
  await r.element('save-settings').emit('click');
  assert.equal(r.calls.saves.at(-1).validateTranslationElements, true);
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.calls.confirmations, 0);
  assert.equal(r.read('translationIssues(state.report[0]).length'), 1);
  r.read('actualRenderRows()');
  const warning = r.element('rows').children[0].cells[4].children[1];
  warning.emit('click');
  assert.equal(r.element('translation-dialog').open, true);
  assert.match(r.element('translation-warnings').textContent, /\{name\}/);
  r.element('translation-close').emit('click');
  assert.equal(r.element('translation-dialog').open, false);
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
});

test('translation warnings follow custom decisions and undo without blocking generation', async () => {
  const r = await createReview();
  r.read(`settings.validateTranslationElements = true; state.report[0]['Valor no Arquivo 1'] = '{name}'; state.report[0]['Valor no Arquivo 2'] = 'Nome';`);
  r.read("changeDecisions([0], 'Manter Arquivo 1')");
  assert.equal(r.read('translationIssues(state.report[0]).length'), 0);
  r.read('openCustomDecision(0)');
  r.element('custom-value').value = 'Olá {name}';
  r.element('custom-form').emit('submit');
  assert.equal(r.read('translationIssues(state.report[0]).length'), 0);
  r.read('undoDecision(); undoDecision()');
  assert.equal(r.read('translationIssues(state.report[0]).length'), 1);
  const generating = r.element('generate').emit('click');
  r.element('generation-confirm').emit('click');
  await generating;
  assert.equal(r.calls.generated, 1);
});

test('row details include literal translation warnings for the current decision', async () => {
  const r = await createReview();
  r.read(`settings.validateTranslationElements = true; Object.assign(state.report[0], {'Índice/Linha': 2, 'Nome da Coluna': 'Texto', 'Valor no Arquivo 1': '<b>{name}</b>', 'Valor no Arquivo 2': 'Olá'});`);
  r.controls.details = { columns: ['Texto'], line1: 2, line2: 2, values1: ['<b>{name}</b>'], values2: ['Olá'], missingColumns2: [] };
  await r.read('openRowDetails(0)');
  const review = r.element('row-details-rows').children[0].cells[3].children[0].textContent;
  assert.match(review, /Avisos de tradução/);
  assert.match(review, /<b>/);
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
});

test('text highlighting is persisted only on successful settings save without recomparing', async () => {
  const r = await createReview();
  assert.equal(r.read('settings.highlightTextDifferences'), false);
  r.element('open-settings').emit('click');
  r.element('highlight-text-differences').checked = true;
  r.element('highlight-text-differences').emit('change');
  r.element('cancel-settings').emit('click');
  assert.equal(r.read('settings.highlightTextDifferences'), false);
  r.element('open-settings').emit('click');
  r.element('highlight-text-differences').checked = true;
  r.controls.failSave = true;
  await r.element('save-settings').emit('click');
  assert.equal(r.read('settings.highlightTextDifferences'), false);
  r.controls.failSave = false;
  await r.element('save-settings').emit('click');
  assert.equal(r.calls.saves.at(-1).highlightTextDifferences, true);
  assert.equal(r.read('state.report'), r.originalReport);
  assert.equal(r.calls.comparisons.length, 0);
  assert.equal(r.calls.confirmations, 0);
  const reopened = await createReview({ savedSettings: { highlightTextDifferences: true } });
  assert.equal(reopened.read('settings.highlightTextDifferences'), true);
});

test('table highlights literal text and whitespace while keeping original review and custom cells', async () => {
  const r = await createReview({ savedSettings: { highlightTextDifferences: true } });
  r.read(`Object.assign(state.report[0], {'Valor no Arquivo 1': '<b>Olá, Ana!</b>', 'Valor no Arquivo 2': '<b>Olá,  Bia?\\n</b>'}); actualRenderRows()`);
  const text = (node) => node.children?.length ? node.children.map(text).join('') : node.textContent || '';
  const cells = r.element('rows').children[0].cells;
  assert.equal(text(cells[2]), '<b>Olá, Ana!</b>');
  assert.equal(text(cells[3]), '<b>Olá,  Bia?\n</b>');
  assert.ok(cells[2].children.some((node) => node.className === 'text-diff-removed'));
  const added = cells[3].children.filter((node) => node.className === 'text-diff-added');
  assert.ok(added.flatMap((node) => node.children).some((node) => node.dataset.symbol === '↵'));
  assert.equal(r.read("state.report[0]['Valor no Arquivo 1']"), '<b>Olá, Ana!</b>');
  assert.equal(r.calls.sessions.length, 0);
  r.read('openCustomDecision(0)');
  r.element('custom-value').value = 'Texto personalizado';
  r.element('custom-form').emit('submit');
  r.read('actualRenderRows()');
  assert.equal(r.element('rows').children[0].cells[2].textContent, 'Texto personalizado');
  assert.equal(r.element('rows').children[0].cells[2].colSpan, 2);
  r.read('undoDecision(); actualRenderRows()');
  assert.ok(r.element('rows').children[0].cells[2].children.length);
  r.read('settings.highlightTextDifferences = false; actualRenderRows()');
  assert.equal(r.element('rows').children[0].cells[2].textContent, '<b>Olá, Ana!</b>');
});

test('row popup decisions share undo and autosave and remain available across filters', async () => {
  const r = await createReview({ decision: 'Pendente' });
  r.read(`state.report = [
    {'Índice/Linha': 2, 'Nome da Coluna': 'A', 'Valor no Arquivo 1': '{name}', 'Valor no Arquivo 2': 'novo', 'Decisão': 'Pendente'},
    {'Índice/Linha': 2, 'Nome da Coluna': 'B', 'Valor no Arquivo 1': 'antes', 'Valor no Arquivo 2': 'depois', 'Decisão': 'Pendente'},
    {'Índice/Linha': 3, 'Nome da Coluna': 'A', 'Decisão': 'Pendente'}]; settings.validateTranslationElements = true;`);
  r.controls.details = { columns: ['A', 'B', 'Contexto'], line1: 2, line2: 2, values1: ['{name}', 'antes', 'igual'], values2: ['novo', 'depois', 'igual'], missingColumns2: [] };
  r.element('filter-decision').value = 'Pendente';
  await r.read('openRowDetails(0)');
  const rows = r.element('row-details-rows').children;
  const status = rows[0].cells[3].children[0];
  const anchor = rows[0].cells[3].children[1];
  const buttons = [0, 1, 2, 3].map((index) => ({ emit() { anchor.emit('click'); r.calls.menu.children[index].emit('click'); } }));
  assert.equal(rows[2].cells[3].children[1].textContent, 'Manter Arquivo 1');
  buttons[1].emit('click');
  assert.equal(anchor.textContent, 'Manter Arquivo 1');
  assert.equal(r.element('row-details-dialog').open, true);
  assert.equal(r.read("state.report[1]['Decisão']"), 'Pendente');
  buttons[2].emit('click');
  assert.match(status.textContent, /Avisos de tradução/);
  buttons[3].emit('click');
  r.element('custom-value').value = 'Olá {name}';
  r.element('custom-form').emit('submit');
  assert.equal(status.textContent, 'Valor personalizado:\nOlá {name}');
  assert.equal(r.element('row-details-dialog').open, true);
  buttons[3].emit('click');
  r.element('custom-value').value = 'cancelado';
  r.element('custom-cancel').emit('click');
  assert.equal(r.read("state.report[0]['Valor personalizado']"), 'Olá {name}');
  buttons[3].emit('click');
  r.element('custom-value').value = 'não confirmar';
  r.element('custom-dialog').emit('keydown', { key: 'Escape' });
  assert.equal(r.element('custom-dialog').open, false);
  assert.equal(r.element('row-details-dialog').open, true);
  assert.equal(r.read("state.report[0]['Valor personalizado']"), 'Olá {name}');
  buttons[0].emit('click');
  assert.equal(r.read("state.report[0]['Valor personalizado']"), undefined);
  r.element('row-details-undo').emit('click');
  assert.equal(status.textContent, 'Valor personalizado:\nOlá {name}');
  await r.read('flushSessionWrites()');
  assert.equal(r.calls.sessions.at(-1).report[0]['Valor personalizado'], 'Olá {name}');
  assert.equal(r.calls.sessions.at(-1).report[2]['Decisão'], 'Pendente');
  r.element('row-details-close').emit('click');
  assert.equal(r.read('rowDecisionView'), null);
  r.read('undoDecision()');
  assert.equal(r.read("state.report[0]['Decisão']"), 'Usar Arquivo 2');
});

test('popup menus edit identical cells lazily, cancel without records, and undo removes manual additions', async () => {
  const r = await createReview();
  r.read(`Object.assign(state.report[0], {'Índice/Linha':2,'Nome da Coluna':'Diff'});`);
  r.controls.details = { columns: ['Same', 'Diff', 'Only'], line1: 2, line2: 2, values1: ['igual', 'a', 'original'], values2: ['igual', 'b', null], missingColumns2: ['Only'] };
  await r.read('openRowDetails(0)');
  const rows = r.element('row-details-rows').children;
  const choose = (row, choice) => { rows[row].cells[3].children[1].emit('click'); r.calls.menu.children[choice].emit('click'); };
  assert.equal(r.read('state.report.length'), 1);
  choose(0, 3);
  r.element('custom-value').value = 'cancelado';
  r.element('custom-cancel').emit('click');
  assert.equal(r.read('state.report.length'), 1);
  choose(0, 3);
  r.element('custom-value').value = 'novo';
  r.element('custom-form').emit('submit');
  await r.read('flushSessionWrites()');
  assert.equal(r.calls.sessions.at(-1).report[1]['Valor personalizado'], 'novo');
  assert.equal(r.read('state.report.length'), 2);
  r.element('row-details-undo').emit('click');
  assert.equal(r.read('state.report.length'), 1);
  assert.equal(rows[0].cells[3].children[1].textContent, 'Manter Arquivo 1');
  choose(0, 3);
  assert.equal(r.element('custom-value').value, '');
  r.element('custom-cancel').emit('click');
  choose(0, 0);
  assert.equal(r.read("state.report[1]['Decisão']"), 'Pendente');
  rows[2].cells[3].children[1].emit('click');
  assert.equal(r.calls.menu.children[2].disabled, true);
  r.calls.menu.children[3].emit('click');
  r.element('custom-value').value = 'coluna exclusiva';
  r.element('custom-form').emit('submit');
  assert.equal(r.read('state.report.length'), 3);
});
