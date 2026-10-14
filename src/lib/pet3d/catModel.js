import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// An original, low-poly skinned character. One shared mesh / skeleton; no downloaded assets.
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
  const root = bone('root', null, [0, 0, 0]);
  const spine = bone('spine', root, [-0.07, 0.08, 0]);
  const chest = bone('chest', spine, [0.26, 0.03, 0]);
  const neck = bone('neck', chest, [0.14, 0.11, 0]);
  const head = bone('head', neck, [0.1, 0.12, 0]);
  bone('earL', head, [-0.145, 0.19, 0.005]);
  bone('earR', head, [0.145, 0.19, 0.005]);
  bone('eyeL', head, [-0.105, 0.025, 0.205]);
  bone('eyeR', head, [0.105, 0.025, 0.205]);
  const jaw = bone('jaw', head, [0, -0.1, 0.16]);
  bone('mouth', jaw, [0, 0.015, 0.11]);
  for (const [name, x, z] of [
    ['frontNear', 0.25, 0.18],
    ['frontFar', 0.25, -0.18],
    ['rearNear', -0.33, 0.18],
    ['rearFar', -0.33, -0.18],
  ]) {
    const hip = bone(name, root, [x, 0.015, z]);
    const knee = bone(`${name}Knee`, hip, [0, -0.19, 0]);
    bone(`${name}Paw`, knee, [0.025, -0.19, 0]);
  }
  let tail = bone('tail0', spine, [-0.38, 0.04, 0]);
  for (let i = 1; i < 7; i++) tail = bone(`tail${i}`, tail, [-0.095, 0.065, 0]);
  root.updateMatrixWorld(true);
  const fur = new THREE.MeshStandardMaterial({ color: '#dcb58d', roughness: 0.78 });
  const cream = new THREE.MeshStandardMaterial({ color: '#ffead0', roughness: 0.85 });
  const ginger = new THREE.MeshStandardMaterial({ color: '#aa7350', roughness: 0.8 });
  const pink = new THREE.MeshStandardMaterial({ color: '#d78d91', roughness: 0.65 });
  const iris = new THREE.MeshStandardMaterial({ color: '#8fbda5', roughness: 0.3 });
  const ink = new THREE.MeshStandardMaterial({ color: '#1a292d', roughness: 0.35 });
  const white = new THREE.MeshStandardMaterial({
    color: '#fff9eb',
    roughness: 0.25,
    emissive: '#fff1dc',
    emissiveIntensity: 0.13,
  });
  materials.push(fur, cream, ginger, pink, iris, ink, white);
  const sphere = new THREE.SphereGeometry(1, 16, 12),
    smallSphere = new THREE.SphereGeometry(1, 12, 8),
    tinySphere = new THREE.SphereGeometry(1, 8, 6),
    cone = new THREE.ConeGeometry(1, 1, 3, 1),
    cylinder = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
  const transform = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    p = new THREE.Vector3(),
    scale = new THREE.Vector3();
  function part(geometry, name, position, size, material = 0, rotation = [0, 0, 0]) {
    const b = byName[name],
      g = geometry.clone();
    p.fromArray(position);
    scale.fromArray(size);
    q.setFromEuler(new THREE.Euler(...rotation));
    transform.compose(p, q, scale).premultiply(b.matrixWorld);
    g.applyMatrix4(transform);
    const count = g.attributes.position.count,
      indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4),
      index = bones.indexOf(b);
    for (let i = 0; i < count; i++) {
      indices[i * 4] = index;
      weights[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    pieces.push({ g, material });
  }
  // Keep the silhouette smooth; subpixel features need far fewer skinned vertices.
  const ellipsoid = (name, p, s, m = 0, r) =>
    part(
      Math.max(...s) < 0.08 ? tinySphere : Math.max(...s) < 0.19 ? smallSphere : sphere,
      name,
      p,
      s,
      m,
      r,
    );
  ellipsoid('spine', [0, 0, 0], [0.43, 0.23, 0.25]);
  ellipsoid('chest', [0, -0.025, 0], [0.255, 0.235, 0.235]);
  ellipsoid('spine', [0.13, -0.07, 0.12], [0.28, 0.17, 0.15], 1);
  ellipsoid('neck', [0, 0, 0], [0.17, 0.2, 0.17]);
  ellipsoid('head', [0, 0, 0], [0.265, 0.24, 0.225]);
  ellipsoid('head', [0, -0.085, 0.165], [0.18, 0.12, 0.09], 1);
  for (const side of [-1, 1]) {
    const ear = side < 0 ? 'earL' : 'earR';
    part(cone, ear, [0, 0.015, 0], [0.115, 0.245, 0.085], 0, [0, 0, -side * 0.18]);
    part(cone, ear, [0, 0.015, 0.055], [0.073, 0.16, 0.018], 3, [0, 0, -side * 0.18]);
    const eye = side < 0 ? 'eyeL' : 'eyeR';
    ellipsoid(eye, [0, 0, 0], [0.077, 0.091, 0.035], 1);
    ellipsoid(eye, [0.004, 0, 0.027], [0.055, 0.074, 0.02], 4);
    ellipsoid(eye, [0.01, 0, 0.043], [0.024, 0.061, 0.011], 5);
    ellipsoid(eye, [-0.009, 0.026, 0.052], [0.014, 0.017, 0.007], 6);
    ellipsoid('head', [side * 0.065, -0.078, 0.23], [0.068, 0.05, 0.034], 1);
    ellipsoid('head', [side * 0.177, 0.112, 0.14], [0.02, 0.06, 0.014], 2, [0, 0, -side * 0.38]);
    for (let i = 0; i < 3; i++)
      part(cylinder, 'mouth', [side * 0.16, -0.005 + i * 0.028, 0.005], [0.0035, 0.2, 0.0035], 1, [
        0,
        0,
        side * (1.17 + i * 0.18),
      ]);
  }
  ellipsoid('head', [0, -0.045, 0.262], [0.035, 0.022, 0.016], 3);
  ellipsoid('jaw', [0, -0.015, 0.03], [0.095, 0.035, 0.09], 1);
  ellipsoid('mouth', [0, -0.008, 0.002], [0.025, 0.008, 0.009], 5);
  for (const name of ['frontNear', 'frontFar', 'rearNear', 'rearFar']) {
    ellipsoid(name, [0, -0.08, 0], [0.09, 0.155, 0.085]);
    ellipsoid(`${name}Knee`, [0.01, -0.08, 0], [0.066, 0.13, 0.072]);
    ellipsoid(`${name}Paw`, [0.035, 0.015, 0.013], [0.115, 0.058, 0.088], 1);
    for (const offset of [-0.035, 0.005, 0.045])
      ellipsoid(`${name}Paw`, [0.117, 0.017, offset], [0.007, 0.022, 0.007], 2);
  }
  for (let i = 0; i < 7; i++) {
    const radius = 0.065 - i * 0.005;
    ellipsoid(`tail${i}`, [0, 0, 0], [radius, radius, radius], i % 3 === 2 ? 2 : 0);
    if (i < 6)
      part(
        cylinder,
        `tail${i}`,
        [-0.0475, 0.0325, 0],
        [radius, 0.118, radius],
        i % 3 === 2 ? 2 : 0,
        [0, 0, 0.97],
      );
  }
  for (let i = 0; i < 3; i++)
    ellipsoid('spine', [-0.23 + i * 0.17, 0.19, 0.005], [0.036, 0.055, 0.18], 2, [0, 0, -0.15]);
  pieces.sort((a, b) => a.material - b.material);
  const geometry = mergeGeometries(
    pieces.map(({ g }) => g),
    true,
  );
  const groups = geometry.groups.map((g, i) => ({ ...g, materialIndex: pieces[i].material }));
  geometry.clearGroups();
  for (const group of groups) {
    const previous = geometry.groups.at(-1);
    if (previous?.materialIndex === group.materialIndex) previous.count += group.count;
    else geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  const mesh = new THREE.SkinnedMesh(geometry, materials);
  mesh.name = 'Still skeletal cat';
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
    const walking = ['walk', 'patrol', 'hunt', 'carry', 'stalk'].includes(mode),
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
    if (['crouch', 'stalk-ready', 'grab'].includes(mode)) {
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
    if (mode === 'stretch') {
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
    if (mode === 'scratch') {
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
  return {
    standingHeight: geometry.boundingBox.max.y - geometry.boundingBox.min.y,
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
      smallSphere.dispose();
      tinySphere.dispose();
      cone.dispose();
      cylinder.dispose();
      materials.forEach((m) => m.dispose());
      skeleton.dispose();
    },
  };
}
