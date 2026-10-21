/* Advisory checks only: never interpret markup or rewrite translation values. */
const TranslationValidation = (() => {
  function elements(value) {
    const text = typeof value === 'string' ? value : '';
    return {
      Marcadores: text.match(/\{\{[\w.-]+\}\}|\{[\w.-]+\}/gu) || [],
      Formatos: (text.match(/%%|%(?:\d+\$)?[-+#0 ']*(?:\d+|\*(?:\d+\$)?)?(?:\.(?:\d+|\*(?:\d+\$)?))?(?:hh|ll|[hlLjzt])?[diuoxXfFeEgGaAcspn]/g) || []).filter((item) => item !== '%%'),
      Tags: text.match(/<\/?[A-Za-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g) || [],
      URLs: (text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).map((url) => url.replace(/[.,;!?:)\]}]+$/g, '')),
    };
  }

  function counts(items) {
    const result = new Map();
    for (const item of items) result.set(item, (result.get(item) || 0) + 1);
    return result;
  }

  function check(original, candidate) {
    const before = elements(original), after = elements(candidate), issues = [];
    for (const category of Object.keys(before)) {
      const oldCounts = counts(before[category]), newCounts = counts(after[category]);
      for (const token of new Set([...oldCounts.keys(), ...newCounts.keys()])) {
        const delta = (newCounts.get(token) || 0) - (oldCounts.get(token) || 0);
        if (delta) issues.push(`${category}: ${delta < 0 ? 'removido' : 'adicionado'} ${JSON.stringify(token)} (${Math.abs(delta)}×).`);
      }
      // Placeholder order may change in a translation. Markup order matters.
      if (category === 'Tags' && before.Tags.length && JSON.stringify(before.Tags) !== JSON.stringify(after.Tags)
          && before.Tags.length === after.Tags.length
          && [...oldCounts].every(([token, count]) => newCounts.get(token) === count)) {
        issues.push('Tags: a ordem de abertura ou fechamento foi alterada.');
      }
      if (category === 'Formatos' && before.Formatos.some((token) => !/^%\d+\$/.test(token))
          && JSON.stringify(before.Formatos) !== JSON.stringify(after.Formatos)
          && before.Formatos.length === after.Formatos.length
          && [...oldCounts].every(([token, count]) => newCounts.get(token) === count)) {
        issues.push('Formatos: a ordem dos argumentos sem posição explícita foi alterada.');
      }
    }
    return issues;
  }
  return { check };
})();
if (typeof module !== 'undefined') module.exports = TranslationValidation;
