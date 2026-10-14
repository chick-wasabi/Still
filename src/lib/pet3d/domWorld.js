import { CAT, screenToWorld } from './math';

// Geometry is read only on invalidation. Neither React nor a render frame reads layout.
export function observeDomWorld(onChange) {
  let frame = 0,
    settle = 0,
    disposed = false,
    signature = '';
  const observed = new Set(),
    ids = new WeakMap();
  let nextId = 0;
  const resize = new ResizeObserver(refresh);
  function measure() {
    frame = 0;
    if (disposed) return;
    const view = { width: innerWidth, height: innerHeight, unit: innerWidth < 600 ? 64 : 78 };
    const boxes = [],
      surfaces = [],
      elements = [
        ...document.querySelectorAll(
          '[data-cat-surface],.entry-card,.habit-panel,.task-composer,.sticky-task,.notepad-section-heading,.page-intro h1,.task-page-header h1',
        ),
      ];
    for (const element of elements) {
      if (!element.getClientRects().length) continue;
      const heading =
        element.dataset.catSurface === 'header'
          ? element.querySelector('h1,h2,h3')
          : element.matches('h1')
            ? element
            : null;
      let rect = element.getBoundingClientRect();
      if (heading) {
        const range = document.createRange();
        range.selectNodeContents(heading);
        rect = range.getBoundingClientRect();
      }
      const clip = element.closest('.folder-tree')?.getBoundingClientRect();
      if (
        rect.bottom < 0 ||
        rect.top > view.height ||
        rect.right < 0 ||
        rect.left > view.width ||
        (clip && (rect.top < clip.top || rect.bottom > clip.bottom))
      )
        continue;
      if (!ids.has(element)) ids.set(element, `ui-${nextId++}`);
      const a = screenToWorld(Math.max(0, rect.left), rect.top, view),
        b = screenToWorld(Math.min(view.width, rect.right), rect.bottom, view);
      const kind =
        element.dataset.catSurface ||
        (element.matches('.entry-card') ? 'journal' : heading ? 'header' : 'panel');
      // Headers/collection rows have thin ledges; solid cards and controls have full bodies.
      const thin =
        kind === 'header' || kind === 'collection' || element.matches('.notepad-section-heading');
      const box = {
        id: ids.get(element),
        kind,
        left: a.x,
        right: b.x,
        top: a.y,
        bottom: thin ? a.y - 0.045 : b.y,
      };
      if (box.right - box.left < 0.1) continue;
      boxes.push(box);
      if (
        rect.top > CAT.halfHeight * 2 * view.unit + 15 &&
        rect.top < view.height - 12 &&
        box.right - box.left > CAT.halfWidth * 2 + 0.1
      )
        surfaces.push(box);
    }
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    if (sidebar && sidebar.width > 100 && sidebar.left >= 0 && sidebar.right < view.width * 0.6) {
      const edge = screenToWorld(sidebar.right, 0, view);
      boxes.push({
        id: 'sidebar-wall',
        kind: 'wall',
        left: edge.x - 0.045,
        right: edge.x,
        top: view.height / view.unit / 2,
        bottom: -view.height / view.unit / 2,
      });
    }
    const bounds = { width: view.width / view.unit, height: view.height / view.unit };
    const key = JSON.stringify([view, boxes]);
    if (key !== signature) {
      signature = key;
      onChange({ view, bounds, boxes, surfaces, revision: key });
    }
    const targets = [
      document.querySelector('#main-content'),
      document.querySelector('.sidebar'),
      ...elements,
    ].filter(Boolean);
    for (const e of observed)
      if (!targets.includes(e)) {
        resize.unobserve(e);
        observed.delete(e);
      }
    for (const e of targets)
      if (!observed.has(e)) {
        resize.observe(e);
        observed.add(e);
      }
  }
  function refresh() {
    if (!disposed && !frame) frame = requestAnimationFrame(measure);
  }
  function mutation(records) {
    if (records.some((r) => !r.target.closest?.('.pet3d-layer'))) {
      refresh();
      clearTimeout(settle);
      settle = setTimeout(refresh, 240);
    }
  }
  const observer = new MutationObserver(mutation);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['inert', 'open', 'aria-expanded'],
  });
  window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('scroll', refresh, { passive: true, capture: true });
  refresh();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', refresh);
    document.removeEventListener('scroll', refresh, true);
  };
}
