import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportSampler } from './contactMesh.js';
import { CAT, PET_UNIT, KITTEN_HEIGHT } from './math.js';

export const CAT_ASSET_URL = `${import.meta.env?.BASE_URL || '/'}models/still-tabby.v1.glb`;

// Authored clips drive the fitted tabby skeleton. Rapier remains the sole owner of
// document-space motion: animation root motion never moves the physics body.
export function animationForMode(mode, speed = 0) {
  const authored = {
    sit: 'Still_Sit',
    meow: 'Still_Sit',
    'head-tilt': 'Still_Sit',
    'lie-down': 'Still_Lie_Down',
    'get-up': 'Still_Get_Up',
    loaf: 'Still_Loaf',
    sploot: 'Still_Sploot',
    knead: 'Still_Knead',
    sleep: 'Still_Sleep',
    'side-sleep': 'Still_Side_Sleep',
    roll: 'Still_Roll',
    stretch: 'Still_Stretch',
    scratch: 'Still_Scratch',
    'scratch-rear': 'Still_Scratch_Rear',
    purr: 'Still_Loaf',
  };
  if (authored[mode]) return authored[mode];
  if (['run', 'descend', 'run-away'].includes(mode)) return 'Cat_Gallop_Run';
  if (['walk', 'patrol', 'visit', 'carry', 'hunt'].includes(mode))
    return Math.abs(speed) > 2.4 ? 'Cat_Trot' : 'Cat_Walk';
  if (['stalk', 'stalk-ready', 'crouch', 'grab-letter'].includes(mode)) return 'Cat_Stalk_Hunt';
  if (['climb', 'cling'].includes(mode)) return 'Cat_Climb_Tree';
  if (['jump', 'fall', 'tossed', 'land', 'cursor-pounce'].includes(mode)) return 'Cat_Leap_Jump';
  if (mode === 'groom') return 'Still_Groom';
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
    // Hips translation is pose data (especially seated grooming), not travel.
    // These clips are in-place. Retain all tracks; only the flight phase below
    // removes the authored jump translation to avoid a second ballistic arc.
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
  const legs = ['frontNear', 'frontFar', 'rearNear', 'rearFar'].map((name) => ({
    name,
    foot: byName[name + 'Paw'],
    target: new THREE.Vector3(),
    stance: false,
    anchor: new THREE.Vector3(),
    weight: 0,
  }));
  const motionData = gltf.asset?.extras?.stillMotion;
  const body = skins[motionData?.body ?? 0];
  const supportVertices = motionData?.supportVertices || [];
  const bodyOrigin = new THREE.Vector3();
  const supportSamplers = skins.flatMap((skin, index) => {
    const seeds = motionData?.skinSupport?.[index] || (skin === body ? supportVertices : []);
    return seeds.length ? [{ skin, sample: createSupportSampler(skin, seeds) }] : [];
  });
  const tailStart = new THREE.Vector3(),
    tailEnd = new THREE.Vector3(),
    tailFrom = new THREE.Vector3(),
    tailTo = new THREE.Vector3();
  const tailDelta = new THREE.Quaternion(),
    tailParent = new THREE.Quaternion(),
    tailInverse = new THREE.Quaternion();
  const tailChain = bones.filter((b) => b.name.startsWith('tail_'));
  const profiles = motionData?.profiles || {};
  let groundError = 0;
  const gaze = new THREE.Quaternion(),
    gazeTarget = new THREE.Quaternion();
  const gazeEuler = new THREE.Euler();
  const weights = { sleep: 0, crouch: 0 };
  let life = 0,
    distance = 0,
    gaitPhase = 0,
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
    probeMouth = null,
    probeRoot = null;
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
      probeRoot = body.getObjectByName(byName.root.name);
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
    probeRoot.position.copy(restByName.get(byName.root).p);
    probe.updateMatrixWorld(true);
    probeMouth.getWorldPosition(probeResult);
    return probeResult;
  }
  let active = null,
    previousMode = '',
    clipName = '',
    seatedLoafEntry = false,
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
    let nextName = animationForMode(mode, speed);
    // Rest-entry variants are animation choices only; the director's states,
    // durations, probabilities and physics remain untouched.
    if (mode === 'lie-down') {
      if (previousMode !== mode) seatedLoafEntry = active?.getClip().name === 'Still_Sit';
      if (seatedLoafEntry && actions.has('Still_Lie_Down_From_Sit'))
        nextName = 'Still_Lie_Down_From_Sit';
    }
    const action = actions.get(nextName) || actions.get('Cat_Idle');
    const elapsed = Math.min(0.05, Math.max(0, dt)),
      t = reduced ? 0 : time;
    if (!reduced) {
      life += elapsed;
      const travel = motion.travel ?? Math.abs(speed) * elapsed;
      if (
        travel < 0.5 &&
        !['drag', 'fall', 'tossed', 'climb', 'jump', 'cursor-pounce'].includes(mode)
      )
        distance += travel;
    }
    const layerBlend = reduced ? 1 : 1 - Math.exp(-elapsed * 6);
    weights.sleep +=
      ((['sleep', 'side-sleep'].includes(mode) ? 1 : 0) - weights.sleep) * layerBlend;
    weights.crouch +=
      ((['crouch', 'stalk-ready'].includes(mode) ? 1 : 0) - weights.crouch) * layerBlend;
    if (active !== action) {
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (active) {
        // Retire old fades. Rapid AI changes otherwise leave dozens of clips
        // contributing residual weights and producing tangled poses.
        for (const other of actions.values())
          if (other !== active && other !== action) other.stop();
        active.crossFadeTo(action, mode === 'sit' ? 0.5 : mode === 'lie-down' ? 0.18 : 0.32, false);
      }
      active = action;
      clipName = nextName;
    }
    if (reduced) {
      for (const other of actions.values()) if (other !== action) other.stop();
      action.stopFading().setEffectiveWeight(1);
    }
    const airborne = ['jump', 'fall', 'tossed', 'land', 'cursor-pounce'].includes(mode),
      frozen = reduced || ['crouch', 'stalk-ready', 'cling'].includes(mode);
    const traveling = ['Cat_Walk', 'Cat_Trot', 'Cat_Gallop_Run', 'Cat_Stalk_Hunt'].includes(
      nextName,
    );
    action.paused = frozen || airborne || traveling;
    if (traveling && !frozen) {
      const stride = profiles[nextName]?.stride || 1.2;
      const step = motion.travel ?? Math.abs(speed) * elapsed;
      if (step < 0.5) gaitPhase = (gaitPhase + step / stride) % 1;
      action.time = gaitPhase * action.getClip().duration;
    }
    if (frozen) action.time = mode === 'cling' ? 0.3 : 0;
    if (['lie-down', 'get-up', 'roll', 'stretch', 'scratch', 'scratch-rear'].includes(mode)) {
      action.paused = true;
      action.time = Math.min(t, action.getClip().duration - 0.001);
    }
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
    if (airborne) byName.root.position.copy(restByName.get(byName.root).p);
    // Every comfort pose is a skeletal clip. The outer group never spins the cat.
    pivot.rotation.set(0, 0, 0);
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
    if (mode === 'purr') rotate(byName.chest, axisX, Math.sin(t * 27) * 0.008);
    if (mode === 'head-tilt') rotate(byName.head, axisZ, 0.24 + Math.sin(t * 2) * 0.08);
    if (mode === 'meow' || holding)
      rotate(byName.jaw, axisX, holding ? 0.12 : Math.max(0, Math.sin(t * 5)) * 0.18);
    // Breathing never resets at a behavior boundary; spring-loaded crouches
    // compress the back while the skin contact solve preserves the support plane.
    const breath = reduced ? 0 : Math.sin(life * 2.0) * 0.02;
    byName.chest.scale.x *= 1 + breath;
    byName.chest.scale.z *= 1 + breath;
    byName.spine.scale.z *= 1 - weights.crouch * 0.12 + breath * 0.35;

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
      if (weights.sleep < 0.7) byName.head.quaternion.multiply(gaze);
      rotate(byName.eyeL, axisY, look * 0.12);
      rotate(byName.eyeR, axisY, look * 0.12);
      if (Math.sin(life * 1.37) > 0.94 || mode === 'stalk-ready') {
        rotate(byName.earL, axisX, Math.sin(life * 22) * 0.07);
        rotate(byName.earR, axisX, -Math.sin(life * 19) * 0.07);
      }
      if (holding) rotate(byName.jaw, axisX, Math.sin(life * 9) * 0.06);
    }

    // Low-amplitude secondary motion across the entire nine-joint tail. The
    // imported clip supplies the principal shape; the tip responds after the base.
    if (!reduced)
      tailChain.forEach((bone, i) => {
        const restfulness = weights.sleep;
        const amplitude =
          (mode === 'stalk-ready' ? 0.022 : 0.008) *
          (i / tailChain.length + 0.25) *
          (1 - restfulness * 0.92);
        rotate(
          bone,
          axisY,
          Math.sin(life * (mode === 'stalk-ready' ? 4 : 1.25) - i * 0.42) * amplitude,
        );
      });
    mesh.updateMatrixWorld(true);
    if (
      motion.grounded &&
      !airborne &&
      !['climb', 'cling', 'drag'].includes(mode) &&
      supportVertices.length
    ) {
      mesh.getWorldPosition(bodyOrigin);
      const floor = motion.support?.top ?? bodyOrigin.y - CAT.halfHeight;
      // A resting tail bends along the floor instead of lifting the whole body
      // when its tip crosses the support plane.
      for (let i = 0; i < tailChain.length - 1; i++) {
        const joint = tailChain[i];
        joint.getWorldPosition(tailStart);
        tailChain[i + 1].getWorldPosition(tailEnd);
        if (tailEnd.y >= floor + 0.04) continue;
        tailFrom.subVectors(tailEnd, tailStart);
        tailTo.copy(tailEnd);
        tailTo.y = floor + 0.04;
        tailTo.sub(tailStart);
        if (tailTo.lengthSq() < 1e-8) continue;
        tailDelta.setFromUnitVectors(tailFrom.normalize(), tailTo.normalize());
        joint.parent.getWorldQuaternion(tailParent);
        tailDelta
          .premultiply(tailInverse.copy(tailParent).invert())
          .multiply(tailParent)
          .multiply(joint.quaternion);
        joint.quaternion.slerp(tailDelta, 0.75);
        joint.updateWorldMatrix(false, true);
      }
      let lowest = Infinity;
      for (const { skin, sample } of supportSamplers) {
        skin.skeleton.update();
        lowest = Math.min(lowest, sample());
      }
      const correction = THREE.MathUtils.clamp(floor - lowest, -1.5, 1.5);
      pivot.position.y += correction;
      mesh.updateMatrixWorld(true);
      groundError = correction;
    } else if (airborne || !motion.grounded) {
      pivot.position.y = THREE.MathUtils.damp(pivot.position.y, 0, 12, elapsed);
      mesh.updateMatrixWorld(true);
    }
    // Contact correction changes the skeleton's world matrices. Publish that
    // final pose now: renderer frame caches and CPU bounds/picking must not use
    // the pre-correction skin matrices for a sleep/roll transition.
    for (const skin of skins) skin.skeleton.update();
    // Measured contact windows are diagnostic anchors. Do not overwrite the
    // authored gait with a second assumed cycle: the old corrective IK caused
    // 20px paw snaps. Sole calibration and measured stride supply flat-ground contact.
    const profile = profiles[nextName],
      phase = (action.time / action.getClip().duration) % 1;
    const sample = profile?.samples[Math.floor(phase * profile.samples.length)];
    legs.forEach((leg, i) => {
      const stance = Boolean(sample && sample.feet[i][1] - sample.ground < 0.055);
      leg.foot.getWorldPosition(leg.target);
      if (stance && !leg.stance) leg.anchor.copy(leg.target);
      leg.stance = stance && Boolean(motion.grounded) && !airborne;
    });
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
    get contacts() {
      return legs.map((l) => ({ name: l.name, stance: l.stance, anchor: l.anchor.toArray() }));
    },
    get groundError() {
      return groundError;
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
