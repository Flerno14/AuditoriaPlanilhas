const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

let python;
let nextId = 1;
const pending = new Map();
let inputBuffer = '';

function startPython() {
  if (app.isPackaged) {
    const executable = path.join(process.resourcesPath, 'python', 'bridge.exe');
    python = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } else {
    const script = path.join(__dirname, '..', 'python', 'bridge.py');
    const command = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    python = spawn(command, ['-u', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  }
  python.stdout.setEncoding('utf8');
  python.stdout.on('data', (chunk) => {
    inputBuffer += chunk;
    const lines = inputBuffer.split('\n');
    inputBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          message.ok ? waiter.resolve(message.result) : waiter.reject(new Error(message.error));
        }
      } catch (error) { console.error('Resposta inválida do Python:', error); }
    }
  });
  python.stderr.on('data', (chunk) => console.error(`[Python] ${chunk}`));
  python.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(new Error(`Não foi possível iniciar o Python: ${error.message}`));
    pending.clear();
    python = null;
  });
  python.on('exit', (code) => {
    for (const waiter of pending.values()) waiter.reject(new Error(`O processo Python foi encerrado (${code}).`));
    pending.clear();
    python = null;
  });
}

function callPython(action, payload = {}) {
  if (!python) startPython();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    python.stdin.write(`${JSON.stringify({ id, action, ...payload })}\n`, (error) => {
      if (error) { pending.delete(id); reject(error); }
    });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380, height: 900, minWidth: 1000, minHeight: 680,
    backgroundColor: '#f5f7f6',
    title: 'Auditoria de Planilhas',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('files:open', async (_event, slot) => {
  const result = await dialog.showOpenDialog({ title: slot === 1 ? 'Selecionar arquivo original' : 'Selecionar arquivo modificado', properties: ['openFile'], filters: [{ name: 'Planilhas Excel', extensions: ['xlsx', 'xlsm'] }] });
  if (result.canceled || !result.filePaths.length) return null;
  const file = result.filePaths[0];
  return { path: file, name: path.basename(file), sheets: await callPython('sheets', { path: file }) };
});
ipcMain.handle('files:save', async (_event, { name, content }) => {
  const result = await dialog.showSaveDialog({ title: 'Salvar arquivo gerado', defaultPath: name, filters: [{ name: 'Planilhas Excel', extensions: [path.extname(name).slice(1) || 'xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  require('node:fs').writeFileSync(result.filePath, Buffer.from(content, 'base64'));
  return result.filePath;
});
ipcMain.handle('python:call', (_event, action, payload) => callPython(action, payload));

app.whenReady().then(() => { startPython(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('before-quit', () => { if (python) python.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
