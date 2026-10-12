const state = { file1: null, file2: null, report: [], newRows: 0, sheet: '', compareRequestId: 0, comparisonReady: false, fingerprint: null };
let sessionWrites = Promise.resolve();
let sessionRevision = 0;
let sessionDirty = false;
let pendingSessionSnapshot = null;
let closingAfterSave = false;
let restoringSession = false;
let undoHistory = [];
let pendingCursor = -1;
let previewData = null;
let previewPage = 0;
let previewResolve = null;
let previewBusy = false;
let changingFiles = false;
let reportPage = 0;
let reportRevision = 0;
let filterCache = null;
let searchCache = new WeakMap();
let searchTimer;
function reportPageSize() { return [50, 100, 250].includes(Number($('page-size').value)) ? Number($('page-size').value) : 50; }
const settings = { templates: { differences: null, choices: null }, changeColor: '#FFA500', alignByFirstColumn: false, validateUniqueFirstColumn: true };
let settingsDraft = null;
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
function showError(error) {
  const message = (error?.message || String(error))
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  if (message === 'Operação cancelada.') { notify(message); return; }
  clearTimeout(notify.timer);
  $('toast').classList.remove('visible');
  $('error-description').textContent = message;
  const dialog = $('error-dialog');
  if (!dialog.open) dialog.showModal();
}
$('close-error').addEventListener('click', () => $('error-dialog').close());
window.auditoria.onPythonProgress((stage) => {
  const task = [...loadingTasks.values()].at(-1);
  if (task) { task.message = stage; updateLoadingOverlay(); }
});
$('cancel-processing').addEventListener('click', async () => {
  try { await window.auditoria.cancelPython(); }
  catch (error) { showError(error); }
});

function saveReview() {
  const currentReady = state.comparisonReady && state.fingerprint;
  if (!currentReady && !sessionDirty) return sessionWrites;
  const snapshot = currentReady ? structuredClone({
    version: 1, file1: state.file1, file2: state.file2, sheet: state.sheet,
    report: state.report, newRows: state.newRows, fingerprint: state.fingerprint,
    rules: { alignByFirstColumn: settings.alignByFirstColumn, validateUniqueFirstColumn: settings.validateUniqueFirstColumn }
  }) : pendingSessionSnapshot;
  if (!snapshot) return sessionWrites;
  pendingSessionSnapshot = snapshot;
  const revision = ++sessionRevision;
  sessionDirty = true;
  $('session-status').textContent = 'Salvando revisão...';
  sessionWrites = sessionWrites.catch(() => {}).then(() => window.auditoria.saveSession(snapshot));
  sessionWrites.then(() => {
    if (revision === sessionRevision) {
      sessionDirty = false;
      $('session-status').textContent = 'Revisão salva automaticamente neste computador.';
    }
  }).catch((error) => {
    if (revision === sessionRevision) {
      $('session-status').textContent = 'Revisão ainda não salva. Use “Salvar sessão” para tentar novamente.';
      showError(error);
    }
  });
  return sessionWrites;
}

async function restoreReview() {
  if (restoringSession) return;
  restoringSession = true;
  const shell = $('app-shell');
  shell.inert = true;
  const finishLoading = startLoading('Recuperando revisão salva...');
  try {
    await sessionWrites.catch(() => {});
    const saved = await window.auditoria.getSession();
    if (!saved) { $('session-status').textContent = 'Nenhuma sessão salva neste computador.'; return; }
    if (!await confirmDiscardReview()) return;
    await window.auditoria.callPython('validate-session', {
      file1: saved.file1.path, file2: saved.file2.path, sheet: saved.sheet,
      fingerprint: saved.fingerprint, ...saved.rules
    });
    Object.assign(state, { file1: saved.file1, file2: saved.file2, sheet: saved.sheet,
      report: saved.report, newRows: saved.newRows, fingerprint: saved.fingerprint, comparisonReady: true });
    state.compareRequestId++;
    Object.assign(settings, saved.rules);
    for (const slot of [1, 2]) {
      $(`file${slot}-name`).textContent = state[`file${slot}`].name;
      $(`file${slot}-name`).title = state[`file${slot}`].path;
    }
    const common = state.file1.sheets.filter((sheet) => state.file2.sheets.includes(sheet));
    $('sheet').replaceChildren(...common.map((sheet) => new Option(sheet, sheet)));
    $('sheet').value = state.sheet;
    $('sheet').disabled = false;
    updateComparisonHint();
    resetReviewTools();
    renderSettings(); renderRows(); updateSummary();
    sessionDirty = false;
    $('session-status').textContent = 'Sessão retomada. As próximas decisões serão salvas automaticamente.';
  } catch (error) {
    $('session-status').textContent = 'Não foi possível retomar a sessão salva.';
    showError(error);
  } finally { finishLoading(); shell.inert = false; restoringSession = false; }
}

$('save-session').addEventListener('click', () => { saveReview().catch(() => {}); });
$('resume-session').addEventListener('click', restoreReview);
window.addEventListener('beforeunload', (event) => {
  if (closingAfterSave || !sessionDirty) return;
  event.preventDefault();
  event.returnValue = false;
  $('app-shell').inert = true;
  saveReview().then(() => { closingAfterSave = true; window.close(); })
    .catch(() => { $('app-shell').inert = false; });
});

function updateComparisonHint() {
  $('compare-hint').textContent = settings.alignByFirstColumn
    ? 'Registros alinhados pelo valor da primeira coluna.'
    : 'As linhas são comparadas por posição. Se foram reordenadas, ative “Alinhar pela primeira coluna” nas configurações.';
}
function display(value) {
  if (value && typeof value === 'object' && value.__excel_datetime__) return value.__excel_datetime__.replace('T', ' ');
  return value == null ? '' : String(value);
}
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
  const decision = $('filter-decision').value;
  const column = $('filter-column').value;
  const matchCase = $('match-case').getAttribute('aria-pressed') === 'true';
  const key = JSON.stringify([query, decision, column, matchCase, reportRevision]);
  if (filterCache?.report === state.report && filterCache.key === key) return filterCache.indices;
  const indices = [];
  const decisionText = new Map();
  for (let index = 0; index < state.report.length; index++) {
    const record = state.report[index];
    if ((decision && record['Decisão'] !== decision) || (column && record['Nome da Coluna'] !== column)) continue;
    if (query) {
      let cached = searchCache.get(record);
      if (!cached || cached.matchCase !== matchCase) {
        const fields = record['Decisão'] === 'Valor personalizado'
          ? [...columns.slice(0, 2), 'Valor personalizado'] : columns.slice(0, 4);
        cached = { matchCase, fields: fields.map((name) => searchValue(record[name])) };
        searchCache.set(record, cached);
      }
      const choice = record['Decisão'];
      if (!decisionText.has(choice)) decisionText.set(choice, searchValue(choice));
      if (!cached.fields.some((text) => text.includes(query)) && !decisionText.get(choice).includes(query)) continue;
    }
    indices.push(index);
  }
  filterCache = { report: state.report, key, indices };
  return indices;
}

function resetReviewTools() {
  undoHistory = [];
  pendingCursor = -1;
  reportPage = 0;
  reportRevision++;
  filterCache = null;
  searchCache = new WeakMap();
  clearTimeout(searchTimer);
  $('undo-decision').disabled = true;
  $('filter-decision').value = '';
  $('filter-column').replaceChildren(new Option('Todas as colunas', ''),
    ...[...new Set(state.report.map((row) => row['Nome da Coluna']))].map((name) => new Option(name, name)));
  $('filter-column').value = '';
}

function changeDecisions(indices, choice, customValue) {
  if (!state.comparisonReady) return 0;
  if (choice === 'Valor personalizado' && typeof customValue !== 'string') return 0;
  const changes = indices.filter((index) => state.report[index]['Decisão'] !== choice
    || (choice === 'Valor personalizado' && state.report[index]['Valor personalizado'] !== customValue))
    .map((index) => ({ index, previous: state.report[index]['Decisão'], custom: state.report[index]['Valor personalizado'] }));
  if (!changes.length) return 0;
  undoHistory.push(changes);
  if (undoHistory.length > 100) undoHistory.shift();
  changes.forEach(({ index }) => {
    state.report[index]['Decisão'] = choice;
    if (choice === 'Valor personalizado') state.report[index]['Valor personalizado'] = customValue;
    else delete state.report[index]['Valor personalizado'];
    searchCache.delete(state.report[index]);
  });
  reportRevision++;
  $('undo-decision').disabled = false;
  renderRows(); updateSummary(); saveReview().catch(() => {});
  return changes.length;
}

function undoDecision() {
  const changes = undoHistory.pop();
  if (!changes || !state.comparisonReady) return;
  changes.forEach(({ index, previous, custom }) => {
    state.report[index]['Decisão'] = previous;
    if (custom !== undefined) state.report[index]['Valor personalizado'] = custom;
    else delete state.report[index]['Valor personalizado'];
    searchCache.delete(state.report[index]);
  });
  reportRevision++;
  $('undo-decision').disabled = !undoHistory.length;
  renderRows(); updateSummary(); saveReview().catch(() => {});
  notify(`${changes.length} decisão(ões) restaurada(s).`);
}

function nextPending() {
  const indices = filteredReportIndices().filter((index) => state.report[index]['Decisão'] === 'Pendente');
  if (!indices.length) { notify('Nenhuma pendência nos filtros atuais.'); return; }
  pendingCursor = indices.find((index) => index > pendingCursor) ?? indices[0];
  reportPage = Math.floor(filteredReportIndices().indexOf(pendingCursor) / reportPageSize());
  renderRows();
  const button = document.querySelector(`.decision[data-index="${pendingCursor}"]`);
  button?.scrollIntoView({ block: 'center' });
  button?.focus({ preventScroll: true });
}

let customDecisionIndex = null;
function openCustomDecision(index) {
  if (!state.comparisonReady) return;
  const record = state.report[index];
  customDecisionIndex = index;
  $('custom-context').textContent = `Linha ${display(record['Índice/Linha'])} · Coluna ${display(record['Nome da Coluna'])}`;
  $('custom-file1').value = display(record['Valor no Arquivo 1']);
  $('custom-file2').value = display(record['Valor no Arquivo 2']);
  $('custom-value').value = record['Valor personalizado'] ?? '';
  $('custom-dialog').showModal();
  $('custom-value').focus();
}
$('custom-cancel').addEventListener('click', () => $('custom-dialog').close());
$('custom-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (customDecisionIndex !== null) changeDecisions([customDecisionIndex], 'Valor personalizado', $('custom-value').value);
  $('custom-dialog').close();
});
$('custom-dialog').addEventListener('close', () => {
  document.querySelector(`.decision[data-index="${customDecisionIndex}"]`)?.focus({ preventScroll: true });
  customDecisionIndex = null;
});

async function selectFile(slot) {
  try {
    const file = await window.auditoria.openFile(slot);
    if (!file) return;
    const finishLoading = startLoading('Lendo as abas da planilha...');
    try {
      file.sheets = await window.auditoria.callPython('sheets', { path: file.path });
    } finally { finishLoading(); }
    const first = slot === 1 ? file : state.file1;
    const second = slot === 2 ? file : state.file2;
    const common = first && second ? first.sheets.filter((sheet) => second.sheets.includes(sheet)) : [];
    if (first && second && !common.length) throw new Error('Os arquivos não possuem abas com o mesmo nome.');
    if (!await confirmDiscardReview()) return;
    state[`file${slot}`] = file;
    $(`file${slot}-name`).textContent = file.name;
    $(`file${slot}-name`).title = file.path;
    if (state.file1 && state.file2) {
      const sheet = $('sheet'); sheet.replaceChildren(...common.map((name) => new Option(name, name)));
      sheet.disabled = false;
      if (!common.includes(state.sheet)) state.sheet = common[0];
      sheet.value = state.sheet;
      await compare({ discardConfirmed: true });
    }
  } catch (error) { showError(error); }
}

function comparisonRulesChanged(previous, next) {
  return previous.alignByFirstColumn !== next.alignByFirstColumn
    || (next.alignByFirstColumn && previous.validateUniqueFirstColumn !== next.validateUniqueFirstColumn);
}

async function confirmDiscardReview(action) {
  if (!state.report.some((row) => row['Decisão'] !== 'Pendente')) return true;
  return window.auditoria.confirmDiscardReview(action);
}

async function changeFiles(action) {
  if (changingFiles || restoringSession || loadingTasks.size || previewBusy) return;
  if (action === 'swap' && (!state.file1 || !state.file2)) {
    notify('Selecione os dois arquivos antes de inverter.'); return;
  }
  changingFiles = true;
  $('app-shell').inert = true;
  try {
    if (!await confirmDiscardReview(action)) return;
    await sessionWrites.catch(() => {});
    if (action === 'clear') {
      await window.auditoria.clearSession();
      state.compareRequestId++;
      Object.assign(state, { file1: null, file2: null, sheet: '', report: [], newRows: 0, fingerprint: null, comparisonReady: false });
      sessionRevision++;
      sessionDirty = false;
      pendingSessionSnapshot = null;
      sessionWrites = Promise.resolve();
      previewData = null;
      $('sheet').replaceChildren(); $('sheet').value = ''; $('sheet').disabled = true;
      $('search').value = '';
      resetReviewTools();
      renderRows();
      updateSummary('Selecione os dois arquivos Excel para começar.');
      $('session-status').textContent = 'Seleções e sessão salva removidas.';
    } else {
      [state.file1, state.file2] = [state.file2, state.file1];
    }
    for (const slot of [1, 2]) {
      $(`file${slot}-name`).textContent = state[`file${slot}`]?.name || 'Nenhum arquivo selecionado';
      $(`file${slot}-name`).title = state[`file${slot}`]?.path || '';
    }
    if (action === 'swap') await compare({ discardConfirmed: true });
  } catch (error) { showError(error); }
  finally { changingFiles = false; $('app-shell').inert = false; }
}
$('clear-files').addEventListener('click', () => changeFiles('clear'));
$('swap-files').addEventListener('click', () => changeFiles('swap'));

async function compare({ discardConfirmed = false } = {}) {
  if (!state.file1 || !state.file2 || !$('sheet').value) return;
  if (!discardConfirmed && !await confirmDiscardReview()) {
    $('sheet').value = state.sheet;
    return;
  }
  const requestId = ++state.compareRequestId;
  const context = {
    file1: state.file1.path,
    file2: state.file2.path,
    sheet: $('sheet').value,
    alignByFirstColumn: settings.alignByFirstColumn,
    validateUniqueFirstColumn: settings.validateUniqueFirstColumn
  };
  state.sheet = context.sheet;
  updateComparisonHint();
  state.report = [];
  state.newRows = 0;
  state.comparisonReady = false;
  state.fingerprint = null;
  resetReviewTools();
  $('session-status').textContent = 'A sessão anterior será substituída após uma comparação válida.';
  renderRows();
  updateSummary('Comparando planilhas...');
  const finishLoading = startLoading('Comparando planilhas...');
  try {
    const result = await window.auditoria.callPython('compare', context);
    if (requestId !== state.compareRequestId) return;
    if (context.file1 !== state.file1?.path || context.file2 !== state.file2?.path || context.sheet !== $('sheet').value || comparisonRulesChanged(context, settings)) return;
    state.report = result.report; state.newRows = result.newRows;
    state.comparisonReady = true;
    state.fingerprint = result.fingerprint;
    resetReviewTools();
    renderRows(); updateSummary();
    saveReview().catch(() => {});
  } catch (error) {
    if (requestId !== state.compareRequestId) return;
    showError(error);
    updateSummary('Revise os arquivos e as configurações antes de comparar novamente.');
  } finally { finishLoading(); }
}

function renderRows() {
  const body = $('rows'); body.replaceChildren();
  const indices = filteredReportIndices();
  const pageSize = reportPageSize();
  const pages = Math.max(1, Math.ceil(indices.length / pageSize));
  reportPage = Math.max(0, Math.min(reportPage, pages - 1));
  $('page-status').textContent = `Página ${reportPage + 1} de ${pages} — ${indices.length ? reportPage * pageSize + 1 : 0} a ${Math.min((reportPage + 1) * pageSize, indices.length)} de ${indices.length}`;
  $('page-previous').disabled = reportPage === 0;
  $('page-next').disabled = reportPage >= pages - 1;
  $('filter-count').textContent = `${indices.length} de ${state.report.length} diferenças`;
  if (!state.report.length) {
    const row = body.insertRow(); row.className = 'empty'; const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = state.comparisonReady ? 'Nenhuma diferença encontrada nesta aba.' : 'Aguardando uma comparação válida.'; return;
  }
  if (!indices.length) {
    const row = body.insertRow(); row.className = 'empty'; const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = 'Nenhuma diferença corresponde à pesquisa.'; return;
  }
  indices.slice(reportPage * pageSize, (reportPage + 1) * pageSize).forEach((index) => {
    const record = state.report[index];
    const row = body.insertRow();
    columns.slice(0, 4).forEach((key, columnIndex) => {
      if (record['Decisão'] === 'Valor personalizado' && columnIndex === 3) return;
      const cell = row.insertCell();
      if (record['Decisão'] === 'Valor personalizado' && columnIndex === 2) {
        cell.colSpan = 2;
        cell.className = 'custom-value-cell';
        cell.textContent = record['Valor personalizado'] || '(vazio)';
        cell.title = record['Valor personalizado'];
        return;
      }
      const value = record[key];
      const other = columnIndex === 2 ? record[columns[3]] : columnIndex === 3 ? record[columns[2]] : undefined;
      const text = columnIndex >= 2 ? comparisonDisplay(value, other) : display(value);
      cell.textContent = text;
      cell.title = text === display(value) ? text : JSON.stringify(display(value));
    });
    const choice = row.insertCell(); const button = document.createElement('button');
    button.className = 'decision'; button.textContent = record['Decisão']; button.dataset.index = index;
    button.setAttribute('aria-label', `Decisão da linha ${display(record['Índice/Linha'])}, coluna ${display(record['Nome da Coluna'])}: ${record['Decisão']}`);
    button.setAttribute('aria-haspopup', 'listbox');
    button.addEventListener('click', () => openSelectionMenu(button,
      ['Pendente', 'Manter Arquivo 1', 'Usar Arquivo 2', 'Valor personalizado'].map((value) => ({ value, label: value })),
      state.report[index]['Decisão'], (value) => value === 'Valor personalizado' ? openCustomDecision(index) : changeDecisions([index], value)));
    choice.append(button);
  });
}

let activeSelectionMenu = null;
function openSelectionMenu(anchor, choices, currentValue, onSelect) {
  activeSelectionMenu?.close();
  if (!choices.length) return;
  const menu = document.createElement('div'); menu.className = 'selection-menu'; menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', anchor.getAttribute?.('aria-label') || 'Opções de seleção');
  anchor.setAttribute('aria-expanded', 'true');
  const buttons = choices.map(({ value, label, disabled }) => {
    const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(value === currentValue));
    item.textContent = `${value === currentValue ? '✓  ' : ''}${label}`;
    item.disabled = Boolean(disabled);
    item.addEventListener('click', () => { close(); onSelect(value); });
    menu.append(item);
    return item;
  });
  const close = (restoreFocus = false) => {
    menu.remove(); document.removeEventListener('pointerdown', outside);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    anchor.setAttribute('aria-expanded', 'false');
    if (activeSelectionMenu?.menu === menu) activeSelectionMenu = null;
    if (restoreFocus) anchor.focus();
  };
  const outside = (event) => { if (!menu.contains(event.target) && event.target !== anchor) close(); };
  const reposition = (event) => {
    if (event?.target === menu) return;
    if (anchor.isConnected === false) { close(); return false; }
    const rect = anchor.getBoundingClientRect();
    let visibleTop = 0; let visibleBottom = innerHeight;
    let visibleLeft = 0; let visibleRight = innerWidth;
    for (let parent = anchor.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) continue;
      const bounds = parent.getBoundingClientRect();
      visibleTop = Math.max(visibleTop, bounds.top); visibleBottom = Math.min(visibleBottom, bounds.bottom);
      visibleLeft = Math.max(visibleLeft, bounds.left); visibleRight = Math.min(visibleRight, bounds.right);
    }
    if (rect.bottom <= visibleTop || rect.top >= visibleBottom || rect.right <= visibleLeft || rect.left >= visibleRight) {
      close(); return false;
    }
    const width = Math.min(Math.max(rect.width, 190), innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    menu.style.top = `${rect.bottom + menu.offsetHeight + 8 <= innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - menu.offsetHeight - 5)}px`;
  };
  menu.addEventListener('keydown', (event) => {
    const enabled = buttons.filter((item) => !item.disabled);
    const position = enabled.indexOf(document.activeElement);
    let target;
    if (event.key === 'ArrowDown') target = enabled[(position + 1) % enabled.length];
    else if (event.key === 'ArrowUp') target = enabled[(position - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled.at(-1);
    else if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    else if (event.key === 'Tab') { close(); return; }
    if (target) { event.preventDefault(); target.focus(); }
  });
  document.body.append(menu);
  if (reposition() === false) return;
  document.addEventListener('pointerdown', outside);
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  activeSelectionMenu = { menu, close };
  (buttons.find((_item, index) => choices[index].value === currentValue && !choices[index].disabled)
    || buttons.find((item) => !item.disabled))?.focus();
}

function enhanceNativeSelect(select) {
  const open = () => {
    if (select.disabled) return;
    openSelectionMenu(select, Array.from(select.options, (option) => ({
      value: option.value, label: option.text, disabled: option.disabled
    })), select.value, (value) => {
      if (value === select.value) return;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  select.addEventListener('pointerdown', (event) => { event.preventDefault(); select.focus(); open(); });
  select.addEventListener('mousedown', (event) => event.preventDefault());
  select.addEventListener('click', (event) => event.preventDefault());
  select.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault(); open();
    }
  });
}

function updateSummary(message) {
  $('app-shell').setAttribute('data-review-ready', String(state.comparisonReady));
  $('preview-new-rows').hidden = false;
  if (message) { $('summary').textContent = message; return; }
  let pending = 0, use2 = 0, keep1 = 0;
  for (const row of state.report) {
    if (row['Decisão'] === 'Pendente') pending++;
    else if (row['Decisão'] === 'Usar Arquivo 2' || row['Decisão'] === 'Valor personalizado') use2++;
    else if (row['Decisão'] === 'Manter Arquivo 1') keep1++;
  }
  $('summary').textContent = `Células diferentes: ${state.report.length}   |   Pendentes: ${pending}   |   Células a alterar: ${use2}   |   Manter Arquivo 1: ${keep1}   |   Linhas novas disponíveis: ${state.newRows}`;
}

function applyAll() {
  const indices = $('bulk-scope').value === 'filtered'
    ? filteredReportIndices()
    : state.report.map((_row, index) => index);
  const changed = changeDecisions(indices, $('bulk-choice').value);
  notify(`${changed} diferença(s) atualizada(s).`);
}

function renderPreview() {
  const head = $('preview-head'); head.replaceChildren();
  const heading = head.insertRow();
  for (const label of ['Linha no Arquivo 2', ...previewData.columns]) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.append(cell);
  }
  const body = $('preview-rows'); body.replaceChildren();
  const start = previewPage * 50;
  for (const item of previewData.rows.slice(start, start + 50)) {
    const row = body.insertRow();
    for (const value of [item.line, ...item.values]) row.insertCell().textContent = display(value);
  }
  $('preview-count').textContent = `${previewData.rows.length} linha(s) nova(s). Página ${previewPage + 1} de ${Math.max(1, Math.ceil(previewData.rows.length / 50))}.`;
  $('preview-previous').disabled = previewPage === 0;
  $('preview-next').disabled = start + 50 >= previewData.rows.length;
}

async function previewNewRows(forGeneration = false) {
  if (!state.comparisonReady || previewBusy) return false;
  previewBusy = true;
  $('app-shell').inert = true;
  const requestId = state.compareRequestId;
  const finishLoading = startLoading('Preparando prévia das linhas novas...');
  try {
    const result = await window.auditoria.callPython('preview-new-rows', {
      file1: state.file1.path, file2: state.file2.path, sheet: state.sheet,
      fingerprint: state.fingerprint, alignByFirstColumn: settings.alignByFirstColumn,
      validateUniqueFirstColumn: settings.validateUniqueFirstColumn
    });
    if (requestId !== state.compareRequestId) return false;
    previewData = result; previewPage = 0;
    renderPreview();
    $('preview-confirm').hidden = !forGeneration;
    finishLoading();
    $('preview-dialog').showModal();
    return await new Promise((resolve) => { previewResolve = resolve; });
  } catch (error) { showError(error); return false; }
  finally { finishLoading(); previewBusy = false; $('app-shell').inert = false; }
}
$('preview-close').addEventListener('click', () => $('preview-dialog').close());
$('preview-confirm').addEventListener('click', () => $('preview-dialog').close('generate'));
$('preview-dialog').addEventListener('close', () => {
  previewResolve?.($('preview-dialog').returnValue === 'generate'); previewResolve = null;
  $('preview-dialog').returnValue = '';
});
$('preview-previous').addEventListener('click', () => { previewPage--; renderPreview(); });
$('preview-next').addEventListener('click', () => { previewPage++; renderPreview(); });
$('preview-new-rows').addEventListener('click', () => previewNewRows());

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
  if (includeNewRows && state.newRows > 0 && !await previewNewRows(true)) return;
  try {
    const finishLoading = startLoading(includeNewRows ? 'Gerando arquivo corrigido...' : 'Salvando alterações...');
    let result;
    try {
      result = await window.auditoria.callPython('generate', { file1: state.file1.path, file2: state.file2.path, sheet: state.sheet, name: state.file1.name, report: state.report, fingerprint: state.fingerprint, includeNewRows, markChanges, changeColor: settings.changeColor, alignByFirstColumn: settings.alignByFirstColumn, validateUniqueFirstColumn: settings.validateUniqueFirstColumn });
    } finally { finishLoading(); }
    const suffix = includeNewRows ? '_corrigido' : '_somente_alteracoes';
    const base = state.file1.name.replace(/\.[^.]+$/, ''); const ext = state.file1.name.match(/\.[^.]+$/)?.[0] || '.xlsx';
    const saved = await saveContent(`${base}${suffix}${ext}`, result.content, 'Arquivo salvo');
    if (saved) updateSummary(`Arquivo gerado: ${result.changes} célula(s) alterada(s), ${result.rows} linha(s) nova(s) adicionada(s).`);
  } catch (error) { showError(error); }
}

$('choose1').addEventListener('click', () => selectFile(1)); $('choose2').addEventListener('click', () => selectFile(2));
$('compare').addEventListener('click', () => compare()); $('sheet').addEventListener('change', () => compare()); $('apply').addEventListener('click', applyAll);
function applyFilters() { clearTimeout(searchTimer); reportPage = 0; pendingCursor = -1; renderRows(); }
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 200); });
$('filter-decision').addEventListener('change', applyFilters);
$('filter-column').addEventListener('change', applyFilters);
$('page-size').addEventListener('change', applyFilters);
$('page-previous').addEventListener('click', () => { reportPage--; renderRows(); });
$('page-next').addEventListener('click', () => { reportPage++; renderRows(); });
$('next-pending').addEventListener('click', nextPending);
$('undo-decision').addEventListener('click', undoDecision);
$('match-case').addEventListener('click', (event) => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  applyFilters();
});
$('export-differences').addEventListener('click', () => exportReport('export-differences', 'diferencas_entre_arquivos.xlsx', 'Não há diferenças para exportar.'));
$('export-choices').addEventListener('click', () => exportReport('export-choices', 'mudancas_aplicadas.xlsx', 'Não há escolhas para exportar.'));
$('save-changes').addEventListener('click', () => generate(false, true)); $('generate').addEventListener('click', () => generate(true, false));

function renderSettings(values = settingsDraft || settings) {
  for (const key of ['differences', 'choices']) $(`template-${key}-name`).textContent = values.templates[key] ? values.templates[key].split(/[\\/]/).pop() : 'Nenhum modelo selecionado';
  $('change-color').value = values.changeColor;
  $('change-color-value').textContent = values.changeColor;
  $('align-first-column').checked = Boolean(values.alignByFirstColumn);
  $('validate-unique-first-column').checked = values.validateUniqueFirstColumn !== false;
  $('validate-unique-first-column').disabled = !values.alignByFirstColumn;
}
$('open-settings').addEventListener('click', () => {
  settingsDraft = structuredClone(settings);
  renderSettings();
  $('settings-dialog').showModal();
});
$('cancel-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-dialog').addEventListener('close', () => {
  settingsDraft = null;
  renderSettings();
});
$('change-color').addEventListener('input', (event) => { settingsDraft.changeColor = event.target.value.toUpperCase(); $('change-color-value').textContent = settingsDraft.changeColor; });
$('align-first-column').addEventListener('change', (event) => {
  settingsDraft.alignByFirstColumn = event.target.checked;
  $('validate-unique-first-column').disabled = !event.target.checked;
});
$('validate-unique-first-column').addEventListener('change', (event) => { settingsDraft.validateUniqueFirstColumn = event.target.checked; });
document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', async () => {
  try { const draft = settingsDraft; const file = await window.auditoria.openTemplate(); if (file && draft === settingsDraft) { draft.templates[button.dataset.template] = file.path; renderSettings(); } }
  catch (error) { showError(error); }
}));
document.querySelectorAll('[data-clear-template]').forEach((button) => button.addEventListener('click', () => { settingsDraft.templates[button.dataset.clearTemplate] = null; renderSettings(); }));
$('save-settings').addEventListener('click', async () => {
  const button = $('save-settings');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const next = { templates: { ...settingsDraft.templates }, changeColor: $('change-color').value, alignByFirstColumn: $('align-first-column').checked, validateUniqueFirstColumn: $('validate-unique-first-column').checked };
    const shouldCompare = state.file1 && state.file2 && comparisonRulesChanged(settings, next);
    if (shouldCompare && !await confirmDiscardReview()) return;
    Object.assign(settings, await window.auditoria.saveSettings(next));
    $('settings-dialog').close();
    if (shouldCompare) await compare({ discardConfirmed: true });
    notify('Configurações salvas.');
  }
  catch (error) { showError(error); }
  finally { button.disabled = false; }
});
document.querySelectorAll('.app-shell select').forEach(enhanceNativeSelect);
$('app-shell').inert = true;
const initialization = window.auditoria.getSettings().then(async (saved) => {
  Object.assign(settings, saved); renderSettings();
  await restoreReview();
}).catch((error) => { $('app-shell').inert = false; showError(error); });

// Native details keep the secondary controls keyboard accessible.
document.querySelectorAll('.action-menu').forEach((menu) => {
  menu.addEventListener('toggle', () => {
    if (menu.open) document.querySelectorAll('.action-menu').forEach((other) => { if (other !== menu) other.open = false; });
  });
  menu.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { menu.open = false; }));
});
window.addEventListener('pointerdown', (event) => {
  document.querySelectorAll('.action-menu[open]').forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.querySelectorAll('.action-menu[open]').forEach((menu) => { menu.open = false; menu.querySelector('summary').focus(); });
});
