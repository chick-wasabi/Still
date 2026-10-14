import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKey } from '../data';
export default function Calendar({ month, setMonth, notes, openDate }) {
  const year = month.getFullYear(),
    currentMonth = month.getMonth();
  const offset = (new Date(year, currentMonth, 1).getDay() + 6) % 7;
  const total = new Date(year, currentMonth + 1, 0).getDate();
  const entries = useMemo(() => {
    const map = new Map();
    for (const note of notes) if (note.date && !map.has(note.date)) map.set(note.date, note);
    return map;
  }, [notes]);
  return (
    <section className="panel calendar-panel" aria-label="Journal calendar">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE A MOMENT</span>
          <h3>Your days, at a glance.</h3>
        </div>
        <span className="soft-label">Select a day. Start anywhere.</span>
      </div>
      <div className="calendar-controls">
        <h2 aria-live="polite">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <div>
          <button
            aria-label="Previous month"
            className="icon-button"
            onClick={() => setMonth(new Date(year, currentMonth - 1, 1))}
          >
            <ChevronLeft size={19} />
          </button>
          <button className="today-button" onClick={() => setMonth(new Date())}>
            Today
          </button>
          <button
            aria-label="Next month"
            className="icon-button"
            onClick={() => setMonth(new Date(year, currentMonth + 1, 1))}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
          <div className="weekday" key={day}>
            {day}
          </div>
        ))}
        {Array.from({ length: Math.ceil((offset + total) / 7) * 7 }, (_, index) => {
          const date = new Date(year, currentMonth, index - offset + 1),
            key = dateKey(date),
            entry = entries.get(key);
          return (
            <button
              key={key}
              aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${entry ? `: ${entry.title}` : ': Add entry'}`}
              aria-current={key === dateKey() ? 'date' : undefined}
              className={`calendar-day ${date.getMonth() !== currentMonth ? 'outside' : ''} ${key === dateKey() ? 'current-day' : ''}`}
              onClick={() => openDate(key)}
            >
              <span className="day-number">{date.getDate()}</span>
              {entry && (
                <>
                  <span className="day-emoji">{entry.emoji}</span>
                  <span className="entry-dot" />
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="entry-dot" />
          Journal entry
        </span>
        <span>
          <i className="today-dot" />
          Today
        </span>
        <small>Your pace. Your practice.</small>
      </div>
    </section>
  );
}
