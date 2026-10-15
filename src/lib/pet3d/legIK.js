import { Quaternion, Vector3, MathUtils } from 'three';

// Analytic two-bone IK. Preserve the animated knee's bend plane, clamp reach,
// and apply world-space corrections in each joint's parent coordinate system.
export function createLegIK(upper, knee, foot) {
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    direction = new Vector3(),
    pole = new Vector3(),
    wantedKnee = new Vector3(),
    from = new Vector3(),
    to = new Vector3();
  const delta = new Quaternion(),
    parent = new Quaternion(),
    inverse = new Quaternion();
  function aim(joint, oldDirection, newDirection, weight) {
    if (oldDirection.lengthSq() < 1e-10 || newDirection.lengthSq() < 1e-10) return;
    delta.setFromUnitVectors(oldDirection.normalize(), newDirection.normalize());
    joint.parent.getWorldQuaternion(parent);
    inverse.copy(parent).invert();
    delta.premultiply(inverse).multiply(parent).multiply(joint.quaternion);
    joint.quaternion.slerp(delta, weight);
    joint.updateWorldMatrix(false, true);
  }
  return function solve(target, weight = 1) {
    upper.getWorldPosition(a);
    knee.getWorldPosition(b);
    foot.getWorldPosition(c);
    const first = a.distanceTo(b),
      second = b.distanceTo(c);
    if (first < 1e-6 || second < 1e-6) return;
    direction.subVectors(target, a);
    const distance = MathUtils.clamp(
      direction.length(),
      Math.abs(first - second) + 1e-4,
      (first + second) * 0.998,
    );
    direction.normalize();
    pole.subVectors(b, a).addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).addScaledVector(direction, -direction.z);
    pole.normalize();
    const along = (first * first + distance * distance - second * second) / (2 * distance);
    wantedKnee
      .copy(a)
      .addScaledVector(direction, along)
      .addScaledVector(pole, Math.sqrt(Math.max(0, first * first - along * along)));
    aim(upper, from.subVectors(b, a), to.subVectors(wantedKnee, a), weight);
    knee.getWorldPosition(b);
    foot.getWorldPosition(c);
    aim(knee, from.subVectors(c, b), to.subVectors(target, b), weight);
  };
}
