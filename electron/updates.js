// Only the main process owns the updater and its installation state.
function createUpdateController({ updater, version, disabledReason = '', sendState, confirmInstall, beforeInstall, logError }) {
  let state = { revision: 0, currentVersion: version, status: disabledReason ? 'disabled' : 'idle', message: disabledReason || 'Clique em Verificar atualizações.', availableVersion: null, percent: 0 };
  let operation = false;
  const snapshot = () => ({ ...state });
  function change(patch) {
    state = { ...state, ...patch, revision: state.revision + 1 };
    sendState(snapshot());
  }
  function failure(error) {
    logError(error);
    change({ status: 'error', message: 'Não foi possível concluir a atualização. Verifique sua conexão e tente verificar novamente.', percent: 0 });
  }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  updater.on('checking-for-update', () => change({ status: 'checking', message: 'Verificando atualizações...', availableVersion: null, percent: 0 }));
  updater.on('update-available', (info) => change({ status: 'available', availableVersion: info.version, message: `Versão ${info.version} disponível.` }));
  updater.on('update-not-available', () => change({ status: 'not-available', availableVersion: null, message: 'Você está usando a versão mais recente.' }));
  updater.on('download-progress', (progress) => {
    if (state.status !== 'downloading') return;
    const percent = Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0;
    change({ percent, message: `Baixando atualização: ${Math.floor(percent)}%.` });
  });
  updater.on('update-downloaded', (info) => change({ status: 'downloaded', availableVersion: info.version, percent: 100, message: `Versão ${info.version} pronta para instalar.` }));
  updater.on('error', failure);
  return {
    snapshot,
    async check() {
      if (disabledReason || operation || ['downloaded', 'installing'].includes(state.status)) return snapshot();
      operation = true;
      change({ status: 'checking', message: 'Verificando atualizações...', availableVersion: null, percent: 0 });
      try { await updater.checkForUpdates(); }
      catch (error) { if (state.status !== 'error') failure(error); }
      finally { operation = false; }
      return snapshot();
    },
    async download() {
      if (disabledReason || operation || state.status !== 'available') return snapshot();
      operation = true;
      change({ status: 'downloading', percent: 0, message: 'Iniciando download...' });
      try { await updater.downloadUpdate(); }
      catch (error) { if (state.status !== 'error') failure(error); }
      finally { operation = false; }
      return snapshot();
    },
    async install() {
      if (disabledReason || operation || state.status !== 'downloaded') return snapshot();
      operation = true;
      try {
        if (await confirmInstall()) {
          change({ status: 'installing', message: 'Instalando atualização e reiniciando...' });
          beforeInstall();
          updater.quitAndInstall(false, true);
        }
      } catch (error) { failure(error); }
      finally { operation = false; }
      return snapshot();
    }
  };
}
module.exports = { createUpdateController };
