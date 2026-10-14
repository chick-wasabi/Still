// Rapier's CCD can retain contacts for a disabled collider during kinematic motion.
// Collision groups also filter those sweeps, preventing a held toy from catapulting the cat.
export function maskToyContacts(body) {
  const collider = body.collider(0);
  const groups = collider.collisionGroups();
  collider.setCollisionGroups(0);
  return groups;
}
export function restoreToyContacts(body, groups) {
  body.collider(0).setCollisionGroups(groups);
}
