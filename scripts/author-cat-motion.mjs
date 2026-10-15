// node scripts/author-cat-motion.mjs SOURCE.glb OUTPUT.glb
// Author comfort clips on the existing rig; preserve the original mesh, atlas,
// credits and clips. Bake measured contacts so runtime never scans the full mesh.
import { readFile, writeFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLegIK } from '../src/lib/pet3d/legIK.js';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Expected source.glb output.glb');
const restOnly = process.argv.includes('--rest-poses-only');
const restNames = new Set(['Still_Sit', 'Still_Lie_Down', 'Still_Lie_Down_From_Sit', 'Still_Loaf']);
const replaces = (name) => (restOnly ? restNames.has(name) : name.startsWith('Still_'));
const bytes = await readFile(source),
  jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
let binary = bytes.subarray(28 + jsonLength, 28 + jsonLength + json.buffers[0].byteLength);
// Re-running against the shipped derivative replaces our clips rather than
// accumulating inaccessible accessors and binary data on each generation.
json.animations = json.animations.filter((a) => !replaces(a.name));
const used = new Set();
for (const m of json.meshes)
  for (const p of m.primitives) {
    Object.values(p.attributes).forEach((i) => used.add(i));
    if (p.indices != null) used.add(p.indices);
    for (const target of p.targets || []) Object.values(target).forEach((i) => used.add(i));
  }
for (const s of json.skins || [])
  if (s.inverseBindMatrices != null) used.add(s.inverseBindMatrices);
for (const a of json.animations)
  for (const s of a.samplers) {
    used.add(s.input);
    used.add(s.output);
  }
const accessors = [...used].sort((a, b) => a - b),
  accessMap = new Map(accessors.map((a, i) => [a, i]));
const views = new Set(
  (json.images || []).filter((i) => i.bufferView != null).map((i) => i.bufferView),
);
for (const id of accessors) {
  const a = json.accessors[id];
  if (a.bufferView != null) views.add(a.bufferView);
  if (a.sparse) {
    views.add(a.sparse.indices.bufferView);
    views.add(a.sparse.values.bufferView);
  }
}
const viewIds = [...views].sort((a, b) => a - b),
  viewMap = new Map(viewIds.map((a, i) => [a, i]));
const packed = [];
let packedOffset = 0;
const packedViews = viewIds.map((i) => {
  const v = json.bufferViews[i],
    b = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength),
    padding = Buffer.alloc((4 - (b.length % 4)) % 4);
  const next = { ...v, byteOffset: packedOffset };
  packed.push(b, padding);
  packedOffset += b.length + padding.length;
  return next;
});
json.accessors = accessors.map((i) => {
  const a = json.accessors[i];
  if (a.bufferView != null) a.bufferView = viewMap.get(a.bufferView);
  if (a.sparse) {
    a.sparse.indices.bufferView = viewMap.get(a.sparse.indices.bufferView);
    a.sparse.values.bufferView = viewMap.get(a.sparse.values.bufferView);
  }
  return a;
});
for (const m of json.meshes)
  for (const p of m.primitives) {
    for (const k in p.attributes) p.attributes[k] = accessMap.get(p.attributes[k]);
    if (p.indices != null) p.indices = accessMap.get(p.indices);
    for (const t of p.targets || []) for (const k in t) t[k] = accessMap.get(t[k]);
  }
for (const s of json.skins || [])
  if (s.inverseBindMatrices != null) s.inverseBindMatrices = accessMap.get(s.inverseBindMatrices);
for (const a of json.animations)
  for (const s of a.samplers) {
    s.input = accessMap.get(s.input);
    s.output = accessMap.get(s.output);
  }
for (const i of json.images || [])
  if (i.bufferView != null) i.bufferView = viewMap.get(i.bufferView);
json.bufferViews = packedViews;
binary = Buffer.concat(packed);
json.buffers[0].byteLength = binary.length;
function pack(data, bin) {
  let j = Buffer.from(JSON.stringify(data));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)]);
  bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const out = Buffer.alloc(28 + j.length + bin.length);
  out.writeUInt32LE(0x46546c67);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(j.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  j.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + j.length);
  out.writeUInt32LE(0x004e4942, 24 + j.length);
  bin.copy(out, 28 + j.length);
  return out;
}
const decode = structuredClone(json);
delete decode.materials;
delete decode.images;
delete decode.textures;
for (const mesh of decode.meshes) for (const p of mesh.primitives) delete p.material;
const raw = pack(decode, binary);
const gltf = await new GLTFLoader().parseAsync(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length),
  '',
);
const scene = gltf.scene,
  bones = [],
  skins = [];
scene.traverse((o) => {
  if (o.isBone) bones.push(o);
  if (o.isSkinnedMesh) skins.push(o);
});
const find = (prefix) => bones.find((b) => b.name.startsWith(prefix));
scene.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(scene, true),
  scale = 1.125 / (box.max.y - box.min.y);
scene.scale.multiplyScalar(scale);
scene.rotation.y += Math.PI / 2;
scene.position.y -= box.min.y * scale;
const root = find('hips_'),
  head = find('head_'),
  chest = find('chest_');
const mixer = new T.AnimationMixer(scene),
  originalActions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
function sampleOriginal(name, time) {
  mixer.stopAllAction();
  const a = originalActions.get(name);
  a.reset().play();
  mixer.setTime(time);
  scene.updateMatrixWorld(true);
  return bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
}
const idle = sampleOriginal('Cat_Idle', 0),
  seated = sampleOriginal('Cat_Lick_Paw', 0.1);
const point = new T.Vector3(),
  axis = new T.Vector3(),
  q = new T.Quaternion(),
  parentQ = new T.Quaternion();
function reset(pose = idle) {
  bones.forEach((b, i) => {
    b.position.copy(pose[i].p);
    b.quaternion.copy(pose[i].q);
    b.scale.copy(pose[i].s);
  });
  scene.updateMatrixWorld(true);
}
function turn(bone, x, y, z, angle) {
  bone.getWorldQuaternion(q);
  q.premultiply(new T.Quaternion().setFromAxisAngle(axis.set(x, y, z), angle));
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(q));
  bone.updateWorldMatrix(false, true);
}
const legs = [
  ['upperarmL', 'forearmL', 'handL'],
  ['upperarmR', 'forearmR', 'handR'],
  ['thighL', 'shinL', 'footL'],
  ['thighR', 'shinR', 'footR'],
].map((names, i) => {
  const [upper, knee, foot] = names.map(find);
  return {
    upper,
    knee,
    foot,
    solve: createLegIK(
      upper,
      knee,
      foot,
      new T.Vector3(i < 2 ? -1 : 1, 0.2, i % 2 === 0 ? -0.15 : 0.15),
    ),
    flat: foot.getWorldQuaternion(new T.Quaternion()),
  };
});
const tail = bones.filter((b) => b.name.startsWith('tail_'));
reset();
const standingFeet = legs.map((l) => l.foot.getWorldPosition(new T.Vector3()));
const standingRotations = legs.map((l) => l.foot.getWorldQuaternion(new T.Quaternion()));
function foot(i, x, y, z, flat = true) {
  legs[i].solve(point.set(x, y, z), 1);
  if (flat) {
    const leg = legs[i];
    leg.foot.parent.getWorldQuaternion(parentQ);
    leg.foot.quaternion.copy(parentQ.invert().multiply(leg.flat));
    leg.foot.updateWorldMatrix(false, true);
  }
}
function lying(t, amount = 1, sploot = false) {
  root.position.y -= ((sploot ? 0.38 : 0.46) * amount) / scale;
  scene.updateMatrixWorld(true);
  turn(chest, 0, 0, 1, -0.06 * amount);
  turn(head, 0, 0, 1, -0.18 * amount);
  const targets = sploot
    ? [
        [0.72, 0.15, -0.1],
        [0.72, 0.15, 0.1],
        [-0.57, 0.26, -0.13],
        [-0.57, 0.26, 0.13],
      ]
    : [
        [0.29, 0.33, -0.1],
        [0.29, 0.33, 0.1],
        [-0.2, 0.35, -0.11],
        [-0.2, 0.35, 0.11],
      ];
  targets.forEach((v, i) => {
    const target = standingFeet[i].clone().lerp(new T.Vector3(...v), amount);
    foot(i, target.x, target.y, target.z);
  });
  tail.forEach((b, i) => turn(b, 0, 1, 0, amount * (0.07 + Math.sin(t * 0.7 - i * 0.4) * 0.006)));
}
function sit(t) {
  root.position.y -= 0.25 / scale;
  scene.updateMatrixWorld(true);
  turn(root, 0, 0, 1, 0.4);
  turn(find('spine_02'), 0, 0, 1, -0.15);
  foot(0, 0.48, 0.15, -0.09);
  foot(1, 0.48, 0.15, 0.09);
  foot(2, -0.28, 0.3, -0.12);
  foot(3, -0.28, 0.3, 0.12);
  turn(head, 0, 0, 1, -0.15 + 0.03 * Math.sin(t * 0.7));
}
// The existing groom/scratch/sleep recipes intentionally retain their poses.
// These rest-specific recipes author only sit, the lowering sequence, and loaf.
const restSolvers = legs.map((leg, i) =>
  createLegIK(leg.upper, leg.knee, leg.foot, new T.Vector3(i < 2 ? 0 : 1, i < 2 ? -1 : -0.1, 0)),
);
function restFoot(i, x, y, z, fold = 0, weight = 1) {
  restSolvers[i](point.set(x, y, z), weight);
  legs[i].foot.parent.getWorldQuaternion(parentQ);
  legs[i].foot.quaternion.slerp(parentQ.invert().multiply(standingRotations[i]), weight);
  legs[i].foot.updateWorldMatrix(false, true);
  turn(legs[i].foot, 0, 0, 1, fold);
}
function groundedSit(t) {
  root.position.y -= 0.47 / scale;
  scene.updateMatrixWorld(true);
  turn(root, 0, 0, 1, 0.88);
  turn(find('spine_02'), 0, 0, 1, -0.23);
  turn(chest, 0, 0, 1, -0.21);
  turn(find('neck_01'), 0, 0, 1, -0.14);
  turn(head, 0, 0, 1, -0.3 + 0.012 * Math.sin((t * Math.PI * 2) / 5));
  turn(tail[0], 0, 0, 1, -1);
  restFoot(0, 0.31, 0.105, -0.095);
  restFoot(1, 0.31, 0.105, 0.095);
  restFoot(2, -0.38, 0.15, -0.13, 1.05);
  restFoot(3, -0.38, 0.15, 0.13, 1.05);
}
const ease = (t, a, b) => {
  const u = T.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return u * u * u * (10 + u * (-15 + 6 * u));
};
function loafSequence(t, fromSit = false) {
  const front = ease(t, 0.06, 0.68),
    tuck = ease(t, 0.5, 1.08),
    rear = ease(t, 0.9, 1.48),
    settle = ease(t, 1.42, 1.8);
  const seated = fromSit ? 1 - rear : 0;
  root.position.y -=
    (fromSit ? 0.47 - 0.11 * rear + 0.015 * settle : 0.04 * front + 0.32 * rear + 0.015 * settle) /
    scale;
  scene.updateMatrixWorld(true);
  turn(root, 0, 0, 1, 0.88 * seated);
  turn(
    find('spine_02'),
    0,
    0,
    1,
    -0.34 * front + 0.48 * rear + 0.02 * settle - (0.23 * (1 - front) + 0.4 * front) * seated,
  );
  turn(chest, 0, 0, 1, -0.14 * front + 0.12 * rear - 0.21 * (1 - front) * seated);
  turn(find('neck_01'), 0, 0, 1, 0.15 * front - 0.12 * rear - 0.14 * (1 - front) * seated);
  turn(head, 0, 0, 1, -0.04 * settle - 0.3 * (1 - front) * seated);
  turn(tail[0], 0, 0, 1, -seated);
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const p = fromSit
      ? new T.Vector3(i < 2 ? 0.31 : -0.38, i < 2 ? 0.105 : 0.15, side * (i < 2 ? 0.095 : 0.13))
      : standingFeet[i].clone();
    if (i < 2) {
      p.x = T.MathUtils.lerp(p.x, 0.25, tuck);
      p.y = T.MathUtils.lerp(p.y, 0.17, tuck);
      p.z = T.MathUtils.lerp(p.z, side * 0.065, tuck);
    } else {
      p.x = T.MathUtils.lerp(p.x, -0.4, rear);
      p.y = T.MathUtils.lerp(p.y, 0.13, rear);
      p.z = T.MathUtils.lerp(p.z, side * 0.12, rear);
    }
    restFoot(
      i,
      p.x,
      p.y,
      p.z,
      i < 2 ? -1.9 * tuck : (fromSit ? 1.05 * (1 - rear) : 0) + 1.1 * rear,
      fromSit ? 1 : i < 2 ? front : rear,
    );
  }
}
const recipes = {
  Still_Sit: [5, (t) => groundedSit(t)],
  Still_Groom: [
    4,
    (t) => {
      sit(t);
      const a = (1 + Math.sin(t * Math.PI * 2)) / 2;
      foot(0, 0.64, 0.62 + a * 0.025, -0.09, false);
      turn(head, 0, 0, 1, -0.3 - a * 0.1);
      turn(find('jaw_'), 0, 0, 1, Math.max(0, Math.sin(t * 9)) * 0.06);
    },
  ],
  Still_Lie_Down: [1.8, (t) => loafSequence(t)],
  Still_Lie_Down_From_Sit: [1.8, (t) => loafSequence(t, true)],
  Still_Get_Up: [
    2.4,
    (t) => {
      const a = 1 - T.MathUtils.smoothstep(t, 0.1, 2.3);
      lying(t, a);
    },
  ],
  Still_Loaf: [6, () => loafSequence(1.8)],
  Still_Sploot: [6, (t) => lying(t, 1, true)],
  Still_Knead: [
    3,
    (t) => {
      lying(t, 0.7);
      const p = (t / 3) * Math.PI * 4;
      foot(0, 0.49, 0.15 + Math.max(0, Math.sin(p)) * 0.06, -0.1);
      foot(1, 0.49, 0.15 + Math.max(0, -Math.sin(p)) * 0.06, 0.1);
      turn(chest, 1, 0, 0, Math.sin(p) * 0.025);
    },
  ],
  Still_Sleep: [
    6,
    (t) => {
      lying(t);
      turn(find('spine_02'), 0, 1, 0, 0.24);
      turn(chest, 0, 1, 0, 0.2);
      turn(find('neck_01'), 0, 0, 1, -0.5);
      turn(head, 0, 1, 0, -0.7);
      tail.forEach((b, i) => turn(b, 0, 1, 0, 0.09));
    },
  ],
  Still_Side_Sleep: [
    6,
    (t) => {
      lying(t);
      turn(root, 1, 0, 0, 1.25);
      turn(find('neck_01'), 0, 0, 1, -0.4);
      turn(head, 0, 1, 0, -0.5);
    },
  ],
  Still_Roll: [
    7,
    (t) => {
      const side = T.MathUtils.smoothstep(t, 0, 1.4),
        back = T.MathUtils.smoothstep(t, 1.4, 2.7),
        recover = T.MathUtils.smoothstep(t, 5.3, 7);
      lying(t);
      turn(
        root,
        1,
        0,
        0,
        (1.25 * side + 1.5 * back) * (1 - recover) + Math.sin(t * 3) * 0.12 * back * (1 - recover),
      );
      turn(find('spine_02'), 0, 0, 1, Math.sin(t * 2.5) * 0.12 * back * (1 - recover));
      for (let i = 0; i < 4; i++) {
        turn(legs[i].upper, 0, 0, 1, Math.sin(t * 4 + i * 1.9) * 0.16 * back * (1 - recover));
        turn(legs[i].knee, 0, 0, 1, Math.cos(t * 4 + i) * 0.2 * back * (1 - recover));
      }
      turn(head, 0, 1, 0, Math.sin(t * 2) * 0.25 * side * (1 - recover));
      turn(find('neck_01'), 0, 0, 1, 0.4 * back * (1 - recover));
    },
  ],
  Still_Stretch: [
    4,
    (t) => {
      const a = Math.sin((t / 4) * Math.PI) ** 2;
      root.position.y -= (0.04 * a) / scale;
      turn(chest, 0, 0, 1, -0.23 * a);
      turn(find('spine_02'), 0, 0, 1, 0.12 * a);
      scene.updateMatrixWorld(true);
      foot(0, 0.65, 0.13, -0.1);
      foot(1, 0.65, 0.13, 0.1);
      foot(2, -0.45, 0.3, -0.1);
      foot(3, -0.45, 0.3, 0.1);
      turn(head, 0, 0, 1, -0.18 * a);
    },
  ],
  Still_Scratch: [
    2,
    (t) => {
      const wave = Math.sin(t * Math.PI * 4);
      turn(chest, 0, 0, 1, -0.12);
      foot(0, 0.64, 0.16 + Math.max(0, wave) * 0.23, -0.12);
      foot(1, 0.64, 0.16 + Math.max(0, -wave) * 0.23, 0.12);
      turn(head, 0, 0, 1, -0.3);
    },
  ],
  Still_Scratch_Rear: [
    2.4,
    (t) => {
      sit(t);
      turn(chest, 0, 0, 1, 0.18);
      const wave = Math.sin(t * Math.PI * 5);
      foot(0, 0.55, 0.54 + wave * 0.1, -0.11);
      foot(1, 0.55, 0.54 - wave * 0.1, 0.11);
    },
  ],
};
const clips = [];
for (const [name, [duration, recipe]] of Object.entries(recipes)) {
  if (restOnly && !restNames.has(name)) continue;
  const n = Math.ceil(duration * 24),
    times = Array.from({ length: n + 1 }, (_, i) => (i / n) * duration);
  const values = bones.map(() => ({ q: [], p: [] }));
  for (const t of times) {
    reset();
    recipe(t);
    bones.forEach((b, i) => {
      values[i].q.push(...b.quaternion.toArray());
      values[i].p.push(...b.position.toArray());
    });
  }
  const tracks = [];
  bones.forEach((b, i) => {
    for (const [prop, key, size, Track] of [
      ['quaternion', 'q', 4, T.QuaternionKeyframeTrack],
      ['position', 'p', 3, T.VectorKeyframeTrack],
    ]) {
      const data = values[i][key],
        varying = data.some((v, k) => Math.abs(v - data[k % size]) > 1e-6);
      tracks.push(
        new Track(
          `${b.name}.${prop}`,
          varying
            ? times
            : name === 'Still_Loaf' && b === root && prop === 'position'
              ? [0, duration]
              : [0],
          varying
            ? data
            : name === 'Still_Loaf' && b === root && prop === 'position'
              ? [...data.slice(0, size), ...data.slice(0, size)]
              : data.slice(0, size),
        ),
      );
    }
  });
  clips.push(new T.AnimationClip(name, duration, tracks));
}
// Bake stride profiles from the body and contact seeds from every skin. Separate
// eye/cornea shells can become the lowest point during a side-rest crossfade.
const allClips = [...gltf.animations.filter((c) => !replaces(c.name)), ...clips];
const body = skins.reduce((a, b) =>
  a.geometry.attributes.position.count > b.geometry.attributes.position.count ? a : b,
);
const regions = new Uint8Array(body.geometry.attributes.position.count);
const position = body.geometry.attributes.position,
  weights = body.geometry.attributes.skinWeight,
  indices = body.geometry.attributes.skinIndex;
const feet = legs.map((l) => l.foot),
  candidates = [],
  pawCandidates = feet.map(() => []);
for (let i = 0; i < position.count; i++) {
  let dominant = '',
    dominantWeight = -1;
  const pw = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const name = body.skeleton.bones[indices.getComponent(i, k)]?.name || '',
      w = weights.getComponent(i, k);
    if (w > dominantWeight) {
      dominant = name;
      dominantWeight = w;
    }
    for (let f = 0; f < 4; f++)
      if (
        (f < 2 ? /hand|f_digit/ : /foot|h_digit/).test(name) &&
        name.includes(f % 2 === 0 ? 'L_' : 'R_')
      )
        pw[f] += w;
  }
  candidates.push(i);
  const side = dominant.includes('L_') ? 0 : 1;
  regions[i] = /tail_/.test(dominant)
    ? 10 + Math.min(2, Math.floor((Number(dominant.slice(5, 7)) - 1) / 3))
    : /head_|jaw_|neck_|eye|ear_|tongue/.test(dominant)
      ? 9
      : /hand|f_digit|upperarm|forearm|scapula/.test(dominant)
        ? side + (/hand|f_digit/.test(dominant) ? 0 : 2)
        : /foot|h_digit|thigh|shin/.test(dominant)
          ? 4 + side + (/foot|h_digit/.test(dominant) ? 0 : 2)
          : 8;
  pw.forEach((w, f) => {
    if (w > 0.6) pawCandidates[f].push(i);
  });
}
function vertex(index) {
  point.fromBufferAttribute(position, index);
  body.applyBoneTransform(index, point);
  return point.applyMatrix4(body.matrixWorld);
}
const previousMotion = json.asset.extras.stillMotion;
const profiles = restOnly ? { ...previousMotion.profiles } : {},
  supportIndices = new Set(restOnly ? previousMotion.supportVertices : []),
  skinSupport = skins.map((skin, i) =>
    skin === body ? supportIndices : new Set(restOnly ? previousMotion.skinSupport[i] : []),
  );
const auxiliarySkins = skins.flatMap((skin, index) => {
  if (skin === body) return [];
  const groups = new Uint16Array(skin.geometry.attributes.position.count),
    weight = skin.geometry.attributes.skinWeight,
    joint = skin.geometry.attributes.skinIndex;
  for (let i = 0; i < groups.length; i++) {
    let largest = -1;
    for (let k = 0; k < 4; k++)
      if (weight.getComponent(i, k) > largest) {
        largest = weight.getComponent(i, k);
        groups[i] = joint.getComponent(i, k);
      }
  }
  return [{ skin, seeds: skinSupport[index], groups }];
});
for (const clip of restOnly ? clips : allClips) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip).reset().play();
  const samples = [],
    n = 64;
  for (let s = 0; s < n; s++) {
    mixer.setTime((s / n) * clip.duration);
    scene.updateMatrixWorld(true);
    body.skeleton.update();
    let low = Infinity,
      lowest = 0;
    const regionLow = new Float64Array(13).fill(Infinity),
      regionIndex = new Int32Array(13).fill(-1);
    for (const i of candidates) {
      const y = vertex(i).y;
      if (y < regionLow[regions[i]]) {
        regionLow[regions[i]] = y;
        regionIndex[regions[i]] = i;
      }
      if (y < low) {
        low = y;
        lowest = i;
      }
    }
    supportIndices.add(lowest);
    // A limb that is raised in one clip can become the supporting part during
    // a quaternion crossfade. Keep the low point of each anatomical region too.
    regionIndex.forEach((i) => {
      if (i >= 0) supportIndices.add(i);
    });
    for (const { skin, seeds, groups } of auxiliarySkins) {
      skin.skeleton.update();
      const minima = new Map();
      for (let i = 0; i < groups.length; i++) {
        point.fromBufferAttribute(skin.geometry.attributes.position, i);
        skin.applyBoneTransform(i, point).applyMatrix4(skin.matrixWorld);
        const previous = minima.get(groups[i]);
        if (!previous || point.y < previous.y) minima.set(groups[i], { y: point.y, i });
      }
      for (const { i } of minima.values()) seeds.add(i);
    }
    const paws = pawCandidates.map((list, f) => {
      let y = Infinity;
      for (const i of list) y = Math.min(y, vertex(i).y);
      const p = feet[f].getWorldPosition(new T.Vector3());
      return { x: p.x, y: y === Infinity ? p.y : y };
    });
    samples.push({ ground: low, feet: paws });
  }
  let stride = [];
  samples.forEach((s, i) =>
    s.feet.forEach((p, f) => {
      const prev = samples[(i + n - 1) % n].feet[f],
        dx = p.x - prev.x;
      if (p.y - s.ground < 0.065 && dx < -0.002 && i > 0) stride.push(-dx * n);
    }),
  );
  stride.sort((a, b) => a - b);
  profiles[clip.name] = {
    duration: clip.duration,
    stride: T.MathUtils.clamp(stride[Math.floor(stride.length / 2)] || 1.2, 0.45, 3.4),
    samples: samples.map((s) => ({
      ground: +s.ground.toFixed(5),
      feet: s.feet.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5)]),
    })),
  };
  action.stop();
}
// Append binary animation accessors without re-encoding geometry or textures.
const chunks = [binary, Buffer.alloc((4 - (binary.length % 4)) % 4)];
let offset = chunks.reduce((n, b) => n + b.length, 0);
function accessor(values, size) {
  const b = Buffer.from(new Float32Array(values).buffer),
    view = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length });
  chunks.push(b);
  offset += b.length;
  const id = json.accessors.length;
  json.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: values.length / size,
    type: size === 1 ? 'SCALAR' : size === 3 ? 'VEC3' : 'VEC4',
    ...(size === 1 ? { min: [Math.min(...values)], max: [Math.max(...values)] } : {}),
  });
  return id;
}
json.animations = json.animations.filter((a) => !replaces(a.name));
for (const clip of clips) {
  const samplers = [],
    channels = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.'),
      name = track.name.slice(0, dot),
      prop = track.name.slice(dot + 1),
      node = json.nodes.findIndex((n) => T.PropertyBinding.sanitizeNodeName(n.name || '') === name);
    if (node < 0) throw new Error('Missing node ' + name);
    const sampler = samplers.length;
    samplers.push({
      input: accessor([...track.times], 1),
      output: accessor([...track.values], prop === 'quaternion' ? 4 : 3),
      interpolation: 'LINEAR',
    });
    channels.push({
      sampler,
      target: { node, path: prop === 'quaternion' ? 'rotation' : 'translation' },
    });
  }
  json.animations.push({ name: clip.name, samplers, channels });
}
json.asset.extras.stillMotion = {
  version: 2,
  scale,
  body: skins.indexOf(body),
  supportVertices: [...supportIndices],
  skinSupport: skinSupport.map((seeds) => [...seeds]),
  profiles,
  authored: 'Still comfort animation authoring, 24fps skeletal clips; measured 64-sample contacts.',
};
const bin = Buffer.concat(chunks);
json.buffers[0].byteLength = bin.length;
await writeFile(output, pack(json, bin));
console.log(
  JSON.stringify({
    clips: allClips.length,
    supportVertices: supportIndices.size,
    bytes: (await readFile(output)).length,
    strides: Object.fromEntries(
      Object.entries(profiles)
        .filter(([n]) => /Walk|Trot|Run|Stalk/.test(n))
        .map(([n, p]) => [n, p.stride]),
    ),
  }),
);
