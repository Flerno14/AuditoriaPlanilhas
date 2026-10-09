const state = { file1: null, file2: null, report: [], newRows: 0, sheet: '' };
const settings = { templates: { differences: null, choices: null }, changeColor: '#FFA500' };
let settingsSnapshot = null;
let settingsSavedOnClose = false;
const $ = (id) => document.getElementById(id);
const columns = ['Índice/Linha', 'Nome da Coluna', 'Valor no Arquivo 1', 'Valor no Arquivo 2', 'Decisão'];

function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('visible'), 3600);
}
function showError(error) { notify(error?.message || String(error)); }
function display(value) { return value == null ? '' : String(value); }
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
  try {
    state.sheet = $('sheet').value;
    const result = await window.auditoria.callPython('compare', { file1: state.file1.path, file2: state.file2.path, sheet: state.sheet });
    state.report = result.report; state.newRows = result.newRows;
    renderRows(); updateSummary();
  } catch (error) { showError(error); }
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
    columns.slice(0, 4).forEach((key) => { const cell = row.insertCell(); cell.textContent = display(record[key]); cell.title = display(record[key]); });
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
  if (!state.report.length) { notify(emptyMessage); return; }
  if (action === 'export-choices' && state.report.some((row) => row['Decisão'] === 'Pendente')) { notify('Resolva todas as diferenças antes de exportar as escolhas.'); return; }
  try {
    const templateKey = action === 'export-differences' ? 'differences' : 'choices';
    const result = await window.auditoria.callPython(action, { report: state.report, templatePath: settings.templates[templateKey] });
    await saveContent(name, result.content, 'Arquivo salvo');
  } catch (error) { showError(error); }
}

async function generate(includeNewRows, markChanges) {
  if (!state.file1 || !state.file2) { notify('Selecione os dois arquivos Excel para continuar.'); return; }
  if (state.report.some((row) => row['Decisão'] === 'Pendente')) { notify('Resolva todas as diferenças antes de gerar o arquivo.'); return; }
  try {
    const result = await window.auditoria.callPython('generate', { file1: state.file1.path, file2: state.file2.path, sheet: state.sheet, name: state.file1.name, report: state.report, includeNewRows, markChanges, changeColor: settings.changeColor });
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
  document.documentElement.style.setProperty('--change-color', settings.changeColor);
}
$('open-settings').addEventListener('click', () => {
  settingsSnapshot = structuredClone(settings);
  settingsSavedOnClose = false;
  $('change-color').value = settings.changeColor;
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
document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', async () => {
  try { const file = await window.auditoria.openTemplate(); if (file) { settings.templates[button.dataset.template] = file.path; renderSettings(); } }
  catch (error) { showError(error); }
}));
document.querySelectorAll('[data-clear-template]').forEach((button) => button.addEventListener('click', () => { settings.templates[button.dataset.clearTemplate] = null; renderSettings(); }));
$('save-settings').addEventListener('click', async () => {
  try { Object.assign(settings, await window.auditoria.saveSettings({ templates: settings.templates, changeColor: $('change-color').value })); settingsSavedOnClose = true; renderSettings(); $('settings-dialog').close(); notify('Configurações salvas.'); }
  catch (error) { showError(error); }
});
window.auditoria.getSettings().then((saved) => { Object.assign(settings, saved); renderSettings(); }).catch(showError);
