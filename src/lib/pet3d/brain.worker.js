import { evaluateFelineDecision } from './brainDecision.js';
let geometry = null;
self.onmessage = ({ data }) => {
  if (data.geometry) geometry = data.geometry;
  self.postMessage({ id: data.id, result: evaluateFelineDecision(data.context, geometry) });
};
