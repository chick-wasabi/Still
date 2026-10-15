// Quiet, local synthesis. No network assets, autoplay, or sound before a gesture.
export function createPetSound(input) {
  let context = null,
    oscillator = null,
    gain = null,
    disposed = false;
  function unlock() {
    if (!input.soundEnabled || disposed) return;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      context ||= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (!oscillator) {
        oscillator = context.createOscillator();
        gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 48;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
      }
    } catch {
      /* Audio support never affects the workspace. */
    }
  }
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  return {
    silence() {
      if (gain && context) gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    },
    update() {
      if (!context || !gain) return;
      const sleeping = ['sleep', 'side-sleep'].includes(input.mode),
        purring = ['purr', 'knead', 'loaf'].includes(input.mode);
      const audible =
        input.soundEnabled &&
        !input.paused &&
        !input.reduced &&
        input.catEnabled &&
        (sleeping || purring);
      const pulse = sleeping
        ? 0.28 + 0.18 * Math.sin(input.time * 1.3)
        : 0.5 + 0.4 * Math.sin(input.time * 2 * Math.PI * 24);
      gain.gain.setTargetAtTime(audible ? 0.009 * pulse : 0, context.currentTime, 0.12);
      oscillator.frequency.setTargetAtTime(sleeping ? 39 : 49, context.currentTime, 0.2);
    },
    dispose() {
      disposed = true;
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      oscillator?.stop();
      oscillator?.disconnect();
      gain?.disconnect();
      context?.close().catch(() => {});
    },
  };
}
