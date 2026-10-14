import { useEffect } from 'react';
import useReducedMotion from './useReducedMotion';

export default function useAmbientLight(root, enabled) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0,
      last = 0,
      x = 0,
      y = 0,
      targetX = 0,
      targetY = 0;
    const layers = [...root.current.querySelectorAll('[data-parallax]')];
    function tick(time) {
      frame = 0;
      if (document.hidden || reduced || !enabled) return;
      const delta = last ? Math.min((time - last) / 1000, 0.04) : 1 / 60;
      last = time;
      const smoothing = 1 - Math.exp(-delta * 7);
      x += (targetX - x) * smoothing;
      y += (targetY - y) * smoothing;
      for (const layer of layers) {
        const depth = Number(layer.dataset.parallax);
        layer.style.transform = `translate3d(${(x * depth).toFixed(2)}px,${(y * depth * 0.65).toFixed(2)}px,0)`;
      }
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.003)
        frame = requestAnimationFrame(tick);
    }
    function move(event) {
      if (!pointer.matches || reduced || !enabled) return;
      targetX = (event.clientX / innerWidth) * 2 - 1;
      targetY = (event.clientY / innerHeight) * 2 - 1;
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    function reset() {
      targetX = 0;
      targetY = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (!document.hidden && enabled && !reduced) frame = requestAnimationFrame(tick);
      else layers.forEach((layer) => layer.style.removeProperty('transform'));
    }
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      document.removeEventListener('visibilitychange', reset);
      layers.forEach((layer) => layer.style.removeProperty('transform'));
    };
  }, [enabled, root, reduced]);
}
