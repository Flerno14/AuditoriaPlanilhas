/* Pure audit rules shared by the screen and tests. Scores are not probabilities. */
const TranslationAuditRules = (() => {
  const validation = typeof module !== 'undefined' ? require('./translation-validation') : TranslationValidation;
  function numbers(value, language) {
    const decimal = language === 'en' ? '.' : ',';
    const grouping = language === 'en' ? ',' : '.';
    return (value.match(/[-+−]?\d+(?:[.,\u00a0\u202f]\d+)*/g) || []).map((token) => {
      const unsigned = token.replace(/^[-+−]/, '');
      const parts = unsigned.split(decimal);
      // Unknown formats (versions, malformed grouping) stay literal rather than
      // silently turning unrelated digit runs into the same value.
      const integer = parts[0];
      const groups = integer.split(new RegExp(`[${grouping === '.' ? '\\.' : grouping}\\u00a0\\u202f]`));
      const invalidGrouping = groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((part) => !/^\d{3}$/.test(part)));
      if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1])) || invalidGrouping)
        return `literal:${token}`;
      // Keep leading zeroes in codes; they may identify a different record.
      const whole = groups.join('');
      const fraction = (parts[1] || '').replace(/0+$/, '');
      const sign = /^[-−]/.test(token) && (whole !== '0' || fraction) ? '-' : '';
      return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
    }).sort().join('|');
  }
  function inspect(row) {
    const a = row.source.trim(), b = row.target.trim();
    const issues = validation.check(row.source, row.target);
    let priority = 'Sem alerta objetivo';
    if (a && !b) issues.unshift('Tradução vazia.');
    if (!a && b) issues.unshift('Original em inglês vazio.');
    if (!a && !b) return { issues: ['Par vazio: sem conteúdo para avaliar.'], priority: 'Não avaliado' };
    if (issues.length) priority = 'Alta';
    if (a && b && numbers(a, 'en') !== numbers(b, 'pt')) {
      issues.push('Números divergentes: confira valores e formatos locais.');
      priority = 'Alta';
    }
    if (a && a === b) { issues.push('Textos idênticos: confirme se o termo dispensa tradução.'); if (priority !== 'Alta') priority = 'Conferir'; }
    if (a && b && (b.length / a.length < 0.35 || b.length / a.length > 3)) {
      issues.push('Diferença acentuada de comprimento: confira omissões ou acréscimos.');
      if (priority !== 'Alta') priority = 'Conferir';
    }
    if (row.semanticIssue) { issues.push(row.semanticIssue); if (priority !== 'Alta') priority = 'Conferir'; }
    return { issues, priority };
  }
  function rank(rows) {
    // Relative queue only: no uncalibrated quality thresholds or automatic approval.
    const scores = rows.filter((row) => Number.isFinite(row.score)).map((row) => row.score).sort((a, b) => a - b);
    const cutoff = scores.length >= 5 ? scores[Math.max(0, Math.ceil(scores.length * 0.2) - 1)] : null;
    for (const row of rows) {
      Object.assign(row, inspect(row));
      if (cutoff !== null && Number.isFinite(row.score) && row.score <= cutoff && row.priority !== 'Alta') {
        row.priority = 'Conferir';
        row.issues.push('Entre as menores proximidades deste documento (faixa inferior de 20%, incluindo empates).');
      }
    }
    return rows;
  }
  function alertType(issue) {
    return issue.split(':', 1)[0].replace(/\.$/, '').trim();
  }
  function matchesAlert(row, filter) {
    if (!filter) return true;
    if (filter === '__none__') return row.issues.length === 0;
    return row.issues.some((issue) => alertType(issue) === filter);
  }
  function applyReview(rows, review) {
    if (!['Não revisado', 'Revisado', 'Precisa corrigir'].includes(review)) return 0;
    let count = 0;
    for (const row of rows) {
      if (row.review === review) continue;
      row.review = review;
      count++;
    }
    return count;
  }
  return { inspect, rank, alertType, matchesAlert, applyReview };
})();
if (typeof module !== 'undefined') module.exports = TranslationAuditRules;
