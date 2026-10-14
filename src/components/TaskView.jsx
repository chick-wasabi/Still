import useToday from '../hooks/useToday';
import React, { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Check,
  CalendarDays,
  Trash2,
  Repeat2,
  Sun,
  ArrowRight,
  MoreHorizontal,
  GripHorizontal,
} from 'lucide-react';
import { dateKey, taskSection, taskComplete } from '../data';
import Modal from './Modal';
const SECTIONS = [
  { id: 'today', name: 'Today’s Main Tasks', icon: Sun, empty: 'A little room for what matters.' },
  {
    id: 'daily',
    name: 'Daily Repeatable Tasks',
    icon: Repeat2,
    empty: 'Make space for a daily rhythm.',
  },
  {
    id: 'upcoming',
    name: 'Upcoming Due Dates',
    icon: CalendarDays,
    empty: 'Nothing on the horizon just yet.',
  },
];
function tomorrow() {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  return dateKey(day);
}
export default function TaskView({ tasks, setTasks }) {
  const [text, setText] = useState(''),
    [section, setSection] = useState('today'),
    [due, setDue] = useState(tomorrow),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [dragTarget, setDragTarget] = useState(null),
    [datesOpen, setDatesOpen] = useState([]);
  const compose = useRef(null);
  const today = useToday();
  const groups = useMemo(
    () =>
      Object.fromEntries(
        SECTIONS.map((group) => [
          group.id,
          tasks
            .filter((task) => taskSection(task, today) === group.id)
            .sort((a, b) => (group.id === 'upcoming' ? a.due.localeCompare(b.due) : 0)),
        ]),
      ),
    [tasks, today],
  );
  function add(event) {
    event.preventDefault();
    if (!text.trim()) return;
    if (section === 'upcoming' && (!due || due <= today)) {
      compose.current?.form?.reportValidity();
      return;
    }
    const task = {
      id: crypto.randomUUID(),
      title: text.trim(),
      description: '',
      priority: '',
      status: 'To Do',
      due: section === 'upcoming' ? due : '',
      repeat: section === 'daily',
      completedDates: [],
    };
    setTasks((current) => [...current, task]);
    setText('');
    compose.current?.focus();
  }
  function focus(id = 'today') {
    setSection(id);
    compose.current?.focus();
  }
  function toggle(task) {
    setTasks((current) =>
      current.map((item) =>
        item.id !== task.id
          ? item
          : item.repeat
            ? {
                ...item,
                completedDates: taskComplete(item, today)
                  ? item.completedDates.filter((day) => day !== today)
                  : [...(item.completedDates || []), today],
              }
            : { ...item, status: taskComplete(item, today) ? 'To Do' : 'Done' },
      ),
    );
  }
  function move(id, target) {
    setTasks((current) =>
      current.map((task) =>
        task.id !== id
          ? task
          : {
              ...task,
              repeat: target === 'daily',
              due: target === 'upcoming' ? (task.due > today ? task.due : tomorrow()) : '',
              status: target === 'daily' ? 'To Do' : task.status,
            },
      ),
    );
  }
  function saveEdit(event) {
    event.preventDefault();
    if (!editing.title.trim()) return;
    setTasks((current) =>
      current.map((task) =>
        task.id === editing.id ? { ...task, title: editing.title.trim() } : task,
      ),
    );
    setEditing(null);
  }
  return (
    <>
      <div className="task-page-header">
        <div className="eyebrow">
          <span />A CLEARER DAY
        </div>
        <h1>Your tasks.</h1>
        <div className="task-header-actions">
          <button className="primary-button" onClick={() => focus()}>
            <Plus size={18} />
            New task
          </button>
          <span>
            {tasks.filter((task) => taskComplete(task, today)).length} of {tasks.length} done today
          </span>
        </div>
      </div>
      <form className="task-composer" onSubmit={add}>
        <label className="sr-only" htmlFor="quick-task">
          New task
        </label>
        <textarea
          id="quick-task"
          ref={compose}
          rows={2}
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          placeholder="Get it out of your head. What’s on your mind?"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              add(event);
            }
          }}
        />
        <div className="task-composer-footer">
          <select
            aria-label="New task section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
          >
            {SECTIONS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {section === 'upcoming' && (
            <label className="quick-date">
              <CalendarDays size={15} />
              <input
                aria-label="New task due date"
                type="date"
                min={tomorrow()}
                required
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </label>
          )}
          <button
            className="task-add-button"
            type="submit"
            disabled={!text.trim()}
            aria-label="Add task"
          >
            <ArrowRight size={19} />
          </button>
        </div>
      </form>
      <div className="notepad-sections">
        {SECTIONS.map(({ id, name, icon: Icon, empty }) => (
          <section
            key={id}
            aria-label={name}
            className={`notepad-section notepad-${id} ${dragTarget === id ? 'drop-active' : ''}`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('task')) {
                event.preventDefault();
                setDragTarget(id);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDragTarget(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              move(event.dataTransfer.getData('task'), id);
              setDragTarget(null);
            }}
          >
            <div className="notepad-section-heading">
              <Icon size={18} />
              <h2>{name}</h2>
              <span>{groups[id].length}</span>
              <button
                className="tiny-button"
                aria-label={`Add task to ${name}`}
                onClick={() => focus(id)}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="sticky-stack">
              {groups[id].map((task) => (
                <article
                  key={task.id}
                  className={`sticky-task ${taskComplete(task, today) ? 'is-complete' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('task', task.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragTarget(null)}
                >
                  <span
                    draggable
                    className="task-drag-handle"
                    title="Drag to another section"
                    aria-hidden="true"
                  >
                    <GripHorizontal size={18} />
                  </span>
                  <div className="sticky-task-top">
                    <button
                      className={`checkbox ${taskComplete(task, today) ? 'checked' : ''}`}
                      aria-label={`Mark ${task.title} ${taskComplete(task, today) ? 'incomplete' : 'complete'}`}
                      aria-pressed={taskComplete(task, today)}
                      onClick={() => toggle(task)}
                    >
                      {taskComplete(task, today) && <Check size={15} />}
                    </button>
                    {editing?.id === task.id ? (
                      <form className="sticky-edit" onSubmit={saveEdit}>
                        <textarea
                          autoFocus
                          aria-label="Edit task text"
                          value={editing.title}
                          maxLength={1000}
                          onChange={(event) =>
                            setEditing({ ...editing, title: event.target.value })
                          }
                        />
                        <div>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                          <button className="text-button" type="submit">
                            Save
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="sticky-title"
                        onClick={() => setEditing({ id: task.id, title: task.title })}
                      >
                        {task.title}
                      </button>
                    )}
                    <button
                      className="tiny-button danger"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => setDeleting(task)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="sticky-task-meta">
                    {task.repeat ? (
                      <span className="daily-reset">
                        <Repeat2 size={13} />
                        Resets each day
                      </span>
                    ) : task.due || datesOpen.includes(task.id) ? (
                      <label className="task-date-label">
                        <CalendarDays size={13} />
                        <input
                          aria-label={`Due date of ${task.title}`}
                          type="date"
                          value={task.due}
                          onChange={(event) =>
                            setTasks((current) =>
                              current.map((item) =>
                                item.id === task.id ? { ...item, due: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : (
                      <button
                        className="optional-date"
                        aria-label={`Add due date to ${task.title}`}
                        onClick={() => setDatesOpen((current) => [...current, task.id])}
                      >
                        <CalendarDays size={13} />
                        Add date
                      </button>
                    )}
                    <details className="task-options">
                      <summary aria-label={`Options for ${task.title}`}>
                        <MoreHorizontal size={18} />
                      </summary>
                      <div className="task-options-menu">
                        <label>
                          Move to
                          <select
                            aria-label={`Section of ${task.title}`}
                            value={id}
                            onChange={(event) => move(task.id, event.target.value)}
                          >
                            {SECTIONS.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!task.repeat && (
                          <label>
                            Status
                            <select
                              aria-label={`Status of ${task.title}`}
                              value={task.status}
                              onChange={(event) =>
                                setTasks((current) =>
                                  current.map((item) =>
                                    item.id === task.id
                                      ? { ...item, status: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {['To Do', 'In Progress', 'Done'].map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
              {!groups[id].length && (
                <div className="notepad-empty">
                  <span>✧</span>
                  <p>{empty}</p>
                </div>
              )}
            </div>
            <button className="notepad-add" onClick={() => focus(id)}>
              <Plus size={15} />
              Add a thought to do
            </button>
          </section>
        ))}
      </div>
      {deleting && (
        <Modal title="Delete task?" onClose={() => setDeleting(null)}>
          <div className="form-content">
            <p>“{deleting.title}” will be removed.</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>
                Keep task
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  setTasks((current) => current.filter((task) => task.id !== deleting.id));
                  setDeleting(null);
                }}
              >
                Delete task
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
