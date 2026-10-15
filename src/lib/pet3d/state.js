export function createPetInput() {
  return {
    ready: false,
    catEnabled: true,
    ballEnabled: false,
    bubble: null,
    stolenLetter: null,
    letterRelease: null,
    arousal: 0.5,
    pointerSpeed: 0,
    viewport: null,
    paws: null,
    paused: false,
    reduced: false,
    mode: 'idle',
    time: 0,
    stateTime: 0,
    speed: 0,
    facing: 1,
    pointer: { x: 0, y: 0, inside: false },
    worldPointer: { x: 0, y: 0, z: 0 },
    catPosition: { x: 0, y: 0 },
    ballPosition: { x: 0, y: 0 },
    cursorActive: false,
    cursorType: 'arrow',
    idleDeadline: Infinity,
    pressed: false,
    held: false,
    carryingBall: false,
    mouth: { x: 0, y: 0, z: 0 },
    grabAt: 0,
    heldAt: 0,
    drag: null,
    justTossed: false,
    ballMoved: false,
    command: null,
    grounded: false,
  };
}
export function restoreNativeCursor(input, cancelDrag = true) {
  if (cancelDrag && input.drag) input.cancelDrag?.();
  document.documentElement.removeAttribute('data-pet-cursor');
  input.cursorActive = false;
  input.held = false;
  input.grabAt = 0;
}
