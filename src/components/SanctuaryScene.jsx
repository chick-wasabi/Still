import React, { memo, useEffect } from 'react';
function Pine({ x, y, height, shade }) {
  const width = height * 0.42;
  return (
    <g transform={`translate(${x} ${y})`} fill={shade}>
      <path
        d={`M -${width * 0.07} 0 L -${width * 0.025} -${height} L ${width * 0.025} -${height} L ${width * 0.08} 0 Z`}
      />
      {[0.82, 0.65, 0.46, 0.26].map((level, index) => (
        <path
          key={level}
          d={`M 0 -${height * (level + 0.18)} L ${width * (0.44 + index * 0.18)} -${height * (level - 0.13)} Q 0 -${height * (level - 0.21)} -${width * (0.44 + index * 0.18)} -${height * (level - 0.13)} Z`}
        />
      ))}
    </g>
  );
}
export default memo(function SanctuaryScene({ night = false }) {
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('ambient-paused', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return (
    <div className={`sanctuary-scene ${night ? 'forest-night' : 'golden-day'}`} aria-hidden="true">
      <div className="ambient-orb" />
      <svg viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={night ? 'sky-night' : 'sky-day'} x2="0" y2="1">
            <stop stopColor={night ? '#122d2b' : '#343525'} />
            <stop offset=".5" stopColor={night ? '#243d31' : '#56503a'} />
            <stop offset="1" stopColor="#101c23" />
          </linearGradient>
          <radialGradient id={night ? 'light-night' : 'light-day'}>
            <stop stopColor="#f8dfa3" stopOpacity={night ? '.36' : '.65'} />
            <stop offset="1" stopColor="#e9bc6e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="1100" fill={`url(#${night ? 'sky-night' : 'sky-day'})`} />
        <ellipse
          className="forest-sun"
          cx="1090"
          cy="300"
          rx="440"
          ry="440"
          fill={`url(#${night ? 'light-night' : 'light-day'})`}
        />
        <path fill="#4d6250" opacity=".3" d="M0 540 Q300 320 600 560 T1600 400 V1100 H0Z" />
        <path fill="#263e34" opacity=".7" d="M0 650 Q350 510 750 690 T1600 500 V1100 H0Z" />
        {Array.from({ length: 25 }, (_, index) => (
          <Pine
            key={index}
            x={index * 76 - 100}
            y={800 + (index % 3) * 35}
            height={220 + ((index * 47) % 220)}
            shade={index % 2 ? '#2b473a' : '#314b3c'}
          />
        ))}
        <path
          d="M 830 1150 Q 1040 900 890 760 Q1030 720 1000 680 Q 1100 730 970 800 Q 1100 930 1100 1150"
          fill="#c3a875"
          opacity=".13"
        />
        {Array.from({ length: 12 }, (_, index) => (
          <Pine
            key={index}
            x={index < 6 ? index * 100 - 150 : 1150 + (index - 6) * 120}
            y={1150 + (index % 2) * 30}
            height={660 + ((index * 59) % 260)}
            shade={index % 2 ? '#122a26' : '#0d2422'}
          />
        ))}
        <path
          d="M0 1100 V970 Q250 865 450 1010 Q800 1120 1150 980 Q1420 890 1600 940 V1100"
          fill="#0e2021"
        />
      </svg>
      <div className="forest-haze" />
      {Array.from({ length: 8 }, (_, index) => (
        <i
          key={index}
          className="ambient-mote"
          style={{
            '--x': `${11 + index * 12}%`,
            '--delay': `${index * -3.7}s`,
            '--duration': `${17 + index * 2}s`,
          }}
        />
      ))}
    </div>
  );
});
