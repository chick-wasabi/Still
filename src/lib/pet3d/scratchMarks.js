// Decorative claw decals. Never wrap/replace React text or alter saved content.
export function createScratchMarks(host, random = Math.random) {
  const marks = [],
    ns = 'http://www.w3.org/2000/svg';
  let frame = 0;
  function remove(mark) {
    clearTimeout(mark.timer);
    mark.svg.remove();
    const i = marks.indexOf(mark);
    if (i >= 0) marks.splice(i, 1);
    if (mark.target && !marks.some((m) => m.target === mark.target))
      mark.target.removeAttribute('data-pet-scratched');
  }
  function position(mark) {
    if (mark.target && !mark.target.isConnected) {
      remove(mark);
      return;
    }
    const origin = host.getBoundingClientRect();
    const rect = mark.target?.getBoundingClientRect();
    const x = rect ? rect.left - origin.left + mark.local.x : mark.x;
    const y = rect ? rect.top - origin.top + mark.local.y : mark.y;
    mark.svg.style.transform = `translate3d(${x - 15}px,${y - 16}px,0)`;
  }
  function refresh() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        [...marks].forEach(position);
      });
  }
  function add(contact, target = null) {
    const layer = host.querySelector('.pet3d-layer');
    if (!layer) return false;
    while (marks.length >= 12) remove(marks[0]);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 36');
    svg.classList.add('pet3d-claw-mark');
    svg.setAttribute('aria-hidden', 'true');
    const life = 5000 + random() * 15000;
    svg.style.setProperty('--scratch-life', `${life}ms`);
    const angle = -18 + random() * 36;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `rotate(${angle} 16 18)`);
    svg.append(g);
    for (let i = 0; i < 3; i++) {
      const x = 7 + i * 6,
        bend = 2 + random() * 3;
      const d = `M ${x} ${4 + random() * 3} Q ${x + bend} 16 ${x - 3} ${27 + random() * 5}`;
      for (const [stroke, width, offset] of [
        ['#081212cc', 2.5, 1],
        ['#ead9aeaa', 0.7, 0],
      ]) {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', width);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('transform', `translate(${offset} ${offset})`);
        g.append(path);
      }
    }
    const origin = host.getBoundingClientRect(),
      rect = target?.getBoundingClientRect();
    const x = contact.x * 40,
      y = -contact.y * 40;
    const mark = {
      svg,
      x,
      y,
      target,
      local: rect ? { x: x - (rect.left - origin.left), y: y - (rect.top - origin.top) } : null,
    };
    layer.append(svg);
    marks.push(mark);
    position(mark);
    target?.setAttribute('data-pet-scratched', 'true');
    mark.timer = setTimeout(() => remove(mark), life);
    return true;
  }
  document.addEventListener('scroll', refresh, { passive: true, capture: true });
  window.addEventListener('resize', refresh, { passive: true });
  return {
    add,
    clear() {
      [...marks].forEach(remove);
    },
    dispose() {
      this.clear();
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    },
    get size() {
      return marks.length;
    },
  };
}
