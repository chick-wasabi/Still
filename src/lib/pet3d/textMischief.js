import { createScratchMarks } from './scratchMarks.js';
// Decorative ranges never replace React text nodes or touch persisted journal/task content.
export function collectTextTargets(host, toWorld) {
  const targets = [],
    origin = host.getBoundingClientRect();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const element = node.parentElement;
    if (
      !element ||
      !node.textContent.trim() ||
      element.closest(
        'input,textarea,select,script,style,[contenteditable],.pet3d-layer,.sr-only,[aria-hidden="true"],[inert]',
      )
    )
      continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3 || rect.right < origin.left || rect.left > origin.right)
      continue;
    const top = rect.top - origin.top;
    const left = rect.left - origin.left;
    const clip = element.closest('.folder-tree')?.getBoundingClientRect();
    if (clip && (rect.top < clip.top || rect.bottom > clip.bottom)) continue;
    targets.push({
      node,
      element,
      point: toWorld(left + Math.min(rect.width / 2, 90), top + rect.height / 2),
      left,
      top,
      width: rect.width,
      height: rect.height,
      rects: Array.from(range.getClientRects(), (r) => ({
        left: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
      })),
    });
  }
  return targets;
}

export function createTextMischief(host, input) {
  let healTimer = 0,
    stolen = null;
  const highlights = globalThis.CSS?.highlights;
  const marks = createScratchMarks(host);
  function canPlay(target) {
    return (
      target?.node?.isConnected &&
      !target.element.closest('input,textarea,[contenteditable],[inert]') &&
      !input.reduced &&
      !input.paused &&
      !window.getSelection()?.toString()
    );
  }
  function restoreLetter(animate = false) {
    clearTimeout(healTimer);
    if (animate && input.stolenLetter && !input.reduced && !input.paused)
      input.letterRelease = {
        text: input.stolenLetter,
        x: input.mouth?.x || 0,
        y: input.mouth?.y || 0,
        at: performance.now() / 1000,
      };
    else input.letterRelease = null;
    highlights?.delete('still-cat-letter');
    input.stolenLetter = null;
    stolen = null;
  }
  function healScratch() {
    marks.clear();
  }
  function scratch(target, paw = null) {
    if (input.reduced || input.paused || window.getSelection()?.toString()) return false;
    if (target && !canPlay(target)) return false;
    const contact = paw || input.paws?.[0];
    if (!contact) return false;
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target.node);
      const origin = host.getBoundingClientRect();
      const nearest = [...range.getClientRects()]
        .map((rect) => {
          const x = Math.max(rect.left, Math.min(rect.right, contact.x * 40 + origin.left));
          const y = Math.max(rect.top, Math.min(rect.bottom, -contact.y * 40 + origin.top));
          return {
            x: (x - origin.left) / 40,
            y: -(y - origin.top) / 40,
            d: Math.hypot(x - origin.left - contact.x * 40, y - origin.top + contact.y * 40),
          };
        })
        .sort((a, b) => a.d - b.d)[0];
      if (!nearest || nearest.d > 22) return false;
      return marks.add(nearest, target.element);
    }
    return marks.add(contact);
  }
  function steal(target, random = Math.random, mouth = input.mouth) {
    if (!mouth || !canPlay(target)) return false;
    restoreLetter();
    const text = target.node.textContent;
    const graphemes = globalThis.Intl?.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
      : Array.from(text).map((segment, i) => ({
          segment,
          index: Array.from(text).slice(0, i).join('').length,
        }));
    const letters = graphemes.filter((g) => /[\p{L}\p{N}]/u.test(g.segment));
    if (!letters.length) return false;
    let picked = letters[Math.floor(random() * letters.length)];
    if (mouth) {
      const origin = host.getBoundingClientRect();
      let closest = Infinity;
      for (const candidate of letters) {
        const r = document.createRange();
        r.setStart(target.node, candidate.index);
        r.setEnd(target.node, candidate.index + candidate.segment.length);
        const rect = r.getBoundingClientRect();
        const dx = rect.left - origin.left + rect.width / 2 - mouth.x * 40;
        const dy = rect.top - origin.top + rect.height / 2 + mouth.y * 40;
        const distance = Math.hypot(dx, dy);
        if (distance < closest) {
          closest = distance;
          picked = candidate;
        }
      }
      if (closest > 22) return false;
    }
    const range = document.createRange();
    range.setStart(target.node, picked.index);
    range.setEnd(target.node, picked.index + picked.segment.length);
    if (highlights && globalThis.Highlight)
      highlights.set('still-cat-letter', new Highlight(range));
    stolen = range;
    input.stolenLetter = picked.segment;
    // Restoration runs even when physics/rendering is paused or the source node is replaced.
    input.letterExpiresAt = performance.now() + 5000 + random() * 5000;
    healTimer = setTimeout(() => restoreLetter(true), input.letterExpiresAt - performance.now());
    return true;
  }
  return {
    scratch,
    steal,
    restoreLetter,
    healScratch,
    dispose() {
      restoreLetter();
      marks.dispose();
    },
    get scratchCount() {
      return marks.size;
    },
    get holding() {
      return Boolean(stolen);
    },
  };
}
