/* Advisory checks only: never interpret markup or rewrite translation values. */
const TranslationValidation = (() => {
  function normalizeTag(tag) {
    const [, closing, name, body, selfClosing] = tag.match(/^<(\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/) || [];
    if (!name || (closing && body.trim())) return tag;
    const attributes = [], names = new Set();
    const pattern = /\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let end = 0;
    for (const match of body.matchAll(pattern)) {
      if (match.index !== end || names.has(match[1])) return tag;
      names.add(match[1]); end = match.index + match[0].length;
      const value = match[2] ?? match[3] ?? match[4];
      attributes.push(match[1] + (value === undefined ? '' : `=${JSON.stringify(value)}`));
    }
    if (body.slice(end).trim()) return tag;
    attributes.sort();
    return `<${closing}${name}${attributes.length ? ` ${attributes.join(' ')}` : ''}${selfClosing}>`;
  }

  function urls(text) {
    return (text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).map((value) => {
      let url = value.replace(/[.,;!?:]+$/g, '');
      // Keep balanced parentheses in paths; strip only surrounding prose punctuation.
      const opening = { ')': '(', ']': '[', '}': '{' };
      while (opening[url.at(-1)]) {
        const close = url.at(-1), open = opening[close];
        if (url.split(close).length <= url.split(open).length) break;
        url = url.slice(0, -1).replace(/[.,;!?:]+$/g, '');
      }
      return url.replace(/[.,;!?:]+$/g, '');
    });
  }

  function printfFormats(text) {
    // URL escapes and Windows environment variables are not printf conversions.
    text = text.replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, '')
      .replace(/%[A-Z_][A-Z0-9_]+%/g, '');
    const tokens = text.matchAll(/%%|%(?:\d+\$)?[-+#0 ']*(?:\d+|\*(?:\d+\$)?)?(?:\.(?:\d+|\*(?:\d+\$)?))?(?:hh|ll|[hlLjzt])?[diuoxXfFeEgGaAcspn]/g);
    const formats = [];
    for (const match of tokens) {
      const token = match[0];
      if (token === '%%') continue;
      if (/^%[A-Za-z]$/.test(token) && /^[\p{L}\p{N}_]/u.test(text.slice(match.index + token.length))) continue;
      // A printf space flag is ambiguous in prose: "% shared" and "s% adicionada"
      // must not become "% s" and "% a". With whitespace, require explicit
      // position/width/precision and a complete conversion, not a word prefix.
      if (token.includes(' ') && (!/[\d.*]/.test(token)
          || /^[\p{L}\p{N}_]/u.test(text.slice(match.index + token.length)))) continue;
      formats.push(token);
    }
    return formats;
  }

  function elements(value) {
    const text = typeof value === 'string' ? value : '';
    return {
      Marcadores: text.match(/(?<!\{)(?:\{\{[\w.-]+\}\}|\{[\w.-]+\})(?!\})/gu) || [],
      Formatos: printfFormats(text),
      Tags: (text.match(/<\/?[A-Za-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g) || []).map(normalizeTag),
      URLs: urls(text),
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
