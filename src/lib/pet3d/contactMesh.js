import { Vector3 } from 'three';
const adjacencyCache = new WeakMap();

// Calibrated vertices seed a local descent on the actual deformed surface. This
// finds contact points that move between vertices during a pose crossfade or
// gaze adjustment without rescanning tens of thousands of vertices each frame.
export function createSupportSampler(skin, seeds) {
  const geometry = skin.geometry,
    count = geometry.attributes.position.count;
  let graph = adjacencyCache.get(geometry);
  if (!graph) {
    const index = geometry.index,
      degree = new Uint32Array(count);
    if (index)
      for (let i = 0; i < index.count; i += 3) {
        degree[index.getX(i)] += 2;
        degree[index.getX(i + 1)] += 2;
        degree[index.getX(i + 2)] += 2;
      }
    const offsets = new Uint32Array(count + 1);
    for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + degree[i];
    const neighbours = new Uint32Array(offsets[count]),
      cursor = offsets.slice();
    if (index)
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        neighbours[cursor[a]++] = b;
        neighbours[cursor[a]++] = c;
        neighbours[cursor[b]++] = a;
        neighbours[cursor[b]++] = c;
        neighbours[cursor[c]++] = a;
        neighbours[cursor[c]++] = b;
      }
    graph = { offsets, neighbours };
    adjacencyCache.set(geometry, graph);
  }
  const point = new Vector3(),
    stamps = new Uint32Array(count),
    heights = new Float64Array(count);
  // Search each anatomical basin, not just the globally lowest seed. During a
  // crossfade a different limb can contain a lower point beyond its seed's ridge.
  const groups = new Map(),
    weights = geometry.attributes.skinWeight,
    joints = geometry.attributes.skinIndex;
  for (const i of seeds) {
    let dominant = 0,
      weight = -1;
    for (let k = 0; k < 4; k++)
      if (weights.getComponent(i, k) > weight) {
        weight = weights.getComponent(i, k);
        dominant = joints.getComponent(i, k);
      }
    if (!groups.has(dominant)) groups.set(dominant, []);
    groups.get(dominant).push(i);
  }
  const basins = [...groups.values()];
  let frame = 0;
  function height(i) {
    if (stamps[i] !== frame) {
      point.fromBufferAttribute(geometry.attributes.position, i);
      skin.applyBoneTransform(i, point).applyMatrix4(skin.matrixWorld);
      heights[i] = point.y;
      stamps[i] = frame;
    }
    return heights[i];
  }
  return function sample() {
    frame++;
    let lowest = Infinity;
    for (const basin of basins) {
      let local = Infinity,
        best = -1;
      for (const i of basin) {
        const y = height(i);
        if (y < local) {
          local = y;
          best = i;
        }
      }
      for (let step = 0; step < 32 && best >= 0; step++) {
        const previous = best;
        for (let j = graph.offsets[previous]; j < graph.offsets[previous + 1]; j++) {
          const i = graph.neighbours[j],
            y = height(i);
          if (y < local - 1e-8) {
            local = y;
            best = i;
          }
        }
        if (best === previous) break;
      }
      lowest = Math.min(lowest, local);
    }
    return lowest;
  };
}
