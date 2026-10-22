const path = require('node:path');
function validateTranslationSession(session) {
  if (session?.version !== 1 || typeof session.file?.path !== 'string' || !path.isAbsolute(session.file.path)
      || typeof session.file.name !== 'string' || !/^[a-f0-9]{64}$/.test(session.fingerprint || '')
      || !['sheet', 'source', 'target', 'identifier', 'model'].every((key) => typeof session[key] === 'string')
      || !Array.isArray(session.rows)) throw new Error('Sessão de tradução inválida.');
  for (const row of session.rows) {
    if (!Number.isInteger(row.line) || row.line < 2
        || !['source', 'target', 'identifier'].every((key) => typeof row[key] === 'string')
        || !(row.score === null || (Number.isFinite(row.score) && Math.abs(row.score) <= 1.001))
        || (row.semanticIssue !== undefined && typeof row.semanticIssue !== 'string')
        || !['Não revisado', 'Revisado', 'Precisa corrigir'].includes(row.review)) throw new Error('Linha inválida na sessão de tradução.');
  }
  return session;
}
module.exports = { validateTranslationSession };
