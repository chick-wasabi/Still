import {
  CAT,
  clamp,
  distance,
  jumpPoint,
  planJump,
  safePoint,
  findPerch,
  visibleSurface,
} from './geometry.js';
import { between, pick, chooseBehavior, surfaceRoute } from './behavior.js';
import { createCursorToy } from './cursorToy.js';

export function createCompanionController(
  root,
  { reduced = false, suspended = false, random = Math.random } = {},
) {
  let surfaces = [],
    obstacles = [],
    viewport = { width: innerWidth, height: innerHeight },
    sidebar = null;
  let current = null,
    attached = null,
    moving = null,
    frame = 0,
    measureFrame = 0,
    wake = 0,
    settle = 0,
    last = 0;
  let disposed = false,
    blocked = false,
    forcedPause = suspended,
    scratched = null,
    previous = '',
    energy = 0.75;
  let pointer = null,
    pointerTime = 0,
    pressed = false,
    idleTimer = 0,
    cursorReady = false,
    game = null,
    gazeFrame = 0,
    idleDeadline = 0,
    layoutSignature = '',
    settlingLayout = false;
  const layer = root.parentElement;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const edges = new Map();
  const observed = new Set(),
    toy = createCursorToy(root);
  const setMode = (mode) => {
    root.dataset.behavior = mode;
  };
  const seconds = (min, max) => between(min, max, random);
  const available = () => !disposed && !blocked && !reduced && !root.hidden;
  const writing = () =>
    document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  const paw = () => ({
    x: current.x + (root.dataset.facing === 'left' ? -21 : 21),
    y: current.y - 17,
  });

  function clearScratch() {
    scratched?.removeAttribute('data-cat-scratched');
    scratched = null;
  }
  function cancelGame() {
    cursorReady = false;
    game = null;
    toy.end();
    for (const key of ['targetX', 'targetY', 'chirping']) delete root.dataset[key];
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(wake);
    moving = null;
    clearScratch();
    cancelGame();
    delete root.dataset.moving;
    delete root.dataset.petted;
  }
  function paint(point) {
    current = point;
    root.style.transform = `translate3d(${(point.x - CAT.width / 2).toFixed(2)}px,${(point.y - CAT.height).toFixed(2)}px,0)`;
  }
  function hold(mode, duration = seconds(2, 5), done = advance) {
    clearTimeout(wake);
    setMode(mode);
    delete root.dataset.moving;
    if (!reduced && !blocked)
      wake = setTimeout(() => {
        wake = 0;
        clearScratch();
        done();
      }, duration * 1000);
  }
  function animate(to, mode, duration, arc, done, visual = null) {
    if (!current) return;
    clearTimeout(wake);
    setMode(mode);
    root.dataset.moving = 'true';
    root.style.setProperty('--cat-look-x', '0px');
    root.style.setProperty('--cat-look-y', '0px');
    if (Math.abs(to.x - current.x) > 2) root.dataset.facing = to.x >= current.x ? 'right' : 'left';
    moving = { from: { ...current }, to, duration, arc, done, visual, elapsed: 0 };
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
    paint(
      moving.arc
        ? jumpPoint(moving.from, moving.to, moving.arc, t)
        : {
            x: moving.from.x + (moving.to.x - moving.from.x) * t,
            y: moving.from.y + (moving.to.y - moving.from.y) * t,
          },
    );
    if (toy.active) {
      const v = moving.visual,
        eased = t * t * (3 - 2 * t);
      toy.paint(
        v
          ? { x: v.from.x + (v.to.x - v.from.x) * eased, y: v.from.y + (v.to.y - v.from.y) * eased }
          : paw(),
        Math.sin(t * Math.PI * 4) * 12,
      );
    }
    if (t < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const done = moving.done;
    moving = null;
    delete root.dataset.moving;
    done?.();
  }
  function follow(route, mode, done, guard = () => true) {
    const step = route.shift();
    if (!step) {
      done();
      return;
    }
    attached = null;
    root.dataset.surface = step.arc ? 'air' : step.surface.kind;
    animate(
      step.point,
      step.arc ? 'pouncing' : mode,
      step.arc?.duration ??
        clamp(distance(current, step.point) / (mode === 'stalk-running' ? 220 : 115), 0.35, 3),
      step.arc?.height ?? 0,
      () => {
        attached = step.surface;
        root.dataset.surface = attached.kind;
        if (!guard()) {
          hold('idle', seconds(1, 2));
          return;
        }
        if (cursorReady && !game) {
          advance();
          return;
        }
        follow(route, mode, done, guard);
      },
    );
  }
  function routeFor(surface, preferred = random()) {
    return surfaceRoute(
      current,
      attached,
      surface,
      surfaces,
      obstacles,
      viewport,
      preferred,
      edges,
    );
  }
  function visit(surface, done = () => hold('idle'), mode = 'prowling') {
    const route = surface && routeFor(surface);
    if (!route) {
      hold('idle', seconds(1, 2));
      return;
    }
    follow(route, mode, done);
  }
  function scratch(surface) {
    scratched =
      surface.element.querySelector('.folder-name > span:last-child,h3') || surface.element;
    scratched.setAttribute('data-cat-scratched', 'true');
    hold('scratching', seconds(1.2, 2.8));
  }
  function climb() {
    const collection = pick(
      surfaces.filter((s) => s.kind === 'collection'),
      random,
    );
    if (!collection || !sidebar || !current) {
      hold('stretching');
      return;
    }
    const panel = surfaces.find((s) => s.kind === 'calendar' || s.kind === 'panel');
    const x = sidebar.right + CAT.width / 2 + 3,
      start = { x, y: current.y },
      end = { x, y: collection.top };
    const arc = planJump(current, start, obstacles, viewport);
    const exit = surfaceRoute(
      end,
      null,
      collection,
      surfaces,
      obstacles,
      viewport,
      random(),
      edges,
    );
    if (
      (panel && panel.left - sidebar.right < CAT.width + 8) ||
      !arc ||
      !exit ||
      Array.from({ length: 40 }, (_, i) => ({ x, y: start.y + ((end.y - start.y) * i) / 39 })).some(
        (p) => !safePoint(p, obstacles, viewport),
      )
    ) {
      visit(collection, () => scratch(collection));
      return;
    }
    attached = null;
    root.dataset.surface = 'air';
    animate(start, 'pouncing', arc.duration, arc.height, () => {
      root.dataset.surface = 'sidebar-wall';
      root.dataset.climbDirection = end.y < start.y ? 'up' : 'down';
      root.dataset.facing = end.y < start.y ? 'left' : 'right';
      animate(end, 'climbing', clamp(distance(start, end) / 90, 0.8, 2.4), 0, () =>
        follow(exit, 'prowling', () => scratch(collection)),
      );
    });
  }
  function advance() {
    if (!available() || !current) return;
    if (cursorReady && pointer && !pressed && !writing()) {
      targetCursor();
      return;
    }
    const decision = chooseBehavior(
      {
        energy,
        previous,
        wide: attached && attached.right - attached.left > 320,
        collections: surfaces.some((s) => s.kind === 'collection'),
        buttons: surfaces.some((s) => s.kind === 'button'),
        near: pointer && distance(pointer, current) < 230,
      },
      random,
    );
    previous = decision;
    root.dataset.decision = decision;
    energy = clamp(
      energy + (decision === 'sleeping' ? seconds(0.25, 0.5) : -seconds(0.01, 0.09)),
      0,
      1,
    );
    if (decision === 'wander') {
      visit(pick(surfaces, random));
      return;
    }
    if (decision === 'scratching') {
      const surface = pick(
        surfaces.filter((s) => s.kind === 'collection'),
        random,
      );
      visit(surface, () => scratch(surface));
      return;
    }
    if (decision === 'batting') {
      visit(
        pick(
          surfaces.filter((s) => s.kind === 'button'),
          random,
        ),
        () => hold('batting', seconds(1.5, 3)),
      );
      return;
    }
    if (decision === 'climbing') {
      climb();
      return;
    }
    if (decision === 'sleeping') {
      const card = pick(
        surfaces.filter((s) => s.kind === 'journal'),
        random,
      );
      if (card && random() < 0.6) visit(card, () => hold('sleeping', seconds(5, 11)));
      else hold('sleeping', seconds(5, 11));
      return;
    }
    hold(decision, seconds(2, 5));
  }
  function armIdle(reset = true) {
    clearTimeout(idleTimer);
    if (!available() || !pointer || pressed) return;
    idleTimer = setTimeout(
      () => {
        if (!available() || writing() || pressed) return;
        cursorReady = true;
        // Finish the current ballistic segment before choosing a cursor route.
        if (!moving && attached) {
          clearTimeout(wake);
          clearScratch();
          targetCursor();
        }
      },
      seconds(6, 8) * 1000,
    );
  }
  function targetCursor() {
    cursorReady = false;
    if (!pointer || !attached || !available() || writing() || pressed) {
      hold('idle');
      return;
    }
    const target = { ...pointer },
      token = {};
    game = token;
    root.dataset.targetX = String(target.x);
    root.dataset.targetY = String(target.y);
    const near = [...surfaces].sort(
      (a, b) =>
        distance(findPerch(a, obstacles, viewport), target) -
        distance(findPerch(b, obstacles, viewport), target),
    );
    let route = null;
    for (const surface of near.slice(0, 8)) {
      route = routeFor(
        surface,
        clamp((target.x - surface.left) / (surface.right - surface.left), 0, 1),
      );
      if (route) break;
    }
    root.dataset.decision = 'target-cursor';
    root.dataset.facing = target.x >= current.x ? 'right' : 'left';
    hold('stalking', seconds(0.65, 1.1), () => {
      if (game !== token) {
        advance();
        return;
      }
      const grab = () => {
        if (game !== token) {
          advance();
          return;
        }
        hold('pounce-ready', seconds(0.25, 0.45), () => {
          if (game !== token) {
            advance();
            return;
          }
          // Reeling a visual from the exact pointer to the paw avoids walking into text.
          toy.begin(target);
          animate(current, 'grabbing', 0.48, 0, () => carryCursor(token), {
            from: target,
            to: paw(),
          });
        });
      };
      if (route) follow(route, 'stalk-running', grab, () => game === token);
      else grab();
    });
  }
  function carryCursor(token) {
    if (game !== token) {
      advance();
      return;
    }
    const candidates = surfaces.filter((s) => s !== attached);
    let route = null,
      attempts = 0;
    while (candidates.length && attempts++ < 8) {
      const surface = candidates.splice(Math.floor(random() * candidates.length), 1)[0],
        attempt = routeFor(surface);
      if (
        attempt &&
        attempt.length <= 2 &&
        attempt.reduce((n, s) => n + (s.arc?.duration ?? distance(current, s.point) / 115), 0) < 3.5
      ) {
        route = attempt;
        break;
      }
    }
    const release = () => {
      if (game !== token) {
        advance();
        return;
      }
      const to = {
        x: clamp(current.x + between(-85, 85, random), 18, viewport.width - 26),
        y: current.y - 20,
      };
      animate(
        current,
        'batting',
        0.45,
        0,
        () => {
          root.dataset.chirping = 'true';
          hold('stretching', 0.75, () => {
            cancelGame();
            armIdle();
            advance();
          });
        },
        { from: paw(), to },
      );
    };
    if (route) follow(route, 'carrying', release, () => game === token);
    else release();
  }
  function activity() {
    const wasPlaying = Boolean(game);
    cancelGame();
    if (wasPlaying && !moving && available()) hold('idle', seconds(1, 2));
    armIdle();
  }
  function gaze() {
    gazeFrame = 0;
    if (
      !current ||
      !pointer ||
      !available() ||
      moving ||
      game ||
      root.dataset.behavior === 'sleeping'
    )
      return;
    const dx = pointer.x - current.x,
      dy = pointer.y - (current.y - 35),
      near = Math.hypot(dx, dy) < 230;
    root.style.setProperty(
      '--cat-look-x',
      `${near ? clamp(dx / 65, -2.5, 2.5) * (root.dataset.facing === 'left' ? -1 : 1) : 0}px`,
    );
    root.style.setProperty('--cat-look-y', `${near ? clamp(dy / 80, -1.5, 1.5) : 0}px`);
  }
  function mousemove(event) {
    if (!finePointer.matches || event.sourceCapabilities?.firesTouchEvents) return;
    const now = performance.now(),
      next = { x: event.clientX, y: event.clientY };
    const speed = pointer ? distance(pointer, next) / Math.max(16, now - pointerTime) : 0;
    pointer = next;
    pointerTime = now;
    activity();
    if (speed < 0.8 && !gazeFrame) gazeFrame = requestAnimationFrame(gaze);
  }
  function nearClick(event) {
    if (
      !available() ||
      !current ||
      moving ||
      game ||
      root.contains(event.target) ||
      distance({ x: event.clientX, y: event.clientY }, current) > 125
    )
      return;
    clearTimeout(wake);
    clearScratch();
    const reaction = pick(['startled', 'tail-flick', 'stretching'], random);
    root.dataset.reaction = reaction;
    if (reaction === 'startled') {
      const arc = planJump(current, current, obstacles, viewport);
      if (arc) {
        animate(current, 'startled', 0.5, arc.height, () => hold('idle', seconds(1, 2)));
        return;
      }
    }
    hold(reaction === 'startled' ? 'tail-flick' : reaction, seconds(1, 2));
  }
  function pet() {
    if (blocked || root.hidden || moving) return;
    clearTimeout(wake);
    clearScratch();
    cancelGame();
    if (reduced) {
      root.dataset.petted = 'true';
      wake = setTimeout(() => delete root.dataset.petted, 1500);
      return;
    }
    hold('rolling', seconds(2, 3));
    armIdle();
  }
  function down() {
    pressed = true;
    activity();
  }
  function up() {
    pressed = false;
    activity();
  }
  function leave() {
    pressed = false;
    pointer = null;
    activity();
  }
  function measure() {
    measureFrame = 0;
    if (disposed) return;
    const modal = document.querySelector(
      '[role="dialog"],.workspace-menu,.folder-menu,.emoji-popover,.task-options[open]',
    );
    blocked = forcedPause || settlingLayout || document.hidden || Boolean(modal);
    if (blocked) {
      stop();
      clearTimeout(idleTimer);
      idleDeadline = 0;
      layoutSignature = '';
      root.hidden = true;
      return;
    }
    viewport = { width: innerWidth, height: innerHeight };
    const candidates = [
        ...document.querySelectorAll(
          '[data-cat-surface],.habit-panel,.notepad-section-heading,.entry-card',
        ),
      ],
      next = [];
    // Geometry reads happen only here or at a decision; animation frames write transforms.
    for (const element of candidates) {
      if (!element.isConnected || !element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect(),
        clip = element.closest('.folder-tree')?.getBoundingClientRect();
      const geometry = visibleSurface(rect, viewport, clip);
      if (geometry)
        next.push({
          ...geometry,
          element,
          kind:
            element.dataset.catSurface || (element.matches('.entry-card') ? 'journal' : 'panel'),
        });
    }
    obstacles = [
      ...document.querySelectorAll(
        '.calendar-panel,.habit-panel,.entry-card,.sticky-task,.task-composer,[data-cat-surface="button"],.folder-row,.topbar,.sidebar .search-button,.workspace-switcher',
      ),
    ]
      .filter((e) => e.getClientRects().length)
      .map((e) => e.getBoundingClientRect());
    // Exact text rectangles leave genuinely empty header space navigable.
    for (const block of document.querySelectorAll(
      '.page-intro,.journal-heading,.entries-heading,.task-page-header,.sidebar .brand,.sidebar nav,.nav-caption',
    )) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        obstacles.push(...range.getClientRects());
      }
    }
    obstacles = obstacles.filter(
      (rect) => rect.bottom > 0 && rect.top < viewport.height && rect.width > 0,
    );
    sidebar = document.querySelector('.sidebar')?.getBoundingClientRect() || null;
    surfaces = next.filter((s) => findPerch(s, obstacles, viewport));
    const home =
      surfaces.find((s) => s.kind === 'calendar') ||
      surfaces.find((s) => s.kind === 'journal') ||
      surfaces.find((s) => s.kind === 'panel') ||
      surfaces[0];
    const previousSurface = attached && surfaces.find((s) => s.element === attached.element),
      chosen = previousSurface || home;
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
    const signature = [...next, ...obstacles]
      .map((r) => `${r.left},${r.right},${r.top},${r.bottom}`)
      .join('|');
    if (
      signature === layoutSignature &&
      !root.hidden &&
      surfaces.some((s) => s.element === attached?.element || moving)
    )
      return;
    edges.clear();
    layoutSignature = signature;
    if (!chosen) {
      stop();
      root.hidden = true;
      return;
    }
    const fraction =
      previousSurface && current
        ? clamp(
            (current.x - previousSurface.left - CAT.width / 2 - CAT.margin) /
              Math.max(
                1,
                previousSurface.right - previousSurface.left - CAT.width - CAT.margin * 2,
              ),
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
    delete root.dataset.resting;
    hold('idle', seconds(1, 3));
    armIdle(false);
  }
  function refresh() {
    if (!disposed && !measureFrame) measureFrame = requestAnimationFrame(measure);
  }
  const resizeObserver = new ResizeObserver(refresh);
  const mutations = new MutationObserver((records) => {
    if (records.some((record) => !layer.contains(record.target))) refresh();
  });
  mutations.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['inert', 'aria-expanded', 'open'],
  });
  const listeners = [
    [window, 'resize', refresh, { passive: true }],
    [document, 'scroll', refresh, { passive: true, capture: true }],
    [document, 'visibilitychange', refresh],
    [document, 'mousemove', mousemove, { passive: true }],
    [document, 'pointerdown', down, { passive: true }],
    [document, 'pointerup', up, { passive: true }],
    [document, 'pointercancel', up, { passive: true }],
    [document, 'click', nearClick],
    [document, 'keydown', activity],
    [document, 'wheel', activity, { passive: true }],
    [document, 'touchstart', leave, { passive: true }],
    [document.documentElement, 'mouseleave', leave],
    [window, 'blur', leave],
    [root, 'click', pet],
  ];
  for (const [target, event, handler, options] of listeners)
    target.addEventListener(event, handler, options);
  refresh();
  return {
    refresh() {
      // A transformed page/expanding sidebar has no stable ledges until it settles.
      settlingLayout = true;
      stop();
      root.hidden = true;
      clearTimeout(settle);
      settle = setTimeout(
        () => {
          settlingLayout = false;
          refresh();
        },
        reduced ? 0 : 220,
      );
    },
    suspend(value) {
      forcedPause = value;
      refresh();
    },
    destroy() {
      disposed = true;
      stop();
      clearTimeout(idleTimer);
      cancelAnimationFrame(gazeFrame);
      cancelAnimationFrame(measureFrame);
      clearTimeout(settle);
      resizeObserver.disconnect();
      mutations.disconnect();
      for (const [target, event, handler, options] of listeners)
        target.removeEventListener(event, handler, options);
    },
  };
}
