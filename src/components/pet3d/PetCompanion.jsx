import React, {
  Component,
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Cat, CircleDot, RotateCcw } from 'lucide-react';
import useReducedMotion from '../../hooks/useReducedMotion';
import { observeDomWorld, observeRenderWindow } from '../../lib/pet3d/domWorld';
import { createPetInput, restoreNativeCursor } from '../../lib/pet3d/state';
const PetScene = lazy(() => import('./PetScene'));

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas'),
      gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
class RenderBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Companion({ enabled, ballEnabled, suspended, layoutKey }) {
  const layer = useRef(null),
    input = useMemo(createPetInput, []),
    reduced = useReducedMotion();
  const [layout, setLayout] = useState(null),
    [raster, setRaster] = useState(null),
    [ready, setReady] = useState(false),
    [supported, setSupported] = useState(supportsWebGL),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [occluded, setOccluded] = useState(false),
    [hidden, setHidden] = useState(document.hidden),
    [settling, setSettling] = useState(true);
  const paused = suspended || occluded || hidden || settling || failed;
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => {
    restoreNativeCursor(input);
    input.paused = true;
    setFailed(true);
  }, [input]);
  const onContextLost = useCallback(
    (event) => {
      event.preventDefault();
      onFailure();
    },
    [onFailure],
  );
  useLayoutEffect(() => {
    input.catEnabled = enabled;
    input.ballEnabled = ballEnabled;
    input.paused = paused;
    input.reduced = reduced;
    if (paused || reduced || !enabled) {
      restoreNativeCursor(input);
      input.restoreMischief?.();
    }
    return () => restoreNativeCursor(input);
  }, [input, paused, reduced, enabled, ballEnabled]);
  useEffect(() => {
    const host = layer.current.closest('.pet3d-host');
    input.host = host;
    const stop = observeDomWorld(host, (next) => setLayout({ ...next, pageKey: layoutKey }));
    const stopRaster = observeRenderWindow(host, setRaster);
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), 240);
    return () => {
      stop();
      stopRaster();
      clearTimeout(timer);
    };
  }, [layoutKey, input]);
  useEffect(() => {
    const sync = () => {
      const nav = document.querySelector('.mobile-sidebar-scrim');
      const navOpen = Boolean(nav?.getClientRects().length);
      const modal =
        navOpen ||
        Boolean(
          document.querySelector(
            '[role="dialog"],.workspace-menu,.folder-menu,.emoji-popover,.task-options[open]',
          ),
        );
      if (modal || document.hidden) restoreNativeCursor(input);
      setOccluded(modal);
      setHidden(document.hidden);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'inert', 'aria-expanded'],
    });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', sync, { passive: true });
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', sync);
      restoreNativeCursor(input);
    };
  }, [input]);
  async function retry() {
    restoreNativeCursor(input);
    try {
      const { clearCatAsset } = await import('./PetScene');
      clearCatAsset();
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSupported(supportsWebGL());
    setReady(false);
    setAttempt((n) => n + 1);
  }
  const unavailable = (!supported || failed) && !suspended;
  const fallback = (
    <div className="pet3d-unavailable" role="status">
      <span>Your companion is resting. 3D rendering is unavailable.</span>
      <button onClick={retry} aria-label="Retry 3D companion">
        <RotateCcw size={15} />
        Retry
      </button>
    </div>
  );
  return (
    <div
      ref={layer}
      className="pet3d-layer"
      data-ready={ready}
      data-paused={paused}
      data-reduced={reduced}
      data-physics="rapier"
      data-cat-enabled={enabled}
      data-ball-enabled={ballEnabled}
      aria-label="3D companion"
    >
      {!unavailable && supported && layout && raster && (
        <div
          className="pet3d-canvas"
          style={{
            top: raster.top,
            height: raster.height,
            visibility: paused ? 'hidden' : 'visible',
          }}
        >
          <RenderBoundary key={attempt} onFailure={onFailure} fallback={null}>
            <Suspense fallback={null}>
              <PetScene
                {...{ layout, raster, input, layer, onReady, onContextLost, paused, reduced }}
              />
            </Suspense>
          </RenderBoundary>
        </div>
      )}
      <span className="pet3d-bubble" aria-hidden="true" />
      <span className="pet3d-letter" aria-hidden="true" />
      {unavailable && fallback}
      {ready && !paused && (
        <div className="pet3d-controls" aria-label="Companion controls">
          {enabled && (
            <button
              className="pet3d-control"
              aria-label="Pet 3D cat"
              title="Pet your cat · Drag the cat to toss it"
              disabled={reduced}
              onClick={() => {
                input.command = 'pet';
              }}
            >
              <Cat size={17} />
            </button>
          )}
          {ballEnabled && (
            <button
              className="pet3d-control"
              aria-label="Toss toy ball"
              title="Toss the ball · You can also drag and throw it"
              disabled={reduced}
              onClick={() => {
                input.command = 'ball';
              }}
            >
              <CircleDot size={17} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default memo(function PetCompanion({
  enabled = true,
  ballEnabled = false,
  suspended = false,
  layoutKey = '',
}) {
  return enabled || ballEnabled ? (
    <Companion {...{ enabled, ballEnabled, suspended, layoutKey }} />
  ) : null;
});
