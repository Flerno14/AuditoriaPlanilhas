const fs = require('node:fs');
const path = require('node:path');

function validateSession(session) {
  const choices = ['Pendente', 'Manter Arquivo 1', 'Usar Arquivo 2', 'Valor personalizado'];
  if (session?.version !== 1 || !/^[a-f0-9]{64}$/.test(session.fingerprint || '')
      || typeof session.sheet !== 'string' || !session.sheet
      || typeof session.rules?.alignByFirstColumn !== 'boolean'
      || typeof session.rules?.validateUniqueFirstColumn !== 'boolean'
      || !Number.isInteger(session.newRows) || session.newRows < 0
      || !Array.isArray(session.report)) throw new Error('A sessão salva é inválida ou pertence a uma versão incompatível.');
  for (const file of [session.file1, session.file2]) {
    if (typeof file?.path !== 'string' || !path.isAbsolute(file.path)
        || typeof file.name !== 'string' || !Array.isArray(file.sheets)
        || !file.sheets.every((sheet) => typeof sheet === 'string')
        || !file.sheets.includes(session.sheet)) throw new Error('A sessão salva contém arquivos ou abas inválidos.');
  }
  for (const row of session.report) {
    if (!row || !Number.isInteger(row['Índice/Linha']) || row['Índice/Linha'] < 2
        || typeof row['Nome da Coluna'] !== 'string'
        || !Object.hasOwn(row, 'Valor no Arquivo 1') || !Object.hasOwn(row, 'Valor no Arquivo 2')
        || !choices.includes(row['Decisão'])
        || (row['Decisão'] === 'Valor personalizado' && typeof row['Valor personalizado'] !== 'string')) throw new Error('A sessão salva contém decisões inválidas.');
  }
  return session;
}

function readSession(filePath) {
  try { return validateSession(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Não foi possível recuperar a sessão: ${error.message}`);
  }
}

const writes = new Map();

function writeSession(filePath, session) {
  // Serialize writes for each destination so concurrent IPC requests cannot
  // overwrite each other's temporary file. A failed write does not block retry.
  const destination = path.resolve(filePath);
  const previous = writes.get(destination) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => persistSession(destination, session));
  writes.set(destination, current);
  const cleanup = () => { if (writes.get(destination) === current) writes.delete(destination); };
  current.then(cleanup, cleanup);
  return current;
}

async function persistSession(filePath, session) {
  validateSession(session);
  const saved = { ...session, savedAt: new Date().toISOString() };
  const temporary = `${filePath}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(temporary, JSON.stringify(saved), { encoding: 'utf8', flush: true });
    await fs.promises.rename(temporary, filePath);
  } catch (error) {
    throw new Error(`Não foi possível salvar a sessão. Mantenha o aplicativo aberto e tente novamente. ${error.message}`);
  }
  return saved.savedAt;
}

module.exports = { readSession, writeSession };
