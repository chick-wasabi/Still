import { evaluateFelineDecision } from './brainDecision.js';

export function createBehaviorBrain() {
  let worker = null,
    latest = null,
    busy = false,
    disposed = false,
    age = -Infinity,
    revision = null,
    seq = 0;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./brain.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!disposed) {
          latest = data;
          busy = false;
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        worker?.terminate();
        worker = null;
        busy = false;
        latest = null;
      };
    } catch {
      worker = null;
    }
  }
  return {
    observe(context, layout, time) {
      if (!worker || busy || time - age < 0.6 || disposed) return;
      let geometry;
      if (revision !== layout.revision) {
        revision = layout.revision;
        geometry = { boxes: layout.boxes, surfaces: layout.surfaces, bounds: layout.bounds };
      }
      busy = true;
      age = time;
      worker.postMessage({ id: ++seq, context, geometry });
    },
    take(context) {
      const candidate = latest?.result;
      latest = null;
      return candidate &&
        candidate.previous === context.previous &&
        candidate.ball === context.ball &&
        candidate.text === context.text
        ? candidate
        : evaluateFelineDecision(context);
    },
    get backend() {
      return worker ? 'worker' : 'main';
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      latest = null;
    },
  };
}
