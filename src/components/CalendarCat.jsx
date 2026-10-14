import React from 'react';
export default function CalendarCat() {
  return (
    <div className="calendar-cat-track" aria-hidden="true">
      <div className="calendar-cat">
        <svg viewBox="0 0 90 55" width="65" height="40">
          <g fill="#caa981">
            <ellipse cx="42" cy="30" rx="22" ry="12" />
            <circle cx="65" cy="22" r="12" />
            <path d="M55 15 54 3 65 12 72 4 76 20" />
            <path className="cat-tail" d="M22 29Q2 27 8 10Q13 5 12 15Q11 22 25 21" />
            <rect className="cat-leg leg-one" x="24" y="33" width="8" height="17" rx="4" />
            <rect className="cat-leg leg-two" x="49" y="33" width="8" height="17" rx="4" />
          </g>
          <path d="M67 26 70 27 68 29" fill="#624d42" />
          <circle cx="70" cy="21" r="1.6" fill="#222d2b" />
          <path d="M65 30 76 29 M65 32 77 34" stroke="#f2ddbb" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
