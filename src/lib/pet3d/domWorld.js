import { CAT, PET_UNIT, screenToWorld } from './math';
import { collectTextTargets } from './textMischief';

// Page coordinates have a permanent top-left origin. Scrolling never invalidates physics.
export function observeDomWorld(host, onChange) {
  let frame = 0,
    settle = 0,
    disposed = false,
    signature = '',
    nextId = 0;
  const observed = new Set(),
    ids = new WeakMap(),
    textIds = new WeakMap();
  const resize = new ResizeObserver(refresh);
  function measure() {
    frame = 0;
    if (disposed || !host.isConnected) return;
    const origin = host.getBoundingClientRect();
    const view = {
      width: host.clientWidth,
      height: host.clientHeight,
      unit: PET_UNIT,
      document: true,
    };
    if (!view.width || !view.height) return;
    const boxes = [],
      surfaces = [],
      elementsById = new Map();
    const elements = [
      ...host.querySelectorAll(
        '[data-cat-surface],.entry-card,.habit-panel,.task-composer,.sticky-task,.notepad-section-heading,.page-intro h1,.task-page-header h1,.habit-matrix tr,.calendar-day,.sidebar .nav-item,.sidebar .brand,.sidebar .profile-button',
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
      const left = Math.max(0, rect.left - origin.left),
        right = Math.min(view.width, rect.right - origin.left);
      const sidebar = element.closest('.sidebar');
      const sidebarRect = sidebar?.getBoundingClientRect();
      const top = sidebar ? rect.top - sidebarRect.top : rect.top - origin.top,
        bottom = sidebar ? rect.bottom - sidebarRect.top : rect.bottom - origin.top;
      if (right <= left || bottom < 0 || top > view.height) continue;
      if (!ids.has(element)) ids.set(element, `ui-${nextId++}`);
      const a = screenToWorld(left, top, view),
        b = screenToWorld(right, bottom, view);
      const kind =
        element.dataset.catSurface ||
        (element.matches('.entry-card') ? 'journal' : heading ? 'header' : 'panel');
      const hollow = element.matches('.calendar-panel,.habit-panel,.entry-card');
      const thin =
        kind === 'header' ||
        kind === 'collection' ||
        element.matches(
          '.notepad-section-heading,.calendar-day,.habit-matrix tr,.nav-item,.brand,.profile-button',
        );
      const box = {
        id: ids.get(element),
        kind,
        left: a.x,
        right: b.x,
        top: a.y,
        bottom: thin || hollow ? a.y - 0.045 : b.y,
      };
      if (box.right - box.left < 0.1) continue;
      boxes.push(box);
      if (hollow) {
        boxes.push({
          id: box.id + '-left',
          kind: 'wall',
          left: a.x,
          right: a.x + 0.035,
          top: a.y,
          bottom: b.y,
        });
        boxes.push({
          id: box.id + '-right',
          kind: 'wall',
          left: b.x - 0.035,
          right: b.x,
          top: a.y,
          bottom: b.y,
        });
        boxes.push({
          id: box.id + '-bottom',
          kind: 'panel',
          left: a.x,
          right: b.x,
          top: b.y + 0.035,
          bottom: b.y,
        });
      }
      elementsById.set(box.id, heading || element.querySelector('h2,h3,.sticky-title') || element);
      if (
        top > CAT.halfHeight * 2 * view.unit + 4 &&
        top < view.height - 4 &&
        box.right - box.left > CAT.halfWidth * 2 + 0.1
      )
        surfaces.push(box);
    }
    const textTargets = collectTextTargets(host, (x, y) => screenToWorld(x, y, view));
    textTargets.forEach((target) => {
      if (target.width < CAT.halfWidth * 2 * view.unit + 6 || target.top < 55) return;
      if (!textIds.has(target.node)) textIds.set(target.node, `text-${nextId++}`);
      const a = screenToWorld(target.left, target.top + target.height + 9, view),
        b = screenToWorld(
          Math.min(view.width, target.left + target.width),
          target.top + target.height + 10,
          view,
        );
      const ledge = {
        id: textIds.get(target.node),
        kind: 'text',
        left: a.x,
        right: b.x,
        top: a.y,
        bottom: b.y,
      };
      boxes.push(ledge);
      surfaces.push(ledge);
      target.surface = ledge;
    });
    const bounds = {
      width: view.width / view.unit,
      height: view.height / view.unit,
      left: 0,
      right: view.width / view.unit,
      top: 0,
      bottom: -view.height / view.unit,
    };
    // Round subpixel DOM noise; a scroll offset cancels out of every measured rectangle.
    const key = JSON.stringify(
      [
        view,
        boxes,
        textTargets.map((t) => [t.left, t.top, t.width, t.height, t.node.textContent.slice(0, 96)]),
      ],
      (_, value) => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value),
    );
    if (key !== signature) {
      signature = key;
      onChange({ view, bounds, boxes, surfaces, elementsById, textTargets, revision: key });
    }
    const targets = [host, ...elements];
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
  observer.observe(host, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['inert', 'open', 'aria-expanded'],
  });
  window.addEventListener('resize', refresh, { passive: true });
  // A nested scrolling card changes its own surfaces; document scroll does not.
  const nestedScroll = (event) => {
    if (event.target !== document && host.contains(event.target)) refresh();
  };
  document.addEventListener('scroll', nestedScroll, { passive: true, capture: true });
  refresh();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', refresh);
    document.removeEventListener('scroll', nestedScroll, true);
  };
}

// A bounded raster window moves inside the absolute document layer. Bodies never move with it.
// This avoids allocating a 20,000px-high GPU framebuffer for a long journal.
export function observeRenderWindow(host, onChange) {
  let frame = 0,
    previous = '',
    disposed = false;
  function measure() {
    frame = 0;
    if (disposed) return;
    const rect = host.getBoundingClientRect(),
      height = Math.min(host.clientHeight, Math.ceil((innerHeight + 512) / 256) * 256, 2048);
    const top = Math.min(
      Math.max(0, host.clientHeight - height),
      Math.max(0, Math.floor((-rect.top - 256) / 256) * 256),
    );
    const raster = { top, height, width: host.clientWidth };
    const key = JSON.stringify(raster);
    if (key !== previous) {
      previous = key;
      onChange(raster);
    }
  }
  function refresh() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  const resize = new ResizeObserver(refresh);
  resize.observe(host);
  window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('scroll', refresh, { passive: true, capture: true });
  refresh();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    window.removeEventListener('resize', refresh);
    document.removeEventListener('scroll', refresh, true);
  };
}
