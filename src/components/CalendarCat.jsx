import React, { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useReducedMotion from '../hooks/useReducedMotion';
import { createCompanionController } from '../lib/motion/companionController';

export default memo(function CalendarCat({ enabled = true, suspended = false, layoutKey = '' }) {
  const root = useRef(null),
    controller = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || !root.current) return;
    const engine = createCompanionController(root.current, {
      reduced: Boolean(reduced),
      suspended,
    });
    controller.current = engine;
    return () => {
      engine.destroy();
      controller.current = null;
    };
  }, [enabled, reduced]);
  useEffect(() => {
    controller.current?.suspend(suspended);
    controller.current?.refresh();
  }, [suspended, layoutKey]);
  if (!enabled) return null;
  return createPortal(
    <div className="companion-layer">
      <button
        ref={root}
        hidden
        className="cat-companion"
        aria-label="Pet the cat companion"
        title="A little company. Click to pet."
        data-behavior="idle"
        data-facing="right"
      >
        <span className="cat-shadow" />
        <span className="companion-facing">
          <svg
            className="companion-rig"
            viewBox="0 0 80 64"
            width="68"
            height="56"
            aria-hidden="true"
          >
            <g className="cat-body">
              <path
                className="companion-tail"
                d="M24 38C2 38 1 20 9 15C16 12 12 23 13 25C14 29 20 29 26 29Z"
                fill="#c7a47b"
              />
              <ellipse cx="38" cy="37" rx="22" ry="13" fill="#d7b58b" />
              <ellipse cx="37" cy="39" rx="14" ry="9" fill="#e8c9a1" />
              <path
                className="companion-leg rear"
                d="M25 39Q20 49 24 57L31 57L32 43"
                fill="#c6a178"
              />
              <path
                className="companion-leg front"
                d="M51 36Q49 49 54 57L61 57L59 37"
                fill="#d7b58b"
              />
              <g className="companion-head">
                <path d="M48 23L47 7L60 15L69 6L74 26" fill="#d7b58b" />
                <path d="M51 19L50 12L56 17M65 16L69 11L70 20" fill="#c78681" />
                <ellipse cx="61" cy="27" rx="15" ry="14" fill="#d7b58b" />
                <path d="M54 35Q63 39 72 33" fill="#efd8b9" />
                <g className="cat-awake-eyes" fill="#38433b">
                  <ellipse cx="58" cy="26" rx="1.7" ry="2.3" />
                  <ellipse cx="69" cy="25" rx="1.7" ry="2.3" />
                </g>
                <g className="cat-sleep-eyes" stroke="#52604d" strokeWidth="1.7" fill="none">
                  <path d="M54 27Q58 30 61 26M65 26Q68 29 72 25" />
                </g>
                <path d="M64 30L68 30L66 33Z" fill="#a87874" />
                <path
                  d="M66 33L66 35M70 33L78 31M70 35L79 36M61 34L53 33"
                  stroke="#715d4f"
                  strokeWidth=".8"
                  fill="none"
                />
                <path
                  d="M50 21L55 19M48 25L53 23M32 29L30 34M38 26L37 32M44 27L43 32"
                  stroke="#b28a62"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
            </g>
          </svg>
        </span>
        <span className="cat-sleep-marks" aria-hidden="true">
          z<span>z</span>
        </span>
        <span className="cat-affection" aria-hidden="true">
          ♡
        </span>
        <span className="companion-yarn" aria-hidden="true">
          <svg viewBox="0 0 45 35" width="42" height="33">
            <path d="M18 22Q25 36 40 27" stroke="#b9a4d5" fill="none" strokeWidth="1.2" />
            <circle cx="16" cy="16" r="12" fill="#b9a4d5" />
            <path
              d="M7 9Q16 13 22 25M5 16Q15 19 19 27M13 5Q21 12 27 13M9 6Q11 17 6 21"
              fill="none"
              stroke="#e1d0f0"
              strokeWidth="1.2"
            />
          </svg>
        </span>
      </button>
    </div>,
    document.body,
  );
});
