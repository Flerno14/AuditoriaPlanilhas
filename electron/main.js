const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { readSession, writeSession } = require('./session-store');

let python;
let pythonLastError;
let nextId = 1;
const pending = new Map();
let inputBuffer = '';
let pythonStderr = '';

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return { templates: {}, changeColor: '#FFA500', alignByFirstColumn: false, validateUniqueFirstColumn: true }; }
}

function logPython(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.error(line.trimEnd());
  try {
    const logPath = path.join(app.getPath('userData'), 'python-bridge.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (error) {
    console.error(`Não foi possível gravar o log da ponte Python: ${error.message}`);
  }
}

function rejectPending(error) {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
}

function stopPython(message) {
  const child = python;
  python = null;
  rejectPending(new Error(message));
  if (child) child.kill();
}

function summarizePythonFailure(stderr) {
  const cpuFailure = stderr.match(/NumPy was built with baseline optimizations:\s*\(([^)]+)\).*?doesn't support:\s*\(([^)]+)\)/s);
  if (cpuFailure) {
    return `CPU incompatível: NumPy exige ${cpuFailure[1]}, mas este servidor não oferece ${cpuFailure[2]}. Gere novamente o instalador com a dependência numpy<2.4.`;
  }
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = [...lines].reverse().find((line) => !/^(Traceback|File |During handling|importlib|_find_and_load|exec_module)/.test(line));
  return summary ? `Detalhes: ${summary.slice(-500)}` : '';
}

function startPython() {
  pythonLastError = null;
  pythonStderr = '';
  inputBuffer = '';
  let child;
  if (app.isPackaged) {
    const executable = path.join(process.resourcesPath, 'python', 'bridge.exe');
    child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } else {
    const script = path.join(__dirname, '..', 'python', 'bridge.py');
    const command = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    child = spawn(command, ['-u', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  }
  python = child;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (python !== child) return;
    inputBuffer += chunk;
    const lines = inputBuffer.split('\n');
    inputBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        if (message.progress) { waiter.progress?.(message.progress); continue; }
        pending.delete(message.id);
        message.ok ? waiter.resolve(message.result) : waiter.reject(new Error(message.error));
      } catch (error) {
        logPython(`Resposta inválida da ponte Python: ${error.message}; dados=${line.slice(0, 500)}`);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (python !== child) return;
    pythonStderr = (pythonStderr + chunk).slice(-8000);
    logPython(`[stderr] ${chunk.trimEnd()}`);
  });
  child.on('error', (error) => {
    if (python !== child) return;
    pythonLastError = `Falha ao iniciar a lógica de planilhas: ${error.message}`;
    logPython(pythonLastError);
    rejectPending(new Error(pythonLastError));
    if (python === child) python = null;
  });
  child.on('exit', (code, signal) => {
    if (python !== child) return;
    const detail = summarizePythonFailure(pythonStderr);
    pythonLastError = `O processo da lógica de planilhas foi encerrado (código ${code}${signal ? `, sinal ${signal}` : ''}).${detail ? ` ${detail}` : ''}`;
    logPython(pythonLastError);
    rejectPending(new Error(pythonLastError));
    if (python === child) python = null;
  });
}

function callPython(action, payload = {}, progress) {
  if (!python) startPython();
  const child = python;
  if (!child) return Promise.reject(new Error(pythonLastError || 'Não foi possível iniciar a lógica de planilhas.'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopPython('O processamento excedeu 10 minutos e foi interrompido. Tente trabalhar com uma planilha menor.');
    }, 600000);
    pending.set(id, {
      progress,
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (error) => { clearTimeout(timeout); reject(error); }
    });
    child.stdin.write(`${JSON.stringify({ ...payload, id, action, reportProgress: true })}\n`, (error) => {
      if (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(new Error(`Falha ao enviar solicitação à lógica de planilhas: ${error.message}`));
      }
    });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380, height: 900, minWidth: 1000, minHeight: 680,
    backgroundColor: '#f5f7f6',
    title: 'Auditoria de Planilhas',
    icon: path.join(__dirname, '..', 'app.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('files:open', async (_event, slot) => {
  const result = await dialog.showOpenDialog({ title: slot === 1 ? 'Selecionar arquivo original' : 'Selecionar arquivo modificado', properties: ['openFile'], filters: [{ name: 'Planilhas Excel', extensions: ['xlsx', 'xlsm'] }] });
  if (result.canceled || !result.filePaths.length) return null;
  const file = result.filePaths[0];
  return { path: file, name: path.basename(file) };
});
ipcMain.handle('files:open-template', async () => {
  const result = await dialog.showOpenDialog({ title: 'Selecionar modelo de exportação', properties: ['openFile'], filters: [{ name: 'Planilhas Excel', extensions: ['xlsx'] }] });
  return result.canceled || !result.filePaths.length ? null : { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
});
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('session:get', () => readSession(path.join(app.getPath('userData'), 'audit-session.json')));
ipcMain.handle('session:save', (_event, session) => writeSession(path.join(app.getPath('userData'), 'audit-session.json'), session));
ipcMain.handle('session:clear', () => {
  fs.rmSync(path.join(app.getPath('userData'), 'audit-session.json'), { force: true });
  fs.rmSync(path.join(app.getPath('userData'), 'audit-session.json.tmp'), { force: true });
});
ipcMain.handle('review:confirm-discard', async (event, action) => {
  const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: 'warning',
    title: 'Descartar decisões da revisão?',
    message: action === 'clear' ? 'Esta ação remove as duas seleções e apaga a sessão de revisão salva.' : 'Esta ação refaz a comparação e descarta as decisões da revisão atual.',
    detail: action === 'clear' ? 'Os arquivos Excel não serão excluídos. Deseja continuar?' : 'As diferenças voltarão a ficar pendentes. Deseja continuar?',
    buttons: ['Cancelar', 'Descartar decisões e continuar'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return result.response === 1;
});
ipcMain.handle('settings:save', (_event, settings) => {
  const current = readSettings();
  const color = /^#[0-9a-f]{6}$/i.test(settings?.changeColor) ? settings.changeColor.toUpperCase() : current.changeColor;
  const templates = {};
  for (const key of ['differences', 'choices']) {
    const candidate = settings?.templates?.[key];
    templates[key] = typeof candidate === 'string' && path.isAbsolute(candidate) ? candidate : null;
  }
  const next = { ...current, ...settings, templates, changeColor: color, alignByFirstColumn: settings?.alignByFirstColumn === true, validateUniqueFirstColumn: settings?.validateUniqueFirstColumn !== false };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
});
ipcMain.handle('files:save', async (_event, { name, content }) => {
  const result = await dialog.showSaveDialog({ title: 'Salvar arquivo gerado', defaultPath: name, filters: [{ name: 'Planilhas Excel', extensions: [path.extname(name).slice(1) || 'xlsx'] }] });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, Buffer.from(content, 'base64'));
  return result.filePath;
});
ipcMain.handle('python:call', (event, action, payload) => callPython(action, payload, (stage) => {
  if (!event.sender.isDestroyed()) event.sender.send('python:progress', stage);
}));
ipcMain.handle('python:cancel', () => { stopPython('Operação cancelada.'); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startPython();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { if (python) python.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
