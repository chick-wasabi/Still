// Weights are choices at intention boundaries, not frame probabilities. Longer
// naps make rest dominate time occupancy; diagnostics expose the actual totals.
export const BEHAVIORS = Object.freeze({
  idle: { weight: 12, duration: [7, 15], family: 'observe', cooldown: 0 },
  sit: { weight: 12, duration: [9, 20], family: 'observe', cooldown: 6 },
  loaf: { weight: 10, duration: [14, 25], family: 'observe', cooldown: 15 },
  sploot: { weight: 3, duration: [12, 22], family: 'observe', cooldown: 30 },
  sleep: { weight: 13, duration: [40, 50], family: 'rest', cooldown: 30 },
  groom: { weight: 12, duration: [7, 12], family: 'comfort', cooldown: 16 },
  knead: { weight: 5, duration: [6, 10], family: 'comfort', cooldown: 30 },
  stretch: { weight: 5, duration: [4, 4], family: 'comfort', cooldown: 25 },
  walk: { weight: 12, duration: [4, 8], family: 'explore', cooldown: 0 },
  explore: { weight: 10, duration: [10, 24], family: 'explore', cooldown: 4 },
  run: { weight: 1, duration: [2, 4], family: 'play', cooldown: 35 },
  roll: { weight: 2, duration: [7, 7], family: 'play', cooldown: 65 },
  climb: { weight: 1, duration: [3, 15], family: 'explore', cooldown: 30 },
  scratch: { weight: 1, duration: [2, 2.4], family: 'mischief', cooldown: 35 },
  meow: { weight: 0.5, duration: [1.8, 2.5], family: 'mischief', cooldown: 60 },
  'steal-letter': { weight: 0.5, duration: [5, 10], family: 'mischief', cooldown: 65 },
  hunt: { weight: 5, duration: [5, 8], family: 'play', cooldown: 20 },
});
export const RESTING = new Set(['lie-down', 'loaf', 'sploot', 'sleep', 'side-sleep', 'get-up']);
export const COMFORT = new Set(['loaf', 'sploot', 'sleep', 'side-sleep', 'knead', 'roll']);
export function behaviorDuration(mode, random = Math.random) {
  const [a, b] = BEHAVIORS[mode]?.duration || [4, 8];
  return a + (b - a) * random();
}
export function selectBehavior(context, random = Math.random) {
  const {
    energy = 1,
    previous = '',
    recent = [],
    ball = false,
    wall = false,
    text = false,
    arousal = 0.5,
    time = 0,
    cooldowns = {},
    space = Infinity,
  } = context;
  const available = Object.entries(BEHAVIORS)
    .filter(
      ([name]) =>
        name !== previous &&
        time >= (cooldowns[name] || 0) &&
        (name !== 'hunt' || ball) &&
        (name !== 'climb' || wall) &&
        (!['scratch', 'steal-letter'].includes(name) || text) &&
        (!['roll', 'sploot'].includes(name) || space > 2.8),
    )
    .map(([name, c]) => {
      let weight = c.weight * (recent.includes(name) ? 0.32 : 1);
      if (name === 'sleep') weight *= energy < 0.4 ? 4 : 0.55;
      if (c.family === 'explore') weight *= 0.6 + energy * 0.6;
      if (c.family === 'play') weight *= 0.3 + arousal;
      return [name, weight];
    });
  let dice = random() * available.reduce((n, [, w]) => n + w, 0);
  return available.find(([, w]) => (dice -= w) < 0)?.[0] || 'idle';
}
