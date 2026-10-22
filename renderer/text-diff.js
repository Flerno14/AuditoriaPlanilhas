// Bounded, word-level LCS. All returned text is original, never HTML.
const TextDiff = (() => {
  const tokenize = (text) => text.match(/[\p{L}\p{M}\p{N}_]+|\r\n|[^\p{L}\p{M}\p{N}_]/gu) || [];
  function compare(original, modified) {
    const a = tokenize(original), b = tokenize(modified);
    const left = [], right = [];
    function add(side, text, changed) {
      if (!text) return;
      const last = side.at(-1);
      if (last?.changed === changed) last.text += text;
      else side.push({ text, changed });
    }
    let start = 0, endA = a.length, endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    add(left, a.slice(0, start).join(''), false);
    add(right, b.slice(0, start).join(''), false);
    const n = endA - start, m = endB - start;
    // Avoid quadratic work on very large, unrelated translations. Keep exact
    // common edges and highlight the remaining block rather than freeze the UI.
    const coarse = (n + 1) * (m + 1) > 120000;
    if (coarse || !n || !m) {
      add(left, a.slice(start, endA).join(''), true);
      add(right, b.slice(start, endB).join(''), true);
    } else {
      const width = m + 1, scores = new Uint32Array((n + 1) * width);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
        scores[i * width + j] = a[start + i] === b[start + j]
          ? 1 + scores[(i + 1) * width + j + 1]
          : Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
      }
      let i = 0, j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && a[start + i] === b[start + j]) {
          add(left, a[start + i++], false); add(right, b[start + j++], false);
        } else if (i < n && (j === m || scores[(i + 1) * width + j] >= scores[i * width + j + 1])) {
          add(left, a[start + i++], true);
        } else add(right, b[start + j++], true);
      }
    }
    add(left, a.slice(endA).join(''), false);
    add(right, b.slice(endB).join(''), false);
    return { left, right, coarse };
  }
  function render(cell, parts, side) {
    cell.textContent = '';
    for (const part of parts) {
      const node = document.createElement(part.changed ? 'mark' : 'span');
      if (!part.changed) node.textContent = part.text;
      else {
        node.className = `text-diff-${side}`;
        node.title = side === 'removed' ? 'Trecho removido ou substituído do Arquivo 1' : 'Trecho adicionado ou substituído no Arquivo 2';
        const pieces = part.text.split(/(\r\n|[\s\u200B-\u200D\uFEFF])/u).filter(Boolean);
        if (pieces.length > 500) {
          node.textContent = part.text;
          node.title += ' (bloco extenso; símbolos de espaços omitidos)';
          cell.append(node);
          continue;
        }
        for (const piece of pieces) {
          const child = document.createElement('span');
          child.textContent = piece;
          if (/^[\s\u200B-\u200D\uFEFF]+$/u.test(piece)) {
            child.className = 'text-diff-whitespace';
            const symbols = { ' ': '␠', '\t': '⇥', '\n': '↵', '\r': '␍', '\r\n': '␍↵', '\u00A0': '⍽' };
            child.dataset.symbol = symbols[piece] || '◊';
            child.title = `Caractere alterado: ${Array.from(piece, (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ')}`;
          }
          node.append(child);
        }
      }
      cell.append(node);
    }
  }
  return { compare, render };
})();
if (typeof module !== 'undefined') module.exports = TextDiff;
