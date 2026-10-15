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
        '.sidebar,[data-cat-surface],.entry-card,.habit-panel,.task-composer,.sticky-task,.notepad-section-heading,.page-intro h1,.task-page-header h1,.habit-matrix tr,.calendar-day,.sidebar nav button,.sidebar .brand,.sidebar .profile-button',
      ),
    ];
    for (const element of elements) {
      if (!element.getClientRects().length || element.closest('.pet3d-layer')) continue;
      const style = getComputedStyle(element);
      const opaque = (color) =>
        color &&
        color !== 'transparent' &&
        !/(?:rgba\([^)]*,|rgb\([^)]*\/)\s*0(?:\.0+)?\s*\)$/.test(color);
      const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) =>
          parseFloat(style['border' + side + 'Width']) > 0 &&
          opaque(style['border' + side + 'Color']),
      );
      const filled =
        !element.matches('.sidebar') &&
        (opaque(style.backgroundColor) || style.backgroundImage !== 'none');
      // Transparent wrappers and their padding never become solid walls. Their
      // text is measured independently below, at visible line edges.
      if (!bordered && !filled) continue;
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
      const top = rect.top - origin.top,
        bottom = rect.bottom - origin.top;
      if (right <= left || bottom < 0 || top > view.height) continue;
      if (!ids.has(element)) ids.set(element, `ui-${nextId++}`);
      const a = screenToWorld(left, top, view),
        b = screenToWorld(right, bottom, view);
      const kind =
        element.dataset.catSurface ||
        (element.matches('.entry-card') ? 'journal' : heading ? 'header' : 'panel');
      const hollow = bordered || element.matches('.calendar-panel,.habit-panel,.entry-card');
      const box = {
        id: ids.get(element),
        kind,
        left: a.x,
        right: b.x,
        top: a.y,
        bottom: a.y - 0.025,
        oneWay: true,
        sticky: Boolean(sidebar),
      };
      if (box.right - box.left < 0.1) continue;
      const edgeVisible = (side) =>
        filled ||
        (parseFloat(style['border' + side + 'Width']) > 0 &&
          opaque(style['border' + side + 'Color']));
      if (edgeVisible('Top')) boxes.push(box);
      if (hollow && !element.matches('.calendar-day,.habit-matrix tr,button')) {
        if (edgeVisible('Left'))
          boxes.push({
            sensor: true,
            sticky: Boolean(sidebar),
            id: box.id + '-left',
            kind: 'wall',
            left: a.x,
            right: a.x + 0.035,
            top: a.y,
            bottom: b.y,
          });
        if (edgeVisible('Right'))
          boxes.push({
            sensor: true,
            sticky: Boolean(sidebar),
            id: box.id + '-right',
            kind: 'wall',
            left: b.x - 0.035,
            right: b.x,
            top: a.y,
            bottom: b.y,
          });
      }
      elementsById.set(box.id, heading || element.querySelector('h2,h3,.sticky-title') || element);
      if (
        edgeVisible('Top') &&
        top > CAT.halfHeight * 2 * view.unit + 4 &&
        top < view.height - 4 &&
        box.right - box.left > CAT.halfWidth * 2 + 0.1
      )
        surfaces.push(box);
    }
    const textTargets = collectTextTargets(host, (x, y) => screenToWorld(x, y, view));
    const fontMetrics = new Map();
    const measure = document.createElement('canvas').getContext('2d');
    textTargets.forEach((target) => {
      if (!textIds.has(target.node)) textIds.set(target.node, `text-${nextId++}`);
      const style = getComputedStyle(target.element),
        font = style.font || `${style.fontSize} ${style.fontFamily}`;
      if (!fontMetrics.has(font)) {
        measure.font = font;
        const ink = measure.measureText('Hg');
        fontMetrics.set(
          font,
          (ink.actualBoundingBoxAscent || parseFloat(style.fontSize) * 0.75) +
            (ink.actualBoundingBoxDescent || parseFloat(style.fontSize) * 0.15),
        );
      }
      for (const [i, rect] of (target.rects || [target]).entries()) {
        if (rect.width < 3 || rect.top < 55 || rect.top > view.height) continue;
        const inkTop = rect.top + Math.max(0, (rect.height - fontMetrics.get(font)) / 2);
        const a = screenToWorld(Math.max(0, rect.left), inkTop, view),
          b = screenToWorld(Math.min(view.width, rect.left + rect.width), inkTop + 1, view);
        const ledge = {
          id: textIds.get(target.node) + '-' + i,
          kind: 'text',
          left: a.x,
          right: b.x,
          top: a.y,
          bottom: b.y,
          oneWay: true,
          sticky: Boolean(target.element.closest('.sidebar')),
        };
        // Short glyphs remain interaction targets, not tiny invisible obstacles.
        if (ledge.right - ledge.left > CAT.halfWidth * 2 + 0.08) boxes.push(ledge);
        if (ledge.right - ledge.left > CAT.halfWidth * 2 + 0.08) {
          surfaces.push(ledge);
          if (!target.surface) target.surface = ledge;
        }
      }
    });
    const bounds = {
      width: view.width / view.unit,
      height: view.height / view.unit,
      left: 0,
      right: view.width / view.unit,
      top: 0,
      bottom: -view.height / view.unit,
    };
    surfaces.push({
      id: 'floor',
      kind: 'floor',
      left: bounds.left,
      right: bounds.right,
      top: bounds.bottom + 0.08,
      bottom: bounds.bottom,
    });
    boxes.push(
      {
        id: 'left',
        kind: 'wall',
        sensor: true,
        left: bounds.left - 0.035,
        right: bounds.left,
        top: 0,
        bottom: bounds.bottom,
      },
      {
        id: 'right',
        kind: 'wall',
        sensor: true,
        left: bounds.right,
        right: bounds.right + 0.035,
        top: 0,
        bottom: bounds.bottom,
      },
    );
    // Round subpixel DOM noise. Ordinary document surfaces remain stable on
    // scroll; sticky surfaces intentionally move within the shared origin.
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
    if (
      records.some(
        (r) =>
          !(r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('.pet3d-layer'),
      )
    ) {
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
  // Refresh nested scrollers and sticky sidebar geometry on document scroll.
  const nestedScroll = (event) => {
    if (event.target === document || host.contains(event.target)) refresh();
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
