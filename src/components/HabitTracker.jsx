import useToday from '../hooks/useToday';
import React, { useState } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  Flame,
  Trash2,
  Sprout,
  Pencil,
} from 'lucide-react';
import { dateKey, currentStreak } from '../data';
import Modal from './Modal';
import EmptyState from './EmptyState';
import EmojiPicker from './EmojiPicker';
export default function HabitTracker({ habits, setHabits }) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return day;
  });
  const today = useToday();
  function toggle(id, key) {
    setHabits((current) =>
      current.map((habit) =>
        habit.id === id
          ? {
              ...habit,
              days: habit.days.includes(key)
                ? habit.days.filter((day) => day !== key)
                : [...habit.days, key],
            }
          : habit,
      ),
    );
  }
  function add() {
    setEditing({ id: crypto.randomUUID(), name: '', emoji: '🌱', days: [] });
  }
  function save(event) {
    event.preventDefault();
    if (!editing.name.trim()) return;
    const habit = { ...editing, name: editing.name.trim(), emoji: editing.emoji || '🌱' };
    setHabits((current) =>
      current.some((item) => item.id === habit.id)
        ? current.map((item) => (item.id === habit.id ? habit : item))
        : [...current, habit],
    );
    setEditing(null);
  }
  return (
    <>
      <div className="habit-page-header">
        <h1>Habits.</h1>
        <button className="primary-button" onClick={add}>
          <Plus size={19} />
          New habit
        </button>
      </div>
      {!habits.length ? (
        <div className="panel">
          <EmptyState
            icon={Sprout}
            title="Your first habit starts here."
            description="Add a habit to start tracking your week."
            action="Add your first habit"
            onAction={add}
          />
        </div>
      ) : (
        <>
          <section className="panel habit-panel">
            <div className="calendar-controls">
              <h2>
                {days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
                {days[6].toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h2>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous week"
                  onClick={() => setOffset(offset - 1)}
                >
                  <ChevronLeft size={19} />
                </button>
                <button className="today-button" onClick={() => setOffset(0)}>
                  This week
                </button>
                <button
                  className="icon-button"
                  aria-label="Next week"
                  onClick={() => setOffset(offset + 1)}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
            <div
              className="habit-scroll"
              tabIndex={0}
              role="region"
              aria-label="Weekly habit completion grid, scroll horizontally for all days"
            >
              <table className="habit-matrix">
                <thead>
                  <tr>
                    <th scope="col">Your habits</th>
                    {days.map((day) => (
                      <th
                        scope="col"
                        key={dateKey(day)}
                        className={dateKey(day) === today ? 'today-column' : ''}
                      >
                        <small>{day.toLocaleDateString(undefined, { weekday: 'short' })}</small>
                        <b>{day.getDate()}</b>
                      </th>
                    ))}
                    <th scope="col">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {habits.map((habit) => (
                    <tr key={habit.id}>
                      <th scope="row">
                        <div className="habit-name">
                          <span>{habit.emoji}</span>
                          <button
                            aria-label={`Edit ${habit.name}`}
                            onClick={() => setEditing({ ...habit })}
                          >
                            {habit.name}
                            <Pencil size={13} />
                          </button>
                          <button
                            className="tiny-button danger"
                            aria-label={`Delete ${habit.name}`}
                            onClick={() => setDeleting(habit)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </th>
                      {days.map((day) => (
                        <td key={dateKey(day)}>
                          <button
                            disabled={dateKey(day) > today}
                            className={`habit-check ${habit.days.includes(dateKey(day)) ? 'checked' : ''}`}
                            aria-label={`${habit.name}, ${dateKey(day)}`}
                            aria-pressed={habit.days.includes(dateKey(day))}
                            onClick={() => toggle(habit.id, dateKey(day))}
                          >
                            {habit.days.includes(dateKey(day)) ? (
                              <Check size={19} />
                            ) : (
                              <span>·</span>
                            )}
                          </button>
                        </td>
                      ))}
                      <td>
                        <span
                          className="streak"
                          aria-label={`${currentStreak(habit.days)} day current streak`}
                        >
                          <Flame size={17} />
                          {currentStreak(habit.days)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {editing && (
        <Modal
          title={
            habits.some((habit) => habit.id === editing.id)
              ? 'Edit your ritual'
              : 'Plant a new habit'
          }
          onClose={() => setEditing(null)}
        >
          <form className="form-content" onSubmit={save}>
            <div className="collection-icon-field">
              <EmojiPicker
                value={editing.emoji}
                onChange={(emoji) => setEditing({ ...editing, emoji })}
              />
              <p>Choose an icon for your ritual.</p>
            </div>
            <label>
              Your daily ritual
              <input
                autoFocus
                required
                maxLength={100}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                placeholder="What would you like to make time for?"
              />
            </label>
            <button className="primary-button" type="submit">
              <Check size={17} />
              Save habit
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this habit?" onClose={() => setDeleting(null)}>
          <div className="form-content">
            <p>“{deleting.name}” and its completion history will be removed.</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>
                Keep habit
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  setHabits((current) => current.filter((habit) => habit.id !== deleting.id));
                  setDeleting(null);
                }}
              >
                Remove habit
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
