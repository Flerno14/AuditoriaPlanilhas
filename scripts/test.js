const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON || (fs.existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
const javascriptTests = fs.readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.js')).map((name) => path.join('tests', name));
let failed = false;
for (const [command, args] of [
  [process.execPath, ['--test', ...javascriptTests]],
  [python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v']]
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(`Não foi possível executar os testes: ${result.error.message}`);
  if (result.error || result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
