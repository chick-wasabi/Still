import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createLegIK } from './legIK.js';
import { CAT, PET_UNIT, KITTEN_HEIGHT } from './math.js';

export const CAT_ASSET_URL = `${import.meta.env?.BASE_URL || '/'}models/still-tabby.v1.glb`;

// Authored clips drive the fitted tabby skeleton. Rapier remains the sole owner of
// document-space motion: animation root motion never moves the physics body.
export function animationForMode(mode, speed = 0) {
  if (['run', 'descend', 'run-away'].includes(mode)) return 'Cat_Gallop_Run';
  if (['walk', 'patrol', 'visit', 'carry', 'hunt'].includes(mode))
    return Math.abs(speed) > 2.4 ? 'Cat_Trot' : 'Cat_Walk';
  if (['stalk', 'stalk-ready', 'crouch', 'grab-letter'].includes(mode)) return 'Cat_Stalk_Hunt';
  if (['climb', 'cling'].includes(mode)) return 'Cat_Climb_Tree';
  if (['jump', 'fall', 'tossed', 'land', 'cursor-pounce'].includes(mode)) return 'Cat_Leap_Jump';
  if (mode === 'groom') return 'Cat_Lick_Paw';
  if (mode === 'bat') return 'Cat_Pounce_Attack';
  if (mode === 'grab' || mode === 'guard') return 'Cat_Bite_Attack';
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
    eyeL: find('eyeL') || find('eye.L'),
    eyeR: find('eyeR') || find('eye.R'),
    frontNearPaw: find('handL') || find('hand.L'),
    frontFarPaw: find('handR') || find('hand.R'),
    rearNearPaw: find('footL') || find('foot.L'),
    rearFarPaw: find('footR') || find('foot.R'),
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
  const legs = ['frontNear', 'frontFar', 'rearNear', 'rearFar'].map((name, i) => {
    const foot = byName[name + 'Paw'],
      position = foot.getWorldPosition(new THREE.Vector3());
    return {
      name,
      phase: [0, 0.5, 0.5, 0][i],
      foot,
      solve: createLegIK(byName[name], byName[name + 'Knee'], foot),
      sole: position.y + CAT.halfHeight,
      target: new THREE.Vector3(),
      locked: false,
      anchor: 0,
      weight: 0,
    };
  });
  const gaze = new THREE.Quaternion(),
    gazeTarget = new THREE.Quaternion();
  const gazeEuler = new THREE.Euler();
  const weights = { sleep: 0, sit: 0, stretch: 0, scratch: 0, crouch: 0 };
  let life = 0,
    distance = 0,
    nextSaccade = 0,
    saccade = 0,
    blinkAt = -Infinity,
    nextBlink = 2 + Math.random() * 4;
  const eyeAxes = [byName.eyeL, byName.eyeR].map((eye) => {
    const q = eye.getWorldQuaternion(new THREE.Quaternion());
    return ['x', 'y', 'z'].sort(
      (a, b) =>
        Math.abs(
          new THREE.Vector3(
            b === 'x' ? 1 : 0,
            b === 'y' ? 1 : 0,
            b === 'z' ? 1 : 0,
          ).applyQuaternion(q).y,
        ) -
        Math.abs(
          new THREE.Vector3(
            a === 'x' ? 1 : 0,
            a === 'y' ? 1 : 0,
            a === 'z' ? 1 : 0,
          ).applyQuaternion(q).y,
        ),
    )[0];
  });
  const turn = new THREE.Quaternion(),
    axisX = new THREE.Vector3(1, 0, 0),
    axisY = new THREE.Vector3(0, 1, 0),
    axisZ = new THREE.Vector3(0, 0, 1);
  function rotate(bone, axis, angle) {
    if (angle) bone.quaternion.multiply(turn.setFromAxisAngle(axis, angle));
  }
  let probe = null,
    probeMixer = null,
    probeAction = null,
    probeMouth = null;
  const probeResult = new THREE.Vector3();
  function predictPounce(seconds, facing) {
    if (!probe) {
      const body = clone(gltf.scene),
        outer = new THREE.Group();
      outer.add(body);
      body.scale.copy(asset.scale);
      body.position.copy(asset.position);
      body.rotation.copy(asset.rotation);
      probe = outer;
      probeMouth = new THREE.Object3D();
      probeMouth.position.copy(mouth.position);
      body.getObjectByName(byName.jaw.name).add(probeMouth);
      probeMixer = new THREE.AnimationMixer(body);
      probeAction = probeMixer.clipAction(actions.get('Cat_Leap_Jump').getClip()).play();
      probeAction.paused = true;
    }
    probe.rotation.y = facing < 0 ? Math.PI + 0.16 : -0.16;
    probeAction.time = Math.min(1.85, 0.65 + seconds * 2);
    probeMixer.update(0);
    probe.updateMatrixWorld(true);
    probeMouth.getWorldPosition(probeResult);
    return probeResult;
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
    motion = {},
  ) {
    if (disposed) return;
    const nextName = animationForMode(mode, speed),
      action = actions.get(nextName) || actions.get('Cat_Idle');
    const elapsed = Math.min(0.05, Math.max(0, dt)),
      t = reduced ? 0 : time;
    if (!reduced) {
      life += elapsed;
      distance += motion.travel ?? Math.abs(speed) * elapsed;
    }
    const layerBlend = reduced ? 1 : 1 - Math.exp(-elapsed * 9);
    for (const key of Object.keys(weights)) {
      const on =
        key === 'sit'
          ? ['sit', 'meow', 'head-tilt'].includes(mode)
          : key === 'scratch'
            ? ['scratch', 'scratch-rear'].includes(mode)
            : key === 'crouch'
              ? ['crouch', 'stalk-ready'].includes(mode)
              : mode === key;
      weights[key] += ((on ? 1 : 0) - weights[key]) * layerBlend;
    }
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
    const airborne = ['jump', 'fall', 'tossed', 'land', 'cursor-pounce'].includes(mode),
      frozen =
        reduced || ['sleep', 'sit', 'head-tilt', 'crouch', 'stalk-ready', 'cling'].includes(mode);
    const traveling = ['Cat_Walk', 'Cat_Trot', 'Cat_Gallop_Run', 'Cat_Stalk_Hunt'].includes(
      nextName,
    );
    action.paused = frozen || airborne || traveling;
    if (traveling && !frozen) {
      const stride = nextName === 'Cat_Gallop_Run' ? 2.2 : nextName === 'Cat_Trot' ? 1.7 : 1.2;
      action.time = ((distance / stride) % 1) * action.getClip().duration;
    }
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
    const curl = weights.sleep + weights.sit * 0.5;
    if (curl) {
      for (const b of [byName.rearNear, byName.rearFar]) rotate(b, axisX, -0.65 * curl);
      for (const b of [byName.rearNearKnee, byName.rearFarKnee]) rotate(b, axisX, 1.0 * curl);
      lower = -0.12 * curl;
    }
    if (weights.sleep > 0.001) {
      roll = (weights.sleep * Math.PI) / 2;
      lower = -0.22 * weights.sleep;
      rotate(byName.neck, axisX, 0.45 * weights.sleep);
      rotate(byName.head, axisY, 0.45 * weights.sleep);
      rotate(byName.tail, axisY, 0.85 * weights.sleep);
      for (const b of [byName.frontNear, byName.frontFar]) rotate(b, axisX, -0.65 * weights.sleep);
      for (const b of [byName.frontNearKnee, byName.frontFarKnee])
        rotate(b, axisX, 1.1 * weights.sleep);
    }
    if (weights.stretch > 0.001) {
      const amount = Math.sin(Math.min(t / 3.5, 1) * Math.PI) * weights.stretch;
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
    if (weights.scratch > 0.001) {
      tilt = (mode === 'scratch-rear' ? 0.65 : 0.32) * weights.scratch;
      lower += (mode === 'scratch-rear' ? 0.28 : 0.15) * weights.scratch;
      rotate(byName.frontNear, axisX, (-0.8 + Math.sin(life * 15) * 0.25) * weights.scratch);
      rotate(byName.frontFar, axisX, (-0.8 - Math.sin(life * 15) * 0.25) * weights.scratch);
      rotate(byName.frontNearKnee, axisX, 0.6 * weights.scratch);
      rotate(byName.frontFarKnee, axisX, 0.6 * weights.scratch);
    }
    if (!reduced && life >= nextBlink) {
      blinkAt = life;
      nextBlink = life + 3 + Math.random() * 4;
    }
    const blinkPhase = (life - blinkAt) / 0.18;
    const blink =
      blinkPhase >= 0 && blinkPhase < 1 && !reduced ? Math.sin(blinkPhase * Math.PI) * 0.9 : 0;
    [byName.eyeL, byName.eyeR].forEach((eye, i) => {
      eye.scale[eyeAxes[i]] *= 1 - Math.max(blink, weights.sleep * 0.94);
    });
    if (mode === 'land') lower = -0.09 * Math.exp(-t * 10);
    if (mode === 'bat')
      rotate(
        motion.strikeSide ? byName.frontFar : byName.frontNear,
        axisX,
        -Math.sin(Math.min(t / 0.7, 1) * Math.PI) * 0.35,
      );
    if (mode === 'purr') rotate(byName.chest, axisX, Math.sin(t * 27) * 0.008);
    if (mode === 'head-tilt') rotate(byName.head, axisZ, 0.24 + Math.sin(t * 2) * 0.08);
    if (mode === 'meow' || holding)
      rotate(byName.jaw, axisX, holding ? 0.12 : Math.max(0, Math.sin(t * 5)) * 0.18);
    // Breathing never resets at a behavior boundary; spring-loaded crouches
    // compress the back while paw IK keeps contact with the actual visual ledge.
    const breath = reduced ? 0 : Math.sin(life * 2.0) * 0.02;
    byName.chest.scale.x *= 1 + breath;
    byName.chest.scale.z *= 1 + breath;
    byName.spine.scale.z *= 1 - weights.crouch * 0.12 + breath * 0.35;
    lower -= weights.crouch * 0.12;
    if (!reduced) {
      if (life >= nextSaccade) {
        nextSaccade = life + 0.2 + Math.random() * 0.55;
        saccade = (Math.random() - 0.5) * 0.07;
      }
      const tracking = motion.pointerSpeed == null || motion.pointerSpeed < 350;
      gazeEuler.set(
        THREE.MathUtils.clamp(motion.lookY || 0, -1, 1) * 0.12,
        (tracking ? look * 0.24 * facing : 0) + saccade,
        0,
      );
      gazeTarget.setFromEuler(gazeEuler);
      gaze.slerp(gazeTarget, 1 - Math.exp(-elapsed * 8));
      byName.head.quaternion.multiply(gaze);
      rotate(byName.eyeL, axisY, look * 0.12);
      rotate(byName.eyeR, axisY, look * 0.12);
      if (Math.sin(life * 1.37) > 0.94 || mode === 'stalk-ready') {
        rotate(byName.earL, axisX, Math.sin(life * 22) * 0.07);
        rotate(byName.earR, axisX, -Math.sin(life * 19) * 0.07);
      }
      if (holding) rotate(byName.jaw, axisX, Math.sin(life * 9) * 0.06);
    }

    if (previousMode === 'roll' && mode !== 'roll')
      pivot.rotation.x =
        THREE.MathUtils.euclideanModulo(pivot.rotation.x + Math.PI, Math.PI * 2) - Math.PI;
    pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, tilt, smooth);
    pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, roll, smooth);
    pivot.position.y = THREE.MathUtils.lerp(pivot.position.y, lower, smooth);
    mesh.updateMatrixWorld(true);
    for (const leg of legs) {
      const sprint = nextName === 'Cat_Gallop_Run';
      const phase =
        (distance / (sprint ? 2.2 : nextName === 'Cat_Trot' ? 1.7 : 1.2) +
          (sprint ? [0, 0.12, 0.5, 0.62][legs.indexOf(leg)] : leg.phase)) %
        1;
      const stance = !traveling || phase < (sprint ? 0.48 : 0.62);
      const enabled =
        !reduced &&
        motion.grounded &&
        motion.sampleGround &&
        stance &&
        !airborne &&
        !['climb', 'cling', 'drag', 'roll', 'groom', 'bat'].includes(mode) &&
        curl < 0.15 &&
        (weights.scratch < 0.15 || leg.name.startsWith('rear'));
      leg.weight += ((enabled ? 1 : 0) - leg.weight) * (1 - Math.exp(-elapsed * 18));
      if (!enabled) {
        if (leg.locked && leg.weight > 0.01 && motion.grounded && !airborne && curl < 0.15) {
          leg.target.set(leg.anchor, leg.floor + leg.sole, leg.target.z);
          leg.solve(leg.target, leg.weight);
        } else leg.locked = false;
        continue;
      }
      leg.foot.getWorldPosition(leg.target);
      const floor = motion.sampleGround(leg.target.x, leg.target.y);
      if (floor == null || Math.abs(leg.target.y - (floor + leg.sole)) > 0.65) {
        leg.locked = false;
        continue;
      }
      if (!leg.locked || Math.abs(leg.anchor - leg.target.x) > 0.8) {
        leg.anchor = leg.target.x;
        leg.locked = true;
      }
      leg.floor = floor;
      leg.target.x = leg.anchor;
      leg.target.y = floor + leg.sole;
      leg.solve(leg.target, leg.weight);
    }
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
    predictPounce,
    pawPositions(targets) {
      legs.forEach((leg, i) => leg.foot.getWorldPosition(targets[i]));
    },
    attachToMouth(object) {
      mouth.attach(object);
    },
    get gaitDistance() {
      return distance;
    },
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
      probeMixer?.stopAllAction();
      probe?.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton.dispose();
      });
      mixer.stopAllAction();
      mixer.uncacheRoot(asset);
      new Set(skins.map((s) => s.skeleton)).forEach((s) => s.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
