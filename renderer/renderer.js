const state = { file1: null, file2: null, report: [], newRows: 0, sheet: '', compareRequestId: 0, comparisonReady: false };
const settings = { templates: { differences: null, choices: null }, changeColor: '#FFA500', alignByFirstColumn: false, validateUniqueFirstColumn: true };
let settingsSnapshot = null;
let settingsSavedOnClose = false;
const loadingTasks = new Map();
let nextLoadingTaskId = 0;
const loadingDisplayDelayMs = 600;
const $ = (id) => document.getElementById(id);
const columns = ['Índice/Linha', 'Nome da Coluna', 'Valor no Arquivo 1', 'Valor no Arquivo 2', 'Decisão'];

function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('visible'), 3600);
}
function updateLoadingOverlay() {
  const visibleTasks = [...loadingTasks.values()].filter((task) => task.visible);
  if (!visibleTasks.length) {
    $('loading-overlay').hidden = true;
    $('app-shell')?.removeAttribute('aria-busy');
    return;
  }
  $('loading-message').textContent = visibleTasks.at(-1).message;
  $('loading-overlay').hidden = false;
  $('app-shell')?.setAttribute('aria-busy', 'true');
}
function startLoading(message) {
  const taskId = ++nextLoadingTaskId;
  const task = { message, visible: false, timer: null };
  loadingTasks.set(taskId, task);
  task.timer = setTimeout(() => {
    if (!loadingTasks.has(taskId)) return;
    task.visible = true;
    updateLoadingOverlay();
  }, loadingDisplayDelayMs);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    clearTimeout(task.timer);
    loadingTasks.delete(taskId);
    updateLoadingOverlay();
  };
}
function showError(error) { notify(error?.message || String(error)); }
function display(value) { return value == null ? '' : String(value); }
function visuallyCollapsed(value) {
  return value.normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function exposeInvisibleWhitespace(value) {
  return value
    .replace(/\r\n|\r|\n/g, '↵')
    .replace(/\t/g, '⇥')
    .replace(/\u00A0/g, '⟦NBSP⟧')
    .replace(/[\u200B-\u200D\uFEFF]/g, (char) => `⟦U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟧`)
    .replace(/^ +| +$/g, (spaces) => '␠'.repeat(spaces.length))
    .replace(/ {2,}/g, (spaces) => '␠'.repeat(spaces.length));
}
function comparisonDisplay(value, other) {
  const text = display(value);
  const otherText = display(other);
  if (text !== otherText && typeof value === 'string' && typeof other === 'string' && visuallyCollapsed(text) === visuallyCollapsed(otherText)) {
    return exposeInvisibleWhitespace(text);
  }
  if (text === otherText && typeof value !== typeof other) {
    const type = typeof value === 'string' ? 'texto' : typeof value === 'number' ? 'número' : typeof value;
    return `${text} ⟦${type}⟧`;
  }
  return text;
}
function searchValue(value) {
  const text = display(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return $('match-case').getAttribute('aria-pressed') === 'true' ? text : text.toLocaleLowerCase('pt-BR');
}
function filteredReportIndices() {
  const query = searchValue($('search').value.trim());
  return state.report.flatMap((record, index) =>
    !query || columns.some((key) => searchValue(record[key]).includes(query)) ? [index] : []
  );
}

async function selectFile(slot) {
  try {
    const file = await window.auditoria.openFile(slot);
    if (!file) return;
    const finishLoading = startLoading('Lendo as abas da planilha...');
    try {
      file.sheets = await window.auditoria.callPython('sheets', { path: file.path });
    } finally { finishLoading(); }
    state[`file${slot}`] = file;
    $(`file${slot}-name`).textContent = file.name;
    $(`file${slot}-name`).title = file.path;
    if (state.file1 && state.file2) {
      const common = state.file1.sheets.filter((sheet) => state.file2.sheets.includes(sheet));
      if (!common.length) throw new Error('Os arquivos não possuem abas com o mesmo nome.');
      const sheet = $('sheet'); sheet.replaceChildren(...common.map((name) => new Option(name, name)));
      sheet.disabled = false;
      if (!common.includes(state.sheet)) state.sheet = common[0];
      sheet.value = state.sheet;
      await compare();
    }
  } catch (error) { showError(error); }
}

async function compare() {
  if (!state.file1 || !state.file2 || !$('sheet').value) return;
  const requestId = ++state.compareRequestId;
  const context = {
    file1: state.file1.path,
    file2: state.file2.path,
    sheet: $('sheet').value,
    alignByFirstColumn: settings.alignByFirstColumn,
    validateUniqueFirstColumn: settings.validateUniqueFirstColumn
  };
  state.sheet = context.sheet;
  $('compare-hint').textContent = context.alignByFirstColumn
    ? 'Registros alinhados pelo valor da primeira coluna.'
    : 'As linhas são comparadas por posição. Se foram reordenadas, ative “Alinhar pela primeira coluna” nas configurações.';
  state.report = [];
  state.newRows = 0;
  state.comparisonReady = false;
  renderRows();
  updateSummary('Comparando planilhas...');
  const finishLoading = startLoading('Comparando planilhas...');
  try {
    const result = await window.auditoria.callPython('compare', context);
    if (requestId !== state.compareRequestId) return;
    if (context.file1 !== state.file1?.path || context.file2 !== state.file2?.path || context.sheet !== $('sheet').value || context.alignByFirstColumn !== settings.alignByFirstColumn || context.validateUniqueFirstColumn !== settings.validateUniqueFirstColumn) return;
    state.report = result.report; state.newRows = result.newRows;
    state.comparisonReady = true;
    renderRows(); updateSummary();
  } catch (error) {
    if (requestId !== state.compareRequestId) return;
    showError(error);
    updateSummary('Não foi possível comparar as planilhas. Tente comparar novamente.');
  } finally { finishLoading(); }
}

function renderRows() {
  const body = $('rows'); body.replaceChildren();
  const indices = filteredReportIndices();
  $('filter-count').textContent = `${indices.length} de ${state.report.length} diferenças`;
  if (!state.report.length) {
    const row = body.insertRow(); row.className = 'empty'; const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = 'Nenhuma diferença encontrada nesta aba.'; return;
  }
  if (!indices.length) {
    const row = body.insertRow(); row.className = 'empty'; const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = 'Nenhuma diferença corresponde à pesquisa.'; return;
  }
  indices.forEach((index) => {
    const record = state.report[index];
    const row = body.insertRow();
    columns.slice(0, 4).forEach((key, columnIndex) => {
      const cell = row.insertCell();
      const value = record[key];
      const other = columnIndex === 2 ? record[columns[3]] : columnIndex === 3 ? record[columns[2]] : undefined;
      const text = columnIndex >= 2 ? comparisonDisplay(value, other) : display(value);
      cell.textContent = text;
      cell.title = text === display(value) ? text : JSON.stringify(display(value));
    });
    const choice = row.insertCell(); const button = document.createElement('button');
    button.className = 'decision'; button.textContent = record['Decisão']; button.dataset.index = index;
    button.addEventListener('click', (event) => openDecision(event, index)); choice.append(button);
  });
}

function openDecision(event, index) {
  document.querySelector('.decision-menu')?.remove();
  const menu = document.createElement('div'); menu.className = 'decision-menu';
  menu.style.left = `${Math.min(event.clientX, innerWidth - 215)}px`; menu.style.top = `${Math.min(event.clientY + 8, innerHeight - 150)}px`;
  ['Pendente', 'Manter Arquivo 1', 'Usar Arquivo 2'].forEach((choice) => {
    const button = document.createElement('button'); button.textContent = `${choice === state.report[index]['Decisão'] ? '✓  ' : ''}${choice}`;
    button.addEventListener('click', () => { state.report[index]['Decisão'] = choice; menu.remove(); renderRows(); updateSummary(); }); menu.append(button);
  });
  document.body.append(menu);
  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 0);
}

function updateSummary(message) {
  if (message) { $('summary').textContent = message; return; }
  const decisions = state.report.map((row) => row['Decisão']);
  const pending = decisions.filter((x) => x === 'Pendente').length;
  const use2 = decisions.filter((x) => x === 'Usar Arquivo 2').length + state.newRows;
  const keep1 = decisions.filter((x) => x === 'Manter Arquivo 1').length;
  $('summary').textContent = `Diferenças: ${state.report.length}   |   Pendentes: ${pending}   |   Usar Arquivo 2: ${use2}   |   Manter Arquivo 1: ${keep1}   |   Novas linhas adicionadas automaticamente: ${state.newRows}`;
}

function applyAll() {
  const indices = $('bulk-scope').value === 'filtered'
    ? filteredReportIndices()
    : state.report.map((_row, index) => index);
  indices.forEach((index) => { state.report[index]['Decisão'] = $('bulk-choice').value; });
  renderRows(); updateSummary();
  notify(`${indices.length} diferença(s) atualizada(s).`);
}

async function saveContent(name, content, message) {
  const saved = await window.auditoria.saveFile(name, content);
  if (saved) { notify(`${message}: ${saved}`); return saved; }
  return null;
}

async function exportReport(action, name, emptyMessage) {
  if (!state.comparisonReady) { notify('Aguarde a conclusão da comparação antes de exportar.'); return; }
  if (!state.report.length) { notify(emptyMessage); return; }
  if (action === 'export-choices' && state.report.some((row) => row['Decisão'] === 'Pendente')) { notify('Resolva todas as diferenças antes de exportar as escolhas.'); return; }
  try {
    const templateKey = action === 'export-differences' ? 'differences' : 'choices';
    const finishLoading = startLoading(action === 'export-differences' ? 'Exportando diferenças...' : 'Exportando escolhas...');
    let result;
    try {
      result = await window.auditoria.callPython(action, { report: state.report, templatePath: settings.templates[templateKey] });
    } finally { finishLoading(); }
    await saveContent(name, result.content, 'Arquivo salvo');
  } catch (error) { showError(error); }
}

async function generate(includeNewRows, markChanges) {
  if (!state.file1 || !state.file2) { notify('Selecione os dois arquivos Excel para continuar.'); return; }
  if (!state.comparisonReady) { notify('Aguarde a conclusão da comparação antes de gerar o arquivo.'); return; }
  if (state.report.some((row) => row['Decisão'] === 'Pendente')) { notify('Resolva todas as diferenças antes de gerar o arquivo.'); return; }
  try {
    const finishLoading = startLoading(includeNewRows ? 'Gerando arquivo corrigido...' : 'Salvando alterações...');
    let result;
    try {
      result = await window.auditoria.callPython('generate', { file1: state.file1.path, file2: state.file2.path, sheet: state.sheet, name: state.file1.name, report: state.report, includeNewRows, markChanges, changeColor: settings.changeColor, alignByFirstColumn: settings.alignByFirstColumn, validateUniqueFirstColumn: settings.validateUniqueFirstColumn });
    } finally { finishLoading(); }
    const suffix = includeNewRows ? '_corrigido' : '_somente_alteracoes';
    const base = state.file1.name.replace(/\.[^.]+$/, ''); const ext = state.file1.name.match(/\.[^.]+$/)?.[0] || '.xlsx';
    const saved = await saveContent(`${base}${suffix}${ext}`, result.content, 'Arquivo salvo');
    if (saved) updateSummary(`Arquivo gerado: ${result.changes} célula(s) alterada(s), ${result.rows} linha(s) nova(s) adicionada(s).`);
  } catch (error) { showError(error); }
}

$('choose1').addEventListener('click', () => selectFile(1)); $('choose2').addEventListener('click', () => selectFile(2));
$('compare').addEventListener('click', compare); $('sheet').addEventListener('change', compare); $('apply').addEventListener('click', applyAll);
$('search').addEventListener('input', renderRows);
$('match-case').addEventListener('click', (event) => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  renderRows();
});
$('export-differences').addEventListener('click', () => exportReport('export-differences', 'diferencas_entre_arquivos.xlsx', 'Não há diferenças para exportar.'));
$('export-choices').addEventListener('click', () => exportReport('export-choices', 'mudancas_aplicadas.xlsx', 'Não há escolhas para exportar.'));
$('save-changes').addEventListener('click', () => generate(false, true)); $('generate').addEventListener('click', () => generate(true, false));

function renderSettings() {
  for (const key of ['differences', 'choices']) $(`template-${key}-name`).textContent = settings.templates[key] ? settings.templates[key].split(/[\\/]/).pop() : 'Nenhum modelo selecionado';
  $('change-color').value = settings.changeColor;
  $('change-color-value').textContent = settings.changeColor;
  $('align-first-column').checked = Boolean(settings.alignByFirstColumn);
  $('validate-unique-first-column').checked = settings.validateUniqueFirstColumn !== false;
  $('validate-unique-first-column').disabled = !settings.alignByFirstColumn;
}
$('open-settings').addEventListener('click', () => {
  settingsSnapshot = structuredClone(settings);
  settingsSavedOnClose = false;
  $('change-color').value = settings.changeColor;
  $('align-first-column').checked = Boolean(settings.alignByFirstColumn);
  $('validate-unique-first-column').checked = settings.validateUniqueFirstColumn !== false;
  $('validate-unique-first-column').disabled = !settings.alignByFirstColumn;
  $('settings-dialog').showModal();
});
$('cancel-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-dialog').addEventListener('close', () => {
  if (!settingsSavedOnClose && settingsSnapshot) {
    Object.assign(settings, settingsSnapshot);
    renderSettings();
  }
  settingsSnapshot = null;
});
$('change-color').addEventListener('input', (event) => { $('change-color-value').textContent = event.target.value.toUpperCase(); });
$('align-first-column').addEventListener('change', (event) => {
  settings.alignByFirstColumn = event.target.checked;
  $('validate-unique-first-column').disabled = !event.target.checked;
});
$('validate-unique-first-column').addEventListener('change', (event) => { settings.validateUniqueFirstColumn = event.target.checked; });
document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', async () => {
  try { const file = await window.auditoria.openTemplate(); if (file) { settings.templates[button.dataset.template] = file.path; renderSettings(); } }
  catch (error) { showError(error); }
}));
document.querySelectorAll('[data-clear-template]').forEach((button) => button.addEventListener('click', () => { settings.templates[button.dataset.clearTemplate] = null; renderSettings(); }));
$('save-settings').addEventListener('click', async () => {
  try { Object.assign(settings, await window.auditoria.saveSettings({ templates: settings.templates, changeColor: $('change-color').value, alignByFirstColumn: $('align-first-column').checked, validateUniqueFirstColumn: $('validate-unique-first-column').checked })); settingsSavedOnClose = true; renderSettings(); $('settings-dialog').close(); if (state.file1 && state.file2) await compare(); notify('Configurações salvas.'); }
  catch (error) { showError(error); }
});
window.auditoria.getSettings().then((saved) => { Object.assign(settings, saved); renderSettings(); }).catch(showError);
