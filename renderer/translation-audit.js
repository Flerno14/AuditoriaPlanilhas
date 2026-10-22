(() => {
  const api = window.auditoria;
  const screen = document.createElement('main');
  screen.id = 'translation-screen'; screen.hidden = true;
  screen.innerHTML = `
    <div class="page-heading"><div><div class="eyebrow">AUDITORIA DE TRADUÇÕES</div><h1>Revise traduções com clareza.</h1><p class="intro">Compare inglês e português, confira alertas e organize a revisão.</p></div></div>
    <section class="card files-card">
      <div class="file-row"><strong>Planilha · Inglês e português</strong><span class="file-name" id="ta-filename">Nenhum arquivo selecionado</span><button id="ta-file" class="outline">Escolher planilha</button></div>
      <div class="translation-columns">
      <label>Aba da planilha<select id="ta-sheet" disabled></select></label>
      <label>Coluna em inglês<select id="ta-source" disabled></select></label>
      <label>Coluna em português<select id="ta-target" disabled></select></label>
      <label>Identificação (opcional)<select id="ta-identifier" disabled></select></label>
      <div class="review-actions">
      <button id="ta-run" class="primary" disabled>Analisar traduções</button>
      <button id="ta-cancel" class="outline compact" disabled>Cancelar análise</button>
      </div></div>
      <details class="tool-section"><summary>Proximidade semântica · opcional</summary>
      <div class="translation-model-controls"><span id="ta-model-name">Sem modelo: somente alertas objetivos.</span><button id="ta-model" class="outline compact">Selecionar modelo local</button><button id="ta-clear-model" class="outline compact">Usar somente alertas</button></div>
      <p class="translation-note">Modelo sugerido: paraphrase-multilingual-MiniLM-L12-v2. Use uma pasta já instalada; nenhum texto é enviado à internet. A proximidade indica semelhança de significado, não percentual de acerto. A faixa inferior de 20% das proximidades ajuda a ordenar a revisão e não determina erro.</p>
      </details>
      <p class="hint">As duas colunas devem estar na mesma aba. Os alertas orientam a revisão humana.</p>
    <p id="translation-progress" role="status"></p>
    </section>
    <section class="card differences-card">
      <div class="table-toolbar"><div><strong>Revisão das traduções</strong><span class="filter-count" id="ta-count" aria-live="polite">0 de 0</span></div><div class="review-actions"><button id="ta-next-item" class="outline compact">Próximo não revisado</button></div></div>
    <div class="filter-toolbar">
      <label class="search-box" for="ta-search"><span aria-hidden="true">⌕</span><span class="sr-only">Pesquisar traduções</span><input id="ta-search" type="search" placeholder="Texto, identificação ou alerta" autocomplete="off"></label>
      <label for="ta-priority">Prioridade:</label><select id="ta-priority"><option value="">Todas</option><option>Alta</option><option>Conferir</option><option>Sem alerta objetivo</option><option>Não avaliado</option></select>
      <label for="ta-review-filter">Revisão:</label><select id="ta-review-filter"><option value="">Todas</option><option>Não revisado</option><option>Revisado</option><option>Precisa corrigir</option></select>
      <label for="ta-alert-filter">Alerta:</label><select id="ta-alert-filter"><option value="">Todos os alertas</option><option value="__none__">Sem alertas</option></select>
    </div>
    <details class="tool-section"><summary>Revisão em massa</summary><div class="bulk-panel"><label for="ta-bulk-choice">Definir revisão:</label><select id="ta-bulk-choice"><option>Não revisado</option><option>Revisado</option><option>Precisa corrigir</option></select><label for="ta-bulk-scope">Aplicar em:</label><select id="ta-bulk-scope"><option value="all">Todas as traduções</option><option value="filtered">Itens filtrados</option></select><button type="button" class="outline compact" id="ta-bulk-apply" disabled>Aplicar</button></div><p class="row-details-hint">A aplicação inclui todas as páginas do escopo escolhido.</p></details>
    <p class="row-details-hint">Dê dois cliques em uma célula ou use Ver linha para visualizar o conteúdo completo.</p>
    <div class="table-wrap"><table><thead><tr><th>Linha / ID</th><th>Inglês</th><th>Português</th><th>Proximidade</th><th>Prioridade / alertas</th><th>Revisão</th></tr></thead><tbody id="ta-rows"></tbody></table></div>
    <nav class="pagination" aria-label="Páginas da auditoria"><label for="ta-page-size">Itens por página:</label><select id="ta-page-size"><option selected>50</option><option>100</option><option>250</option></select><span id="ta-page" role="status"></span><div class="review-actions"><button id="ta-prev" class="outline compact">Anterior</button><button id="ta-next" class="outline compact">Próxima</button></div></nav>
    </section>
    <div class="summary" id="translation-summary" role="status">Nenhuma análise realizada.</div>
    <footer class="actions"><div class="session-actions" aria-label="Sessão de auditoria de traduções"><div class="session-buttons"><button id="ta-save" class="outline compact">Salvar sessão</button><button id="ta-restore" class="outline compact">Retomar sessão</button></div></div><div class="output-actions"><button id="ta-export" class="primary" disabled>Exportar relatório</button></div></footer>
    <dialog id="translation-detail" aria-labelledby="ta-detail-title"><h2 id="ta-detail-title">Conteúdo completo</h2><h3>Inglês</h3><pre id="ta-detail-source"></pre><h3>Português</h3><pre id="ta-detail-target"></pre><p id="ta-detail-issues"></p><button id="ta-detail-close" class="primary">Fechar</button></dialog>`;
  document.querySelector('.topbar').after(screen);
  const get = (id) => document.getElementById(id);
  const toggle = get('open-navigation');
  const drawer = get('navigation-drawer');
  toggle.onclick = () => {
    if (loadingTasks.size || restoringSession || busy) return;
    drawer.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  };
  get('close-navigation').onclick = () => drawer.close();
  drawer.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  });
  drawer.addEventListener('click', (event) => {
    const bounds = drawer.getBoundingClientRect();
    if (event.target === drawer && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) drawer.close();
  });
  let file = null, fingerprint = null, rows = [], page = 0, busy = false, cancelled = false, modelPath = null, analyzedModel = '';
  let cursor = -1;
  let context = null, dirty = false, revision = 0, saveTimer, saving = null;
  async function flush() {
    clearTimeout(saveTimer);
    if (saving) await saving;
    if (!dirty || !context) return;
    const current = revision;
    const snapshot = { version: 1, ...context, rows: structuredClone(rows) };
    saving = api.saveTranslationSession(snapshot);
    try { await saving; if (current === revision) dirty = false; }
    finally { saving = null; }
    if (dirty) await flush();
  }
  function changed() {
    dirty = true; revision++; clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush().catch(showError), 250);
  }
  window.translationAudit = { flush, isDirty: () => dirty, isBusy: () => busy };
  const order = { Alta: 0, Conferir: 1, 'Sem alerta objetivo': 2, 'Não avaliado': 3 };
  function navigate(translations) {
    if (loadingTasks.size || restoringSession || busy) return;
    screen.hidden = !translations;
    get('app-shell').hidden = translations;
    get('app-shell').style.display = translations ? 'none' : '';
    get('active-audit-label').textContent = translations ? 'Auditoria de traduções' : 'Auditoria de planilhas';
    get('navigate-sheets').removeAttribute('aria-current');
    get('navigate-translations').removeAttribute('aria-current');
    get(translations ? 'navigate-translations' : 'navigate-sheets').setAttribute('aria-current', 'page');
    drawer.close();
  }
  get('navigate-sheets').onclick = () => navigate(false);
  get('navigate-translations').onclick = () => navigate(true);
  function options(id, values) {
    get(id).replaceChildren(...values.map((value) => new Option(value || 'Sem identificação', value)));
    get(id).disabled = !values.length;
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['ta-file', 'ta-model', 'ta-clear-model', 'ta-sheet', 'ta-source', 'ta-target', 'ta-identifier', 'ta-run', 'ta-restore', 'ta-save']) get(id).disabled = value || (!file && !['ta-file', 'ta-model', 'ta-clear-model', 'ta-restore'].includes(id));
    get('ta-cancel').disabled = !value;
    get('ta-export').disabled = value || !rows.length;
    get('ta-rows').querySelectorAll('select').forEach((select) => { select.disabled = value; });
    updateBulkControls();
    toggle.disabled = value;
  }
  async function task(work) { if (busy) return; setBusy(true); try { await flush(); await work(); } catch (error) { showError(error); } finally { setBusy(false); } }
  function discard() {
    return !rows.length || window.confirm('Iniciar outra análise descarta os resultados e as revisões desta tela. Continuar?');
  }
  async function columns() {
    const result = await api.callPython('translation-columns', { path: file.path, sheet: get('ta-sheet').value });
    fingerprint = result.fingerprint;
    options('ta-source', result.columns); options('ta-target', result.columns); options('ta-identifier', ['', ...result.columns]);
    if (result.columns.length > 1) get('ta-target').selectedIndex = 1;
  }
  get('ta-file').onclick = () => task(async () => {
    if (!discard()) return;
    const selected = await api.openFile(1); if (!selected) return;
    const sheets = await api.callPython('sheets', { path: selected.path });
    file = selected; rows = []; context = null; fingerprint = null;
    get('ta-filename').textContent = file.name; options('ta-sheet', sheets);
    await columns(); selectedSheet = get('ta-sheet').value; render();
  });
  let selectedSheet = '';
  get('ta-sheet').onfocus = () => { selectedSheet = get('ta-sheet').value; };
  get('ta-sheet').onchange = () => task(async () => {
    if (!discard()) { get('ta-sheet').value = selectedSheet; return; }
    rows = []; context = null; fingerprint = null; await columns(); selectedSheet = get('ta-sheet').value; render();
  });
  get('ta-model').onclick = async () => { try {
    const folder = await api.openTranslationModel(); if (!folder) return;
    modelPath = folder; get('ta-model-name').textContent = folder;
  } catch (error) { showError(error); } };
  get('ta-clear-model').onclick = () => { modelPath = null; get('ta-model-name').textContent = 'Sem modelo: somente alertas objetivos.'; };
  get('ta-cancel').onclick = async () => { cancelled = true; try { await api.cancelPython(); } catch (error) { showError(error); } };
  get('ta-run').onclick = () => task(async () => {
    if (!discard()) return;
    if (!fingerprint) throw new Error('Selecione novamente o arquivo e a aba.');
    cancelled = false;
    get('translation-progress').textContent = 'Lendo todas as linhas…';
    const result = await api.callPython('translation-read', { path: file.path, sheet: get('ta-sheet').value, source: get('ta-source').value, target: get('ta-target').value, identifier: get('ta-identifier').value, fingerprint });
    rows = result.rows.map((row) => ({ ...row, score: null, review: 'Não revisado', semanticIssue: modelPath ? 'Análise semântica pendente.' : '' }));
    analyzedModel = modelPath || 'Sem análise semântica'; page = 0;
    context = { file, fingerprint, sheet: get('ta-sheet').value, source: get('ta-source').value, target: get('ta-target').value, identifier: get('ta-identifier').value, model: analyzedModel };
    let lastCheckpoint = Date.now();
    try {
      for (let start = 0; start < rows.length; start += 32) {
        if (cancelled) break;
        const batch = rows.slice(start, start + 32);
        if (modelPath) {
          const scores = await api.callPython('translation-semantic', { modelPath, rows: batch.map(({ source, target }) => ({ source, target })) });
          scores.forEach((score, index) => Object.assign(batch[index], score));
        }
        get('translation-progress').textContent = `${Math.min(start + 32, rows.length)} de ${rows.length} linhas analisadas…`;
        if (modelPath && Date.now() - lastCheckpoint >= 30000) { changed(); await flush(); lastCheckpoint = Date.now(); }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      get('translation-progress').textContent = cancelled ? 'Análise interrompida. Resultados parciais disponíveis.' : 'Varredura concluída. Revise os alertas e as menores proximidades.';
    } catch (error) {
      get('translation-progress').textContent = 'Análise semântica incompleta. Alertas objetivos disponíveis; pares pendentes estão identificados.';
      throw error;
    } finally { TranslationAuditRules.rank(rows); changed(); await flush(); render(); }
  });
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filtered() {
    const query = normalize(get('ta-search').value);
    return rows.filter((row) => (!get('ta-priority').value || row.priority === get('ta-priority').value)
      && (!get('ta-review-filter').value || row.review === get('ta-review-filter').value)
      && TranslationAuditRules.matchesAlert(row, get('ta-alert-filter').value)
      && (!query || normalize([row.line, row.identifier, row.source, row.target, ...row.issues].join(' ')).includes(query)))
      .sort((a, b) => order[a.priority] - order[b.priority] || (a.score ?? 2) - (b.score ?? 2) || a.line - b.line);
  }
  function detail(row) {
    get('ta-detail-title').textContent = `Linha ${row.line}${row.identifier ? ` · ${row.identifier}` : ''}`;
    get('ta-detail-source').textContent = row.source; get('ta-detail-target').textContent = row.target;
    get('ta-detail-issues').textContent = row.issues.join('\n') || 'Nenhum alerta objetivo. A revisão humana continua necessária.';
    get('translation-detail').showModal();
  }
  function render() {
    const alertSelect = get('ta-alert-filter'), selectedAlert = alertSelect.value;
    const alertTypes = [...new Set(rows.flatMap((row) => row.issues.map(TranslationAuditRules.alertType)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    alertSelect.replaceChildren(new Option('Todos os alertas', ''), new Option('Sem alertas', '__none__'), ...alertTypes.map((type) => new Option(type, type)));
    alertSelect.value = selectedAlert === '__none__' || alertTypes.includes(selectedAlert) ? selectedAlert : '';
    if (alertSelect.value !== selectedAlert) { page = 0; cursor = -1; }
    const pageSize = Number(get('ta-page-size').value);
    const list = filtered(), pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, pages - 1); get('ta-rows').replaceChildren();
    screen.dataset.reviewReady = String(rows.length > 0);
    get('ta-count').textContent = `${list.length} de ${rows.length}`;
    if (!list.length) {
      const tr = document.createElement('tr'), td = document.createElement('td');
      tr.className = 'empty'; td.colSpan = 6;
      td.textContent = rows.length ? 'Nenhuma tradução corresponde aos filtros.' : 'Selecione uma planilha e analise as traduções para começar.';
      tr.append(td); get('ta-rows').append(tr);
    }
    for (const row of list.slice(page * pageSize, (page + 1) * pageSize)) {
      const tr = document.createElement('tr');
      for (const value of [`${row.line}\n${row.identifier}`, row.source, row.target, row.score === null ? 'Não calculada' : row.score.toFixed(3), `${row.priority}\n${row.issues.join('\n')}`]) {
        const td = document.createElement('td'), content = document.createElement('div'); content.className = 'translation-text'; content.textContent = value;
        td.append(content); td.ondblclick = () => detail(row); tr.append(td);
      }
      const button = document.createElement('button'); button.textContent = 'Ver linha'; button.className = 'outline'; button.onclick = () => detail(row); tr.cells[0].append(button);
      const td = document.createElement('td'), select = document.createElement('select'); select.setAttribute('aria-label', `Revisão da linha ${row.line}`);
      for (const value of ['Não revisado', 'Revisado', 'Precisa corrigir']) select.add(new Option(value, value));
      select.value = row.review; select.disabled = busy; select.onchange = () => { row.review = select.value; changed(); render(); };
      td.append(select); tr.append(td); get('ta-rows').append(tr);
      enhanceNativeSelect(select);
    }
    get('translation-summary').textContent = `${rows.length} linhas · ${rows.filter((row) => row.priority === 'Alta').length} de prioridade alta · ${rows.filter((row) => row.review !== 'Não revisado').length} revisadas · ${list.length} no filtro · ${rows.filter((row) => row.score !== null).length} com proximidade calculada`;
    get('ta-page').textContent = `Página ${page + 1} de ${pages}`;
    get('ta-prev').disabled = page === 0; get('ta-next').disabled = page + 1 >= pages;
    get('ta-export').disabled = busy || !rows.length;
    updateBulkControls(list);
  }
  function updateBulkControls(list) {
    for (const id of ['ta-bulk-choice', 'ta-bulk-scope']) get(id).disabled = busy || !rows.length;
    const targets = get('ta-bulk-scope').value === 'filtered' ? (list || filtered()) : rows;
    get('ta-bulk-apply').disabled = busy || !targets.length;
  }
  get('ta-bulk-scope').addEventListener('change', () => updateBulkControls());
  get('ta-bulk-apply').onclick = () => {
    if (busy) return;
    const targets = get('ta-bulk-scope').value === 'filtered' ? filtered() : rows;
    const count = TranslationAuditRules.applyReview(targets, get('ta-bulk-choice').value);
    if (count) { changed(); cursor = -1; render(); }
    notify(count ? `${count} traduções atualizadas.` : 'Nenhuma revisão precisou ser alterada.');
  };
  get('ta-detail-close').onclick = () => get('translation-detail').close();
  get('ta-prev').onclick = () => { page--; render(); }; get('ta-next').onclick = () => { page++; render(); };
  get('ta-page-size').addEventListener('change', () => { page = 0; cursor = -1; render(); });
  let searchDelay;
  get('ta-search').addEventListener('input', () => { clearTimeout(searchDelay); searchDelay = setTimeout(() => { page = 0; cursor = -1; render(); }, 200); });
  for (const id of ['ta-priority', 'ta-review-filter', 'ta-alert-filter']) get(id).addEventListener('change', () => { page = 0; cursor = -1; render(); });
  get('ta-next-item').onclick = () => {
    const list = filtered(); if (!list.length) return;
    for (let offset = 1; offset <= list.length; offset++) {
      const index = (cursor + offset) % list.length;
      if (list[index].review === 'Não revisado') { cursor = index; page = Math.floor(index / Number(get('ta-page-size').value)); render(); detail(list[index]); return; }
    }
    notify('Todos os itens filtrados já foram revisados.');
  };
  get('ta-export').onclick = () => task(async () => {
    const result = await api.callPython('translation-export', { rows, model: analyzedModel });
    await saveContent(`${file.name.replace(/\.[^.]+$/, '')}_auditoria_traducao.xlsx`, result.content, 'Relatório salvo');
  });
  get('ta-save').onclick = () => task(async () => { await flush(); notify('Sessão de tradução salva.'); });
  get('ta-restore').onclick = () => task(async () => {
    if (!discard()) return;
    const saved = await api.getTranslationSession();
    if (!saved) { notify('Nenhuma sessão de tradução salva.'); return; }
    const checked = await api.callPython('translation-columns', { path: saved.file.path, sheet: saved.sheet, fingerprint: saved.fingerprint });
    const sheets = await api.callPython('sheets', { path: saved.file.path });
    file = saved.file; fingerprint = saved.fingerprint; context = saved;
    rows = saved.rows; analyzedModel = saved.model;
    options('ta-sheet', sheets); get('ta-sheet').value = saved.sheet; selectedSheet = saved.sheet;
    options('ta-source', checked.columns); options('ta-target', checked.columns); options('ta-identifier', ['', ...checked.columns]);
    for (const key of ['source', 'target', 'identifier']) get(`ta-${key}`).value = saved[key];
    get('ta-filename').textContent = file.name;
    get('translation-progress').textContent = 'Sessão retomada. Resultados sem proximidade calculada continuam identificados.';
    TranslationAuditRules.rank(rows); page = 0; render();
  });
  screen.querySelectorAll('select').forEach(enhanceNativeSelect);
  render();
})();
