const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdateController } = require('../electron/updates');

function fixture(options = {}) {
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: 0, stops: 0, confirmations: 0 };
  const states = [];
  updater.checkForUpdates = async () => { calls.checks++; updater.emit('update-available', { version: '1.0.4' }); };
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('download-progress', { percent: 42.5 }); updater.emit('update-downloaded', { version: '1.0.4' }); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent, false); assert.equal(restart, true); calls.installs++; };
  const controller = createUpdateController({
    updater, version: '1.0.3', sendState: (state) => states.push(state), logError: () => {},
    beforeInstall: () => { calls.stops++; },
    confirmInstall: async () => { calls.confirmations++; return true; }, ...options
  });
  return { updater, controller, calls, states };
}

test('verificação não baixa; download e instalação exigem ações separadas', async () => {
  const { updater, controller, calls, states } = fixture();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.disableWebInstaller, true);
  await controller.download(); await controller.install();
  assert.equal(calls.downloads + calls.installs, 0);
  assert.equal((await controller.check()).status, 'available');
  assert.equal(calls.downloads, 0);
  assert.equal((await controller.download()).status, 'downloaded');
  assert.ok(states.some((state) => state.status === 'downloading' && state.percent === 42.5));
  assert.equal(calls.installs, 0);
  await controller.check();
  assert.equal(calls.checks, 1, 'não descarta um download pronto');
  await controller.install(); await controller.install();
  assert.equal(calls.installs, 1);
  assert.equal(calls.stops, 1);
});

test('desenvolvimento e portátil não verificam, baixam ou instalam', async () => {
  const { controller, calls } = fixture({ disabledReason: 'Instale pelo NSIS.' });
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(controller.snapshot().status, 'disabled');
  assert.equal(calls.checks + calls.downloads + calls.installs, 0);
});

test('cancelar confirmação mantém atualização pronta e não encerra a ponte', async () => {
  const { controller, calls } = fixture({ confirmInstall: async () => false });
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(controller.snapshot().status, 'downloaded');
  assert.equal(calls.installs + calls.stops, 0);
});

test('falha de integridade bloqueia instalação e permite nova verificação', async () => {
  const { updater, controller, calls } = fixture();
  await controller.check();
  updater.downloadUpdate = async () => { const error = new Error('sha512 mismatch'); updater.emit('error', error); throw error; };
  assert.equal((await controller.download()).status, 'error');
  await controller.install();
  assert.equal(calls.installs, 0);
  assert.equal((await controller.check()).status, 'available');
});

test('ações concorrentes não iniciam downloads ou verificações duplicados', async () => {
  const { updater, controller, calls } = fixture();
  let finish;
  updater.checkForUpdates = () => { calls.checks++; return new Promise((resolve) => { finish = resolve; }); };
  const checking = controller.check();
  await controller.check(); await controller.download();
  assert.equal(calls.checks, 1);
  assert.equal(calls.downloads, 0);
  updater.emit('update-available', { version: '1.0.4' }); finish(); await checking;
  updater.downloadUpdate = () => { calls.downloads++; return new Promise((resolve) => { finish = resolve; }); };
  const downloading = controller.download();
  await controller.check(); await controller.download(); await controller.install();
  assert.equal(calls.checks, 1); assert.equal(calls.downloads, 1); assert.equal(calls.installs, 0);
  updater.emit('update-downloaded', { version: '1.0.4' }); finish(); await downloading;
});

test('falha de conexão recupera e ausência de versão nova é apresentada', async () => {
  const { updater, controller } = fixture();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  assert.equal((await controller.check()).status, 'error');
  updater.checkForUpdates = async () => updater.emit('update-not-available', { version: '1.0.3' });
  assert.equal((await controller.check()).status, 'not-available');
});

test('electron-updater compara versões semanticamente e impede downgrade', async () => {
  const { NsisUpdater } = require('electron-updater');
  const updater = new NsisUpdater(null, { version: '1.0.3', isPackaged: true });
  createUpdateController({ updater, version: '1.0.3', sendState: () => {}, logError: () => {} });
  assert.equal(await updater.isUpdateAvailable({ version: '1.0.2' }), false);
  assert.equal(await updater.isUpdateAvailable({ version: '1.0.3' }), false);
  assert.equal(await updater.isUpdateAvailable({ version: '1.0.10' }), true);
  await assert.rejects(updater.isUpdateAvailable({ version: 'invalid' }));
});
