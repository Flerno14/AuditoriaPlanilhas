(() => {
  const element = (id) => document.getElementById(id);
  let lastState;
  let requesting = false;
  function render(state) {
    if (lastState && state.revision < lastState.revision) return;
    lastState = state;
    element('current-version').textContent = state.currentVersion;
    element('update-status').textContent = state.message;
    element('check-updates').disabled = requesting || !['idle', 'not-available', 'available', 'error'].includes(state.status);
    element('download-update').hidden = state.status !== 'available';
    element('download-update').disabled = requesting;
    element('install-update').hidden = state.status !== 'downloaded';
    element('install-update').disabled = requesting;
    element('update-progress').hidden = state.status !== 'downloading';
    element('update-progress').value = state.percent;
  }
  async function request(action) {
    if (requesting) return;
    requesting = true;
    if (lastState) render(lastState);
    try { render(await action()); }
    catch { element('update-status').textContent = 'Não foi possível comunicar com o atualizador. Feche e abra as configurações para tentar novamente.'; }
    finally {
      requesting = false;
      if (lastState) {
        element('check-updates').disabled = !['idle', 'not-available', 'available', 'error'].includes(lastState.status);
        element('download-update').disabled = false;
        element('install-update').disabled = false;
      }
    }
  }
  const unsubscribe = window.auditoria.onUpdateState(render);
  window.addEventListener('beforeunload', unsubscribe, { once: true });
  element('check-updates').addEventListener('click', () => request(window.auditoria.checkUpdates));
  element('download-update').addEventListener('click', () => request(window.auditoria.downloadUpdate));
  element('install-update').addEventListener('click', () => request(window.auditoria.installUpdate));
  element('open-settings').addEventListener('click', () => request(window.auditoria.getUpdateState));
  request(window.auditoria.getUpdateState);
})();
