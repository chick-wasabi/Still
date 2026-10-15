import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CAT, PET_UNIT, KITTEN_HEIGHT } from './math.js';

export const CAT_ASSET_URL = `${import.meta.env?.BASE_URL || '/'}models/still-tabby.v1.glb`;

// Authored clips drive the fitted tabby skeleton. Rapier remains the sole owner of
// document-space motion: animation root motion never moves the physics body.
export function animationForMode(mode, speed = 0) {
  if (['run', 'descend'].includes(mode)) return 'Cat_Gallop_Run';
  if (['walk', 'patrol', 'visit', 'carry', 'hunt'].includes(mode))
    return Math.abs(speed) > 2.4 ? 'Cat_Trot' : 'Cat_Walk';
  if (['stalk', 'stalk-ready', 'crouch', 'grab', 'grab-letter'].includes(mode))
    return 'Cat_Stalk_Hunt';
  if (['climb', 'cling'].includes(mode)) return 'Cat_Climb_Tree';
  if (['jump', 'fall', 'tossed', 'land'].includes(mode)) return 'Cat_Leap_Jump';
  if (mode === 'groom') return 'Cat_Lick_Paw';
  if (mode === 'bat') return 'Cat_Pounce_Attack';
  return 'Cat_Idle';
}

export function createCatModel(gltf) {
  if (!gltf?.scene || !gltf.animations?.length) throw new Error('Animated cat asset is missing.');
  // useLoader owns the immutable geometry/textures. Clone bones and bindings for
  // each mount, so context recovery and Strict Mode never dispose the shared asset.
  const asset = clone(gltf.scene),
    mesh = new THREE.Group(),
    pivot = new THREE.Group(),
    bones = [],
    skins = [],
    materials = new Set();
  mesh.name = 'Still animated tabby';
  mesh.add(pivot);
  pivot.add(asset);
  asset.traverse((o) => {
    if (o.isBone) bones.push(o);
    if (o.isSkinnedMesh) {
      skins.push(o);
      o.frustumCulled = false;
      const copyMaterial = (m) => {
        const copy = m.clone();
        materials.add(copy);
        return copy;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(copyMaterial)
        : copyMaterial(o.material);
    }
  });
  if (!skins.length) throw new Error('Cat asset has no skinned geometry.');
  const find = (prefix) => bones.find((b) => b.name.startsWith(prefix));
  const byName = {
    root: find('hips_'),
    spine: find('spine_02'),
    chest: find('chest_'),
    neck: find('neck_01'),
    head: find('head_'),
    jaw: find('jaw_'),
    earL: find('ear_01L') || find('ear_01.L'),
    earR: find('ear_01R') || find('ear_01.R'),
    frontNear: find('upperarmL') || find('upperarm.L'),
    frontFar: find('upperarmR') || find('upperarm.R'),
    frontNearKnee: find('forearmL') || find('forearm.L'),
    frontFarKnee: find('forearmR') || find('forearm.R'),
    rearNear: find('thighL') || find('thigh.L'),
    rearFar: find('thighR') || find('thigh.R'),
    rearNearKnee: find('shinL') || find('shin.L'),
    rearFarKnee: find('shinR') || find('shin.R'),
    tail: find('tail_01'),
  };
  if (Object.values(byName).some((b) => !b)) throw new Error('Cat skeleton is incomplete.');
  const rest = bones.map((b) => ({
    p: b.position.clone(),
    q: b.quaternion.clone(),
    s: b.scale.clone(),
  }));
  const basePose = rest.map((r) => ({ p: r.p.clone(), q: r.q.clone(), s: r.s.clone() }));
  const restByName = new Map(bones.map((b, i) => [b, rest[i]]));
  asset.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(asset, true);
  const height = box.max.y - box.min.y,
    factor = KITTEN_HEIGHT / PET_UNIT / height;
  asset.scale.multiplyScalar(factor);
  // glTF faces +Z; the pet engine faces +X. No rescaling or repositioning on scroll.
  asset.rotation.y += Math.PI / 2;
  asset.position.y -= CAT.halfHeight + box.min.y * factor;
  asset.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(asset),
    actions = new Map();
  for (const original of gltf.animations) {
    const clip = original.clone();
    // Keep spine/limb articulation but remove authored translation of the hips.
    // Ballistic arcs and wall traversal come exclusively from the physics engine.
    clip.tracks = clip.tracks.filter((t) => t.name !== `${byName.root.name}.position`);
    actions.set(clip.name, mixer.clipAction(clip));
  }
  // The imported spine joints sit near the back's surface, rather than at the
  // old model's torso center. Keep a body-local pick anchor inside the chest.
  const pickAnchor = new THREE.Object3D();
  const interior = byName.spine.getWorldPosition(new THREE.Vector3());
  interior.y -= 0.18;
  pickAnchor.position.copy(byName.spine.worldToLocal(interior));
  byName.spine.add(pickAnchor);
  const mouth = new THREE.Object3D();
  mouth.name = 'Still mouth attachment';
  // Chin tip in this fitted rig's local coordinates (before global 45px scale).
  mouth.position.set(0, 0.012, 0.008);
  byName.jaw.add(mouth);
  const turn = new THREE.Quaternion(),
    axisX = new THREE.Vector3(1, 0, 0),
    axisY = new THREE.Vector3(0, 1, 0),
    axisZ = new THREE.Vector3(0, 0, 1);
  function rotate(bone, axis, angle) {
    if (angle) bone.quaternion.multiply(turn.setFromAxisAngle(axis, angle));
  }
  let active = null,
    previousMode = '',
    clipName = '',
    disposed = false;
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
    if (disposed) return;
    const nextName = animationForMode(mode, speed),
      action = actions.get(nextName) || actions.get('Cat_Idle');
    const elapsed = Math.min(0.05, Math.max(0, dt)),
      t = reduced ? 0 : time;
    if (active !== action) {
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (active) {
        // Retire old fades. Rapid AI changes otherwise leave dozens of clips
        // contributing residual weights and producing tangled poses.
        for (const other of actions.values())
          if (other !== active && other !== action) other.stop();
        active.crossFadeTo(action, 0.18, false);
      }
      active = action;
      clipName = nextName;
    }
    if (reduced) {
      for (const other of actions.values()) if (other !== action) other.stop();
      action.stopFading().setEffectiveWeight(1);
    }
    const airborne = ['jump', 'fall', 'tossed', 'land'].includes(mode),
      frozen =
        reduced || ['sleep', 'sit', 'head-tilt', 'crouch', 'stalk-ready', 'cling'].includes(mode);
    action.paused = frozen || airborne;
    if (frozen) action.time = mode === 'cling' ? 0.3 : 0;
    if (airborne) {
      // Use the authored tucked-flight pose during the actual physical arc;
      // crouching/landing are separate AI phases, not a second visual jump.
      action.time =
        mode === 'land' ? 2.1 + Math.min(t / 0.24, 1) * 0.275 : Math.min(1.85, 0.65 + t * 2);
    }
    if (mode === 'bat' && previousMode !== mode) action.time = 0.65;
    const locomotion = ['Cat_Walk', 'Cat_Trot', 'Cat_Gallop_Run', 'Cat_Stalk_Hunt'].includes(
      nextName,
    );
    action.timeScale = locomotion
      ? THREE.MathUtils.clamp(
          Math.abs(speed) /
            (nextName === 'Cat_Gallop_Run' ? 5.7 : nextName === 'Cat_Trot' ? 3.4 : 1.6),
          0.65,
          1.45,
        )
      : 1;
    // Restore the last unmodified mixer pose, not the bind pose. Three.js skips
    // unchanged constant tracks, so resetting to bind would silently lose them.
    bones.forEach((b, i) => {
      b.position.copy(basePose[i].p);
      b.quaternion.copy(basePose[i].q);
      b.scale.copy(basePose[i].s);
    });
    mixer.update(reduced ? 0 : elapsed);
    bones.forEach((b, i) => {
      basePose[i].p.copy(b.position);
      basePose[i].q.copy(b.quaternion);
      basePose[i].s.copy(b.scale);
    });
    byName.root.position.copy(restByName.get(byName.root).p);
    const smooth = reduced ? 1 : 1 - Math.exp(-elapsed * 12);
    let tilt = 0,
      roll = 0,
      lower = 0;
    const curl =
      mode === 'sleep' ? 1 : mode === 'sit' || mode === 'meow' || mode === 'head-tilt' ? 0.5 : 0;
    if (curl) {
      for (const b of [byName.rearNear, byName.rearFar]) rotate(b, axisX, -0.65 * curl);
      for (const b of [byName.rearNearKnee, byName.rearFarKnee]) rotate(b, axisX, 1.0 * curl);
      lower = -0.12 * curl;
    }
    if (mode === 'sleep') {
      rotate(byName.neck, axisX, 0.45);
      rotate(byName.head, axisY, 0.45);
      rotate(byName.tail, axisY, 0.85);
      for (const b of [byName.frontNear, byName.frontFar]) rotate(b, axisX, -0.65);
      for (const b of [byName.frontNearKnee, byName.frontFarKnee]) rotate(b, axisX, 1.1);
    }
    if (mode === 'stretch') {
      const amount = Math.sin(Math.min(t / 2.2, 1) * Math.PI);
      rotate(byName.chest, axisX, 0.25 * amount);
      rotate(byName.neck, axisX, -0.22 * amount);
      for (const b of [byName.frontNear, byName.frontFar]) rotate(b, axisX, 0.3 * amount);
      lower = -0.08 * amount;
    }
    if (mode === 'roll') {
      roll = Math.PI * (1 - Math.cos(Math.min(t / 2.5, 1) * Math.PI));
      lower = -0.1;
      for (const b of [byName.frontNear, byName.frontFar]) rotate(b, axisX, -0.8);
      for (const b of [byName.frontNearKnee, byName.frontFarKnee]) rotate(b, axisX, 1.2);
    }
    if (['scratch', 'scratch-rear'].includes(mode)) {
      tilt = mode === 'scratch-rear' ? -0.48 : -0.16;
      rotate(byName.frontNear, axisX, -0.8 + Math.sin(t * 15) * 0.25);
      rotate(byName.frontFar, axisX, -0.8 - Math.sin(t * 15) * 0.25);
      rotate(byName.frontNearKnee, axisX, 0.6);
      rotate(byName.frontFarKnee, axisX, 0.6);
    }
    if (mode === 'land') lower = -0.09 * Math.exp(-t * 10);
    if (mode === 'purr') rotate(byName.chest, axisX, Math.sin(t * 27) * 0.008);
    if (mode === 'head-tilt') rotate(byName.head, axisZ, 0.24 + Math.sin(t * 2) * 0.08);
    if (mode === 'meow' || holding)
      rotate(byName.jaw, axisX, holding ? 0.12 : Math.max(0, Math.sin(t * 5)) * 0.18);
    if (!locomotion && !airborne && !reduced) rotate(byName.head, axisY, look * 0.12 * facing);
    if (previousMode === 'roll' && mode !== 'roll')
      pivot.rotation.x =
        THREE.MathUtils.euclideanModulo(pivot.rotation.x + Math.PI, Math.PI * 2) - Math.PI;
    pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, tilt, smooth);
    pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, roll, smooth);
    pivot.position.y = THREE.MathUtils.lerp(pivot.position.y, lower, smooth);
    mesh.updateMatrixWorld(true);
    previousMode = mode;
  }
  update('idle', 0, 0, 0);
  return {
    standingHeight: KITTEN_HEIGHT / PET_UNIT,
    mesh,
    bones,
    skins,
    byName,
    skeleton: skins[0].skeleton,
    animations: gltf.animations.map((a) => a.name),
    get activeClip() {
      return clipName;
    },
    update,
    pickPosition(target) {
      return pickAnchor.getWorldPosition(target);
    },
    mouthPosition(target = new THREE.Vector3()) {
      return mouth.getWorldPosition(target);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(asset);
      new Set(skins.map((s) => s.skeleton)).forEach((s) => s.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
