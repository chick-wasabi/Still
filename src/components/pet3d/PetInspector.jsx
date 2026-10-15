import React, { useEffect, useState } from 'react';
const POSES = [
  'auto',
  'idle',
  'walk',
  'run',
  'sit',
  'groom',
  'lie-down',
  'loaf',
  'sploot',
  'knead',
  'sleep',
  'side-sleep',
  'roll',
  'get-up',
  'stretch',
  'scratch',
  'scratch-rear',
  'stalk-ready',
];
// Mounted only by DEV + ?petDebug=1. Diagnostic refresh is 5Hz, never the app loop.
export default function PetInspector({ input, layout }) {
  const [snapshot, setSnapshot] = useState({}),
    [show, setShow] = useState(true);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setSnapshot({
          mode: input.mode,
          support: input.support,
          paws: input.paws?.map((p) => ({ x: p.x, y: p.y })),
          route: input.navigationRoute,
          occupancy: { ...input.occupancy },
          energy: input.energy,
        }),
      200,
    );
    return () => {
      clearInterval(timer);
      input.debugPose = 'auto';
    };
  }, [input]);
  const point = (p) => `${p.x * 40},${-p.y * 40}`;
  return (
    <>
      {show && (
        <svg
          className="pet3d-debug-map"
          width={layout.view.width}
          height={layout.view.height}
          aria-hidden="true"
        >
          {layout.surfaces.map((s) => (
            <line
              key={s.id}
              x1={s.left * 40}
              x2={s.right * 40}
              y1={-s.top * 40}
              y2={-s.top * 40}
              stroke={snapshot.support?.id === s.id ? '#ffdc66' : '#65e7cb'}
              strokeWidth={snapshot.support?.id === s.id ? 2 : 1}
              opacity=".65"
            />
          ))}
          {layout.boxes
            .filter((b) => b.kind === 'wall')
            .map((b) => (
              <rect
                key={b.id}
                x={b.left * 40}
                y={-b.top * 40}
                width={Math.max(1, (b.right - b.left) * 40)}
                height={(b.top - b.bottom) * 40}
                fill="#dca5ff"
                opacity=".3"
              />
            ))}
          {snapshot.paws?.map((p, i) => (
            <circle key={i} cx={p.x * 40} cy={-p.y * 40} r="2" fill="#ff7fa8" />
          ))}
          {snapshot.route?.length > 0 && (
            <polyline
              points={[input.catPosition, ...snapshot.route.map((r) => ({ x: r.x, y: r.y }))]
                .map(point)
                .join(' ')}
              fill="none"
              stroke="#ffba62"
              strokeDasharray="4 4"
            />
          )}
        </svg>
      )}
      <details className="pet3d-inspector" open>
        <summary>Cat motion lab · development</summary>
        <label>
          Pose{' '}
          <select
            aria-label="Preview cat pose"
            defaultValue="auto"
            onChange={(e) => {
              input.debugPose = e.target.value;
              input.debugTime = null;
              input.command = 'release';
            }}
          >
            {POSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Scrub{' '}
          <input
            aria-label="Cat pose time"
            type="range"
            min="0"
            max="8"
            step=".02"
            defaultValue="0"
            onChange={(e) => {
              input.debugTime = +e.target.value;
            }}
          />
        </label>
        <label>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />{' '}
          Surface and paw overlays
        </label>
        <label>
          Travel to{' '}
          <select
            aria-label="Cat destination"
            defaultValue=""
            onChange={(e) => {
              input.debugPose = 'auto';
              input.debugDestination = e.target.value;
            }}
          >
            <option value="">Choose a surface</option>
            {layout.surfaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.kind} · {s.id} · {Math.round(-s.top * 40)}px
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            input.debugPose = 'auto';
            input.command = 'nap';
          }}
        >
          Preview natural nap
        </button>
        <output>
          {snapshot.mode} · support {snapshot.support?.id || 'air'} · energy{' '}
          {snapshot.energy?.toFixed(2)}
        </output>
        <pre>{JSON.stringify(snapshot.occupancy, null, 1)}</pre>
      </details>
    </>
  );
}
