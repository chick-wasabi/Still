import {
  CAT,
  clamp,
  distance,
  jumpPoint,
  planJump,
  safePoint,
  surfacePoint,
  findPerch,
  visibleSurface,
} from './geometry.js';

export function createCompanionController(root, { reduced = false, suspended = false } = {}) {
  let surfaces = [],
    obstacles = [],
    viewport = { width: innerWidth, height: innerHeight },
    sidebar = null;
  let current = null,
    attached = null,
    phase = 0,
    moving = null,
    frame = 0,
    measureFrame = 0,
    wake = 0,
    settle = 0,
    last = 0,
    disposed = false,
    blocked = false,
    forcedPause = suspended,
    scratched = null;
  const observed = new Set();
  const setMode = (mode) => {
    root.dataset.behavior = mode;
  };
  function clearScratch() {
    if (scratched) {
      scratched.removeAttribute('data-cat-scratched');
      scratched = null;
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(wake);
    wake = 0;
    moving = null;
    clearScratch();
    root.removeAttribute('data-moving');
    root.removeAttribute('data-petted');
  }
  function paint(point) {
    current = point;
    root.style.transform = `translate3d(${(point.x - CAT.width / 2).toFixed(2)}px,${(point.y - CAT.height).toFixed(2)}px,0)`;
  }
  function hold(mode, seconds, done = advance) {
    setMode(mode);
    root.removeAttribute('data-moving');
    if (!reduced && !blocked)
      wake = setTimeout(() => {
        wake = 0;
        clearScratch();
        done();
      }, seconds * 1000);
  }
  function animate(to, mode, duration, arc, done) {
    if (!current) return;
    setMode(mode);
    root.dataset.moving = 'true';
    if (Math.abs(to.x - current.x) > 2) root.dataset.facing = to.x >= current.x ? 'right' : 'left';
    moving = { from: { ...current }, to, mode, duration, arc, done, elapsed: 0 };
    last = 0;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }
  function tick(time) {
    frame = 0;
    if (disposed || blocked || !moving) return;
    const delta = last ? Math.min((time - last) / 1000, 0.04) : 0;
    last = time;
    moving.elapsed += delta;
    const t = Math.min(1, moving.elapsed / moving.duration);
    const eased = t;
    const point = moving.arc
      ? jumpPoint(moving.from, moving.to, moving.arc, eased)
      : {
          x: moving.from.x + (moving.to.x - moving.from.x) * eased,
          y: moving.from.y + (moving.to.y - moving.from.y) * eased,
        };
    paint(point);
    if (t < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const done = moving.done;
    moving = null;
    root.removeAttribute('data-moving');
    done?.();
  }
  function hop(surface, done = () => hold('idle', 1.2)) {
    if (!surface || !current) {
      advance();
      return;
    }
    const to = findPerch(surface, obstacles, viewport, surface.kind === 'button' ? 0.5 : 0.6);
    if (!to) {
      hold('idle', 0.8);
      return;
    }
    const arc = planJump(current, to, obstacles, viewport);
    if (!arc) {
      hold('idle', 0.8);
      return;
    }
    attached = null;
    root.dataset.surface = 'air';
    animate(to, 'jumping', arc.duration, arc.height, () => {
      attached = surface;
      root.dataset.surface = surface.kind;
      hold('landing', 0.22, done);
    });
  }
  function walk(done = advance) {
    if (!attached || !current) {
      hold('idle', 1);
      return;
    }
    const mid = (attached.left + attached.right) / 2;
    const to = surfacePoint(attached, current.x < mid ? 0.86 : 0.14);
    if (
      Array.from({ length: 25 }, (_, index) => ({
        x: current.x + ((to.x - current.x) * index) / 24,
        y: current.y + ((to.y - current.y) * index) / 24,
      })).some((point) => !safePoint(point, obstacles, viewport))
    ) {
      hold('idle', 1);
      return;
    }
    animate(to, 'running', clamp(distance(current, to) / 135, 0.6, 3.8), 0, done);
  }
  function visitSidebar() {
    const collection = surfaces.find((item) => item.kind === 'collection');
    const scratch = () => {
      scratched = collection?.element.querySelector('.folder-name > span:last-child');
      scratched?.setAttribute('data-cat-scratched', 'true');
      hold('scratching', 2.6);
    };
    if (!sidebar || sidebar.width < 120 || !current) {
      hop(surfaces.find((item) => item.kind === 'calendar'));
      return;
    }
    const panel = surfaces.find((item) => item.kind === 'calendar' || item.kind === 'panel');
    if (panel && panel.left - sidebar.right < 50) {
      hop(collection || panel, collection ? scratch : undefined);
      return;
    }
    const x = Math.min(
      sidebar.right + CAT.width / 2 + 3,
      (panel?.left ?? innerWidth) - CAT.width / 2 - 3,
    );
    const wallStart = { x, y: current.y };
    const wallEnd = {
      x,
      y: clamp(
        collection?.top ?? sidebar.top + 210,
        CAT.height + CAT.margin + 4,
        viewport.height - 40,
      ),
    };
    const arc = planJump(current, wallStart, obstacles, viewport);
    // A wall climb must remain outside all panel bodies as well.
    if (
      !arc ||
      Array.from({ length: 25 }, (_, i) => ({
        x,
        y: wallStart.y + ((wallEnd.y - wallStart.y) * i) / 24,
      })).some((point) => !safePoint(point, obstacles, viewport))
    ) {
      hop(
        collection || surfaces.find((item) => item.kind === 'calendar'),
        collection ? scratch : undefined,
      );
      return;
    }
    attached = null;
    root.dataset.surface = 'air';
    animate(wallStart, 'jumping', arc.duration, arc.height, () => {
      root.dataset.surface = 'sidebar-wall';
      root.dataset.climbDirection = wallEnd.y < wallStart.y ? 'up' : 'down';
      root.dataset.facing = wallEnd.y < wallStart.y ? 'left' : 'right';
      animate(wallEnd, 'climbing', clamp(distance(wallStart, wallEnd) / 90, 0.8, 2.4), 0, () => {
        if (!collection) {
          hold('idle', 1);
          return;
        }
        hop(collection, scratch);
      });
    });
  }
  function advance() {
    if (disposed || blocked || !current) return;
    const step = phase++ % 8;
    root.dataset.phase = String(step);
    if (step === 0 || step === 6) {
      walk(() => hold('idle', 0.45));
      return;
    }
    if (step === 1) {
      hold('rolling', 2.3);
      return;
    }
    if (step === 2) {
      hold(attached && attached.right - attached.left > 320 ? 'playing' : 'idle', 3.2);
      return;
    }
    if (step === 3) {
      hold('sleeping', 6);
      return;
    }
    if (step === 4) {
      hop(surfaces.find((item) => item.kind === 'button'));
      return;
    }
    if (step === 5) {
      visitSidebar();
      return;
    }
    hop(
      surfaces.find((item) => item.kind === 'calendar') ||
        surfaces.find((item) => item.kind === 'panel'),
      () => hold('sleeping', 2),
    );
  }
  function measure() {
    measureFrame = 0;
    if (disposed) return;
    const modal = Boolean(
      document.querySelector(
        '[role="dialog"],.workspace-menu,.folder-menu,.emoji-popover,.task-options[open]',
      ),
    );
    const nextBlocked = forcedPause || document.hidden || modal;
    if (nextBlocked) {
      blocked = true;
      stop();
      root.hidden = true;
      return;
    }
    const wasBlocked = blocked;
    blocked = false;
    viewport = { width: innerWidth, height: innerHeight };
    const candidates = [
      ...document.querySelectorAll('[data-cat-surface],.habit-panel,.notepad-section-heading'),
    ];
    const next = [];
    // Read geometry together. Animation frames only write transforms afterwards.
    for (const element of candidates) {
      if (!element.isConnected || !element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect();
      const tree = element.closest('.folder-tree');
      const clip = tree?.getBoundingClientRect();
      const geometry = visibleSurface(rect, viewport, clip);
      if (geometry)
        next.push({ ...geometry, element, kind: element.dataset.catSurface || 'panel' });
    }
    obstacles = [
      ...document.querySelectorAll(
        '.calendar-panel,.habit-panel,.entry-card,.sticky-task,.task-composer,.task-page-header h1,[data-cat-surface="button"]',
      ),
    ]
      .filter((element) => element.getClientRects().length)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.bottom > 0 && rect.top < viewport.height);
    sidebar = document.querySelector('.sidebar')?.getBoundingClientRect() || null;
    surfaces = next.filter((item) => findPerch(item, obstacles, viewport));
    const home =
      surfaces.find((item) => item.kind === 'calendar') ||
      surfaces.find((item) => item.kind === 'panel') ||
      surfaces.find((item) => item.kind === 'button');
    const previous = attached && surfaces.find((item) => item.element === attached.element);
    const chosen = previous || home;
    const targets = [
      document.querySelector('.sidebar'),
      document.querySelector('#main-content'),
      ...candidates,
    ].filter(Boolean);
    for (const element of observed)
      if (!targets.includes(element)) {
        resizeObserver.unobserve(element);
        observed.delete(element);
      }
    for (const element of targets)
      if (!observed.has(element)) {
        resizeObserver.observe(element);
        observed.add(element);
      }
    if (!chosen) {
      stop();
      root.hidden = true;
      return;
    }
    const fraction =
      previous && current
        ? clamp(
            (current.x - previous.left - CAT.width / 2 - CAT.margin) /
              Math.max(1, previous.right - previous.left - CAT.width - CAT.margin * 2),
            0,
            1,
          )
        : 0.2;
    stop();
    attached = chosen;
    root.dataset.surface = chosen.kind;
    paint(findPerch(chosen, obstacles, viewport, fraction));
    root.hidden = false;
    if (reduced) {
      setMode('sleeping');
      root.dataset.resting = 'true';
      return;
    }
    root.removeAttribute('data-resting');
    if (wasBlocked || !moving) hold('idle', 0.5);
  }
  function refresh() {
    if (disposed || measureFrame) return;
    measureFrame = requestAnimationFrame(measure);
  }
  const resizeObserver = new ResizeObserver(refresh);
  const mutations = new MutationObserver((records) => {
    if (records.some((record) => !root.contains(record.target))) refresh();
  });
  mutations.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['inert', 'aria-expanded', 'open'],
  });
  window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('scroll', refresh, { passive: true, capture: true });
  document.addEventListener('visibilitychange', refresh);
  const pet = () => {
    if (blocked || root.hidden) return;
    if (reduced) {
      root.dataset.petted = 'true';
      clearTimeout(wake);
      wake = setTimeout(() => root.removeAttribute('data-petted'), 1500);
      return;
    }
    stop();
    hold('rolling', 2.3);
  };
  root.addEventListener('click', pet);
  refresh();
  return {
    refresh() {
      refresh();
      clearTimeout(settle);
      settle = setTimeout(refresh, 220);
    },
    suspend(value) {
      forcedPause = value;
      refresh();
    },
    destroy() {
      disposed = true;
      stop();
      cancelAnimationFrame(measureFrame);
      clearTimeout(settle);
      resizeObserver.disconnect();
      mutations.disconnect();
      root.removeEventListener('click', pet);
      window.removeEventListener('resize', refresh);
      document.removeEventListener('scroll', refresh, true);
      document.removeEventListener('visibilitychange', refresh);
    },
  };
}
