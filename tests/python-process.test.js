const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const children = [], timers = new Map(), handlers = new Map();
  let nextTimer = 0;
  const app = { getPath: () => '.', whenReady: () => ({ then() {} }), on() {} };
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return { app, ipcMain: { handle: (name, fn) => handlers.set(name, fn) } };
      if (name === './session-store') return {};
      if (name === './translation-session') return require('../electron/translation-session');
      if (name === 'node:child_process') return { spawn() {
        const child = new EventEmitter();
        for (const stream of ['stdout', 'stderr']) {
          child[stream] = new EventEmitter(); child[stream].setEncoding = () => {};
        }
        child.stdin = { write(line, callback) { child.request = JSON.parse(line); callback(); } };
        child.kill = () => { child.killed = true; };
        children.push(child);
        return child;
      } };
      return require(name);
    },
    __dirname: path.resolve(__dirname, '../electron'), process,
    console: { error() {} },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8'), context);
  const stages = [];
  const event = { sender: { isDestroyed: () => false, send: (_name, value) => stages.push(value) } };
  return { children, timers, handlers, stages, call: () => handlers.get('python:call')(event, 'compare', {}) };
}

test('cancel kills the worker, rejects pending calls and ignores late events after restart', async () => {
  const h = harness();
  const first = h.call();
  const rejected = assert.rejects(first, /Operação cancelada/);
  const old = h.children[0];
  old.stdout.emit('data', JSON.stringify({ id: old.request.id, progress: 'Comparando...' }) + '\n');
  assert.deepEqual(h.stages, ['Comparando...']);
  h.handlers.get('python:cancel')();
  await rejected;
  assert.equal(old.killed, true);
  assert.equal(h.timers.size, 0);
  const next = h.call();
  const current = h.children[1];
  old.emit('exit', 1, null);
  old.stdout.emit('data', JSON.stringify({ id: current.request.id, ok: true, result: 'stale' }) + '\n');
  current.stdout.emit('data', JSON.stringify({ id: current.request.id, ok: true, result: 'valid' }) + '\n');
  assert.equal(await next, 'valid');
});

test('timeout also stops actual work instead of only discarding the response', async () => {
  const h = harness();
  const result = h.call();
  const rejected = assert.rejects(result, /10 minutos/);
  const timeout = [...h.timers.values()][0];
  assert.equal(timeout.ms, 600000);
  timeout.fn();
  await rejected;
  assert.equal(h.children[0].killed, true);
  assert.equal(h.timers.size, 0);
});
