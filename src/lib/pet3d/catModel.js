import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFurTextures } from './furTexture.js';
import { CAT, PET_UNIT, KITTEN_HEIGHT } from './math.js';

// An original smooth, textured tabby. Continuous skinned limbs and tail replace the segmented mesh.
export function createCatModel() {
  const bones = [],
    byName = {},
    pieces = [],
    materials = [];
  function bone(name, parent, position) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(position);
    parent?.add(b);
    bones.push(b);
    byName[name] = b;
    return b;
  }
  const root = bone('root', null, [0, 0, 0]),
    spine = bone('spine', root, [-0.07, 0.07, 0]);
  const chest = bone('chest', spine, [0.26, 0.025, 0]),
    neck = bone('neck', chest, [0.14, 0.12, 0]);
  const head = bone('head', neck, [0.1, 0.12, 0]);
  bone('earL', head, [-0.145, 0.185, 0.005]);
  bone('earR', head, [0.145, 0.185, 0.005]);
  bone('eyeL', head, [-0.104, 0.015, 0.195]);
  bone('eyeR', head, [0.104, 0.015, 0.195]);
  const jaw = bone('jaw', head, [0, -0.1, 0.16]);
  bone('mouth', jaw, [0, 0.015, 0.11]);
  for (const [name, x, z] of [
    ['frontNear', 0.25, 0.16],
    ['frontFar', 0.25, -0.16],
    ['rearNear', -0.33, 0.17],
    ['rearFar', -0.33, -0.17],
  ]) {
    const hip = bone(name, root, [x, 0.015, z]),
      knee = bone(`${name}Knee`, hip, [0, -0.19, 0]);
    bone(`${name}Paw`, knee, [0.025, -0.19, 0]);
  }
  let tail = bone('tail0', spine, [-0.38, 0.04, 0]);
  for (let i = 1; i < 7; i++) tail = bone(`tail${i}`, tail, [-0.085, 0.058, 0]);
  root.updateMatrixWorld(true);
  const furTextures = createFurTextures();
  const fur = new THREE.MeshPhysicalMaterial({
    map: furTextures.map,
    normalMap: furTextures.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.22),
    roughness: 0.96,
    sheen: 0.85,
    sheenRoughness: 0.85,
    sheenColor: '#c5b5a0',
  });
  const cream = new THREE.MeshPhysicalMaterial({
    color: '#c8bbaa',
    normalMap: furTextures.normalMap,
    roughness: 0.97,
    sheen: 0.8,
    sheenColor: '#e2d4bd',
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#3e322c', roughness: 0.92 });
  const pink = new THREE.MeshStandardMaterial({ color: '#a77e7c', roughness: 0.72 });
  const iris = new THREE.MeshPhysicalMaterial({
    color: '#aaa76c',
    roughness: 0.14,
    clearcoat: 0.75,
    clearcoatRoughness: 0.12,
  });
  const ink = new THREE.MeshStandardMaterial({ color: '#131915', roughness: 0.22 });
  const glint = new THREE.MeshBasicMaterial({ color: '#fff7df' });
  materials.push(fur, cream, dark, pink, iris, ink, glint);
  const sphere = new THREE.SphereGeometry(1, 28, 18),
    detailSphere = new THREE.SphereGeometry(1, 16, 12);
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    scale = new THREE.Vector3();
  function skin(g, indicesForVertex) {
    const n = g.attributes.position.count,
      indices = new Uint16Array(n * 4),
      weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [a, b = a, w = 1] = indicesForVertex(i);
      indices[i * 4] = a;
      indices[i * 4 + 1] = b;
      weights[i * 4] = w;
      weights[i * 4 + 1] = 1 - w;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  }
  function part(g, name, position, size, material = 0, rotation = [0, 0, 0]) {
    const b = byName[name];
    p.fromArray(position);
    scale.fromArray(size);
    q.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(p, q, scale).premultiply(b.matrixWorld);
    g.applyMatrix4(matrix);
    skin(g, () => [bones.indexOf(b)]);
    pieces.push({ g, material });
  }
  function ellipsoid(name, p, s, m = 0, r) {
    part((Math.max(...s) < 0.16 ? detailSphere : sphere).clone(), name, p, s, m, r);
  }
  // Flowing torso, ruff and cheek volumes, with a short kitten muzzle and rounded shoulders.
  ellipsoid('spine', [0, 0, 0], [0.43, 0.235, 0.225]);
  ellipsoid('chest', [-0.01, -0.02, 0], [0.25, 0.245, 0.23]);
  ellipsoid('neck', [0, 0, 0], [0.185, 0.215, 0.175]);
  ellipsoid('chest', [0.12, 0.06, 0.07], [0.14, 0.2, 0.16], 1);
  ellipsoid('head', [0, 0, 0], [0.235, 0.225, 0.21]);
  ellipsoid('head', [0, -0.075, 0.16], [0.145, 0.1, 0.085], 1);
  for (const side of [-1, 1]) {
    // A tapered, rounded ear has smooth topology instead of three flat cone faces.
    const ear = new THREE.SphereGeometry(1, 20, 14),
      positions = ear.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      positions.setX(i, positions.getX(i) * (1 - y * 0.42));
    }
    ear.computeVertexNormals();
    const name = side < 0 ? 'earL' : 'earR';
    part(ear, name, [0, 0.01, 0], [0.105, 0.165, 0.065], 0, [0, 0, -side * 0.2]);
    ellipsoid(name, [0, 0.005, 0.052], [0.064, 0.103, 0.016], 3, [0, 0, -side * 0.2]);
    const eye = side < 0 ? 'eyeL' : 'eyeR';
    ellipsoid(eye, [0, 0, -0.005], [0.079, 0.065, 0.028], 2);
    ellipsoid(eye, [0, 0, 0.018], [0.063, 0.057, 0.024], 4);
    ellipsoid(eye, [0.004, 0, 0.04], [0.018, 0.049, 0.006], 5);
    ellipsoid(eye, [-0.018, 0.019, 0.045], [0.011, 0.011, 0.004], 6);
    ellipsoid('head', [side * 0.055, -0.075, 0.223], [0.064, 0.044, 0.033], 1);
    ellipsoid('head', [side * 0.19, -0.025, 0.045], [0.065, 0.115, 0.15]);
    for (let i = 0; i < 3; i++) {
      ellipsoid(
        'head',
        [side * (0.09 + i * 0.028), 0.12 - i * 0.018, 0.163],
        [0.012, 0.047, 0.006],
        2,
        [0, 0, -side * 0.4],
      );
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(side * 0.07, -0.07, 0.23),
        new THREE.Vector3(side * 0.18, -0.045 + i * 0.02, 0.25),
        new THREE.Vector3(side * 0.29, -0.08 + i * 0.045, 0.235),
      );
      part(new THREE.TubeGeometry(curve, 8, 0.002, 3, false), 'head', [0, 0, 0], [1, 1, 1], 1);
    }
  }
  ellipsoid('head', [0, -0.047, 0.246], [0.031, 0.02, 0.016], 3);
  ellipsoid('jaw', [0, -0.018, 0.03], [0.084, 0.035, 0.079], 1);
  ellipsoid('mouth', [0, -0.009, 0.002], [0.022, 0.006, 0.007], 2);
  // Smooth tubes are blended between adjacent leg bones, so knees do not look bolted on.
  function skinnedTube(names, radii, segments = 24) {
    const centers = names.map((name) => byName[name].getWorldPosition(new THREE.Vector3()));
    const curve = new THREE.CatmullRomCurve3(centers),
      g = new THREE.TubeGeometry(curve, segments, 1, 10, false);
    const pos = g.attributes.position,
      uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i),
        f = t * (radii.length - 1),
        j = Math.min(radii.length - 2, Math.floor(f));
      const radius = THREE.MathUtils.lerp(radii[j], radii[j + 1], f - j),
        center = curve.getPointAt(t);
      pos.setXYZ(
        i,
        center.x + (pos.getX(i) - center.x) * radius,
        center.y + (pos.getY(i) - center.y) * radius,
        center.z + (pos.getZ(i) - center.z) * radius,
      );
    }
    g.computeVertexNormals();
    skin(g, (i) => {
      const f = uv.getX(i) * (names.length - 1),
        j = Math.min(names.length - 2, Math.floor(f));
      return [bones.indexOf(byName[names[j]]), bones.indexOf(byName[names[j + 1]]), 1 - (f - j)];
    });
    pieces.push({ g, material: 0 });
  }
  for (const name of ['frontNear', 'frontFar', 'rearNear', 'rearFar']) {
    skinnedTube(
      [name, `${name}Knee`, `${name}Paw`],
      [name.startsWith('rear') ? 0.095 : 0.072, 0.058, 0.049],
    );
    ellipsoid(`${name}Paw`, [0.033, 0.012, 0.014], [0.102, 0.055, 0.076], 1);
    for (const z of [-0.025, 0.015, 0.05])
      ellipsoid(`${name}Paw`, [0.105, 0.017, z], [0.009, 0.019, 0.004], 2);
  }
  skinnedTube(
    Array.from({ length: 7 }, (_, i) => `tail${i}`),
    [0.07, 0.067, 0.061, 0.055, 0.047, 0.038, 0.023],
    48,
  );
  ellipsoid('tail6', [0, 0, 0], [0.025, 0.028, 0.025], 2);
  // Sparse silhouette tufts share the fur material and skeleton; there is no shell-fur overdraw.
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * Math.PI * 2,
      name = i % 3 === 0 ? 'head' : 'neck';
    const center = new THREE.Vector3(Math.cos(t) * 0.18, Math.sin(t) * 0.17, Math.sin(t * 2) * 0.1);
    const tip = center.clone().multiplyScalar(1.15);
    const curve = new THREE.QuadraticBezierCurve3(
      center,
      center
        .clone()
        .lerp(tip, 0.6)
        .add(new THREE.Vector3(-0.01, 0.01, 0)),
      tip,
    );
    part(
      new THREE.TubeGeometry(curve, 3, 0.007, 3, false),
      name,
      [0, 0, 0],
      [1, 1, 1],
      i % 3 === 0 ? 0 : 1,
    );
  }
  pieces.sort((a, b) => a.material - b.material);
  const geometry = mergeGeometries(
      pieces.map(({ g }) => g),
      true,
    ),
    groups = geometry.groups.map((g, i) => ({ ...g, materialIndex: pieces[i].material }));
  geometry.clearGroups();
  for (const group of groups) {
    const prev = geometry.groups.at(-1);
    if (prev?.materialIndex === group.materialIndex) prev.count += group.count;
    else geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  const mesh = new THREE.SkinnedMesh(geometry, materials);
  mesh.name = 'Fluffy tabby kitten';
  mesh.frustumCulled = false;
  mesh.add(root);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.updateMatrixWorld(true);
  const rest = bones.map((b) => ({ p: b.position.clone(), s: b.scale.clone() }));
  const mouth = new THREE.Vector3();
  // Reused pose arrays; animation does not allocate objects or update React state per frame.
  const pose = new Float32Array(bones.length * 6),
    index = Object.fromEntries(bones.map((b, i) => [b.name, i * 6]));
  function rotate(name, x = 0, y = 0, z = 0) {
    const n = index[name];
    pose[n] = x;
    pose[n + 1] = y;
    pose[n + 2] = z;
  }
  function offset(name, x = 0, y = 0, z = 0) {
    const n = index[name];
    pose[n + 3] = x;
    pose[n + 4] = y;
    pose[n + 5] = z;
  }
  function update(
    mode,
    time,
    dt,
    speed = 0,
    look = 0,
    reduced = false,
    facing = 1,
    holding = false,
  ) {
    pose.fill(0);
    rotate('jaw', holding || mode === 'grab' ? 0.2 : 0, 0, 0);
    const t = reduced ? 0 : time,
      breathe = Math.sin(t * 2.1) * 0.009;
    rotate('head', 0, 0.32 + look * 0.16, Math.sin(t * 0.8) * 0.015);
    offset('spine', 0, breathe, 0);
    for (let i = 0; i < 7; i++)
      rotate(
        `tail${i}`,
        Math.sin(t * 1.7 - i * 0.4) * 0.07,
        0.035,
        Math.sin(t * 1.4 - i * 0.35) * 0.075,
      );
    let curl = 0,
      rootY = 0,
      bodyScale = 1;
    const walking = ['walk', 'patrol', 'hunt', 'carry', 'stalk', 'visit'].includes(mode),
      running = mode === 'run' || mode === 'descend';
    if (walking || running) {
      const frequency = running ? 13 : 7,
        phase = t * frequency;
      const amplitude = running ? 1.02 : 0.48;
      for (const [i, name] of ['frontNear', 'frontFar', 'rearNear', 'rearFar'].entries()) {
        const stride = Math.sin(
          phase + (running ? [0, 0.35, 2.1, 2.45][i] : [0, Math.PI, Math.PI, 0][i]),
        );
        rotate(name, 0, 0, stride * amplitude);
        rotate(`${name}Knee`, 0, 0, Math.max(0, -stride) * (running ? 1.1 : 0.6));
      }
      offset('spine', 0, running ? Math.sin(phase * 2) * 0.045 : Math.sin(phase * 2) * 0.012, 0);
      rotate('spine', 0, Math.sin(phase) * 0.035, running ? Math.sin(phase) * 0.09 : 0);
      rotate('head', 0, 0.35, -0.04 + Math.sin(phase) * 0.025);
    }
    if (['crouch', 'stalk-ready', 'grab', 'grab-letter'].includes(mode)) {
      curl = 0.55;
      rootY = -0.1;
      rotate('head', 0, 0.42, -0.14);
      rotate('earL', 0.1, Math.sin(t * 24) * 0.13, -0.1);
      rotate('earR', -0.1, -Math.sin(t * 24) * 0.13, 0.1);
    }
    if (mode === 'jump' || mode === 'fall' || mode === 'tossed') {
      curl = 0.7;
      rotate('spine', 0, 0, clampSpeed(speed) * 0.02);
      rotate('head', 0, 0.3, 0.1);
      for (let i = 0; i < 7; i++) rotate(`tail${i}`, 0, 0, -0.16);
    }
    if (mode === 'land') {
      rootY = -0.11 * Math.exp(-t * 9);
      curl = 0.55 * Math.exp(-t * 9);
    }
    if (mode === 'stretch' || mode === 'purr') {
      const stretch =
        Math.sin((Math.min(1, t / 1.1) * Math.PI) / 2) * Math.min(1, Math.max(0, 4 - t));
      rotate('spine', 0, 0, -0.18 * stretch);
      offset('chest', 0.035 * stretch, -0.1 * stretch, 0);
      rotate('head', 0, 0.25, -0.3 * stretch);
      rotate('frontNear', 0, 0, 0.85 * stretch);
      rotate('frontFar', 0, 0, 0.85 * stretch);
      rotate('rearNear', 0, 0, 0.38 * stretch);
      rotate('rearFar', 0, 0, 0.38 * stretch);
      for (let i = 0; i < 7; i++) rotate(`tail${i}`, 0, 0, -0.22 * stretch);
    }
    if (mode === 'roll') {
      curl = 1;
      rootY = -0.15;
      rotate('root', Math.PI * (1 - Math.cos((t * Math.PI) / 1.55)), 0, Math.sin(t * 3) * 0.08);
      rotate('head', 0, 0.5, Math.sin(t * 4) * 0.1);
    }
    if (mode === 'sleep') {
      curl = 1;
      rootY = -0.28;
      bodyScale = 0.86;
      rotate('spine', 0, 0.25, 0);
      offset('neck', -0.15, -0.13, 0.1);
      rotate('head', -0.1, 0.7, -0.45);
      for (let i = 0; i < 7; i++) rotate(`tail${i}`, 0.11, 0.26, -0.08);
      if (Math.sin(t * 1.3) > 0.94) rotate('earL', 0.12, 0, 0.1);
    }
    if (mode === 'cling' || mode === 'climb') {
      curl = 0.7;
      rotate('root', 0, 0, 0.95);
      rotate('head', 0, 0.3, 0.35);
      if (mode === 'climb') {
        curl = 0;
        for (const [i, name] of ['frontNear', 'frontFar', 'rearNear', 'rearFar'].entries()) {
          const grip = Math.sin(t * 10 + i * Math.PI);
          rotate(name, 0, 0, -0.8 + grip * 0.32);
          rotate(`${name}Knee`, 0, 0, 0.8 - grip * 0.25);
          rotate(`${name}Paw`, 0, 0, grip * 0.2);
        }
      }
    }
    if (mode === 'scratch-rear') {
      rotate('root', 0, 0, -0.48);
      rootY = 0.1;
      rotate('rearNearKnee', 0, 0, 0.65);
      rotate('rearFarKnee', 0, 0, 0.65);
    }
    if (mode === 'scratch' || mode === 'scratch-rear') {
      rotate('head', 0, 0.4, -0.25);
      for (const [i, name] of ['frontNear', 'frontFar'].entries()) {
        const rake = Math.sin(t * 16 + i * Math.PI);
        rotate(name, 0, 0, -0.6 + rake * 0.45);
        rotate(`${name}Knee`, 0, 0, 0.5 + rake * 0.3);
      }
    }
    if (mode === 'bat') {
      rotate('frontNear', 0, Math.sin(t * 13) * 0.55, -1);
      rotate('frontNearKnee', 0, 0, 0.5);
      rotate('head', 0, 0.4, -0.15);
    }
    if (mode === 'sit' || mode === 'meow' || mode === 'head-tilt') {
      rootY = -0.1;
      rotate('spine', 0, 0, -0.23);
      rotate('rearNear', 0, 0, -0.8);
      rotate('rearFar', 0, 0, -0.8);
      rotate('rearNearKnee', 0, 0, 1.4);
      rotate('rearFarKnee', 0, 0, 1.4);
      if (mode === 'head-tilt') rotate('head', 0, 0.18, Math.sin(t * 1.5) * 0.3 + 0.17);
      if (mode === 'meow') rotate('jaw', Math.max(0, Math.sin(t * 5)) * 0.35, 0, 0);
    }
    if (mode === 'groom') {
      rotate('head', -0.25, -0.5, -0.35);
      rotate('frontNear', 0.25, 0, -1.1);
      rotate('frontNearKnee', 0, 0, 1.3);
      rotate('jaw', Math.sin(t * 9) * 0.12, 0, 0);
    }
    if (mode === 'purr') offset('chest', 0, Math.sin(t * 28) * 0.004, 0);
    if (curl)
      for (const name of ['frontNear', 'frontFar', 'rearNear', 'rearFar']) {
        rotate(name, 0, 0, -0.7 * curl);
        rotate(`${name}Knee`, 0, 0, 1.6 * curl);
      }
    offset('root', 0, rootY, 0);
    if (facing < 0) pose[index.head + 1] += Math.PI;
    const blend = reduced ? 1 : 1 - Math.exp(-dt * 12);
    bones.forEach((b, i) => {
      const n = i * 6;
      b.rotation.x += (pose[n] - b.rotation.x) * blend;
      b.rotation.y += (pose[n + 1] - b.rotation.y) * blend;
      b.rotation.z += (pose[n + 2] - b.rotation.z) * blend;
      b.position.set(
        THREE.MathUtils.lerp(b.position.x, rest[i].p.x + pose[n + 3], blend),
        THREE.MathUtils.lerp(b.position.y, rest[i].p.y + pose[n + 4], blend),
        THREE.MathUtils.lerp(b.position.z, rest[i].p.z + pose[n + 5], blend),
      );
    });
    const blink = mode === 'sleep' ? 0.08 : t % 5.3 > 5.13 ? 0.12 : 1;
    byName.eyeL.scale.y = blink;
    byName.eyeR.scale.y = blink;
    spine.scale.y = bodyScale + breathe;
    mesh.updateMatrixWorld(true);
  }
  function clampSpeed(n) {
    return Math.min(12, Math.max(-12, n));
  }
  geometry.computeBoundingBox();
  const scaleFactor =
    KITTEN_HEIGHT / PET_UNIT / (geometry.boundingBox.max.y - geometry.boundingBox.min.y);
  mesh.scale.setScalar(scaleFactor);
  mesh.position.y = -CAT.halfHeight - geometry.boundingBox.min.y * scaleFactor;
  mesh.updateMatrixWorld(true);
  return {
    standingHeight: KITTEN_HEIGHT / PET_UNIT,
    mesh,
    bones,
    byName,
    skeleton,
    update,
    mouthPosition(target = mouth) {
      return byName.mouth.getWorldPosition(target);
    },
    dispose() {
      geometry.dispose();
      pieces.forEach(({ g }) => g.dispose());
      sphere.dispose();
      detailSphere.dispose();
      furTextures.dispose();
      materials.forEach((m) => m.dispose());
      skeleton.dispose();
    },
  };
}
