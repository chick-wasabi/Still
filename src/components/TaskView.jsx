import React, { useMemo, useState } from 'react';
import {
  Plus,
  Columns3,
  List,
  Check,
  CalendarDays,
  Trash2,
  ArrowRight,
  CheckSquare,
} from 'lucide-react';
import Modal from './Modal';
import EmptyState from './EmptyState';
import { dateKey } from '../data';
const STATUSES = ['To Do', 'In Progress', 'Done'];
export default function TaskView({ tasks, setTasks }) {
  const [layout, setLayout] = useState('board');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [dragging, setDragging] = useState(null);
  const groups = useMemo(
    () =>
      Object.fromEntries(
        STATUSES.map((status) => [status, tasks.filter((task) => task.status === status)]),
      ),
    [tasks],
  );
  const complete = groups.Done.length;
  function add(status = 'To Do') {
    setEditing({
      id: crypto.randomUUID(),
      title: '',
      description: '',
      priority: 'Medium',
      status,
      due: '',
    });
  }
  function save(event) {
    event.preventDefault();
    if (!editing.title.trim()) return;
    const task = { ...editing, title: editing.title.trim() };
    setTasks((current) =>
      current.some((item) => item.id === task.id)
        ? current.map((item) => (item.id === task.id ? task : item))
        : [...current, task],
    );
    setEditing(null);
  }
  function move(id, status) {
    if (STATUSES.includes(status))
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, status } : task)));
  }
  function card(task) {
    return (
      <article
        key={task.id}
        className={`task-card ${dragging === task.id ? 'dragging' : ''}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('task', task.id);
          event.dataTransfer.effectAllowed = 'move';
          setDragging(task.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDragTarget(null);
        }}
      >
        <div className="task-card-top">
          <span className={`priority ${task.priority.toLowerCase()}`}>
            <i />
            {task.priority}
          </span>
          <button
            aria-label={`Delete ${task.title}`}
            className="tiny-button danger"
            onClick={() => setDeleting(task)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="task-title">
          <button
            aria-label={`Mark ${task.title} ${task.status === 'Done' ? 'incomplete' : 'complete'}`}
            aria-pressed={task.status === 'Done'}
            className={`checkbox ${task.status === 'Done' ? 'checked' : ''}`}
            onClick={() => move(task.id, task.status === 'Done' ? 'To Do' : 'Done')}
          >
            {task.status === 'Done' && <Check size={15} />}
          </button>
          <button
            className={task.status === 'Done' ? 'completed' : ''}
            onClick={() => setEditing({ ...task })}
          >
            {task.title}
          </button>
        </div>
        {task.description && <p>{task.description}</p>}
        <footer>
          <span
            className={task.due && task.due < dateKey() && task.status !== 'Done' ? 'overdue' : ''}
          >
            <CalendarDays size={15} />
            {task.due
              ? new Date(`${task.due}T12:00:00`).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'No due date'}
          </span>
          <select
            aria-label={`Status of ${task.title}`}
            value={task.status}
            onChange={(event) => move(task.id, event.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </footer>
      </article>
    );
  }
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">
          <span />
          FOCUS ON WHAT MATTERS
        </div>
        <h1>
          One thing at a time.<span className="intro-sparkle">✦</span>
        </h1>
        <p>Turn your intentions into small, meaningful steps.</p>
      </div>
      <div className="journal-heading">
        <div>
          <h2>Your tasks</h2>
          <p>
            {tasks.length
              ? `${complete} of ${tasks.length} complete. Progress, at your own pace.`
              : 'A clear mind starts with a clear plan.'}
          </p>
        </div>
        <button className="primary-button" onClick={() => add()}>
          <Plus size={19} />
          New task
        </button>
      </div>
      {tasks.length > 0 && (
        <div
          className="task-progress"
          role="progressbar"
          aria-label="Completed tasks"
          aria-valuenow={complete}
          aria-valuemin={0}
          aria-valuemax={tasks.length}
        >
          <div style={{ transform: `scaleX(${complete / tasks.length})` }} />
        </div>
      )}
      <div className="task-view-controls">
        <div className="segmented">
          <button
            className={layout === 'board' ? 'selected' : ''}
            aria-pressed={layout === 'board'}
            onClick={() => setLayout('board')}
          >
            <Columns3 size={18} />
            Board
          </button>
          <button
            className={layout === 'list' ? 'selected' : ''}
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List size={19} />
            List
          </button>
        </div>
        <span className="soft-label">Drag to move, or use a task’s status menu.</span>
      </div>
      {!tasks.length ? (
        <div className="panel">
          <EmptyState
            icon={CheckSquare}
            title="Make room for your next step."
            description="Big ideas start small. Add your first task and give it a little direction."
            action="Create your first task"
            onAction={() => add()}
          />
        </div>
      ) : layout === 'board' ? (
        <div className="kanban">
          {STATUSES.map((status, index) => (
            <section
              key={status}
              aria-label={`${status} column`}
              className={`kanban-column ${dragTarget === status ? 'drop-active' : ''}`}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('task')) {
                  event.preventDefault();
                  setDragTarget(status);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDragTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                move(event.dataTransfer.getData('task'), status);
                setDragTarget(null);
                setDragging(null);
              }}
            >
              <h3>
                <i className={`status-dot status-${index}`} />
                {status}
                <span>{groups[status].length}</span>
                <button
                  aria-label={`Add task to ${status}`}
                  className="tiny-button"
                  onClick={() => add(status)}
                >
                  <Plus size={18} />
                </button>
              </h3>
              {groups[status].map(card)}
              {!groups[status].length && (
                <div className="column-empty">A little breathing room.</div>
              )}
              <button className="add-task" onClick={() => add(status)}>
                <Plus size={17} />
                Add a task
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="task-list">{tasks.map(card)}</div>
      )}
      {editing && (
        <Modal
          title={tasks.some((task) => task.id === editing.id) ? 'Edit task' : 'A new intention'}
          onClose={() => setEditing(null)}
        >
          <form className="form-content" onSubmit={save}>
            <label>
              Task name
              <input
                autoFocus
                required
                maxLength={200}
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                placeholder="What would you like to do?"
              />
            </label>
            <label>
              A little context
              <textarea
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                placeholder="Notes, details, or a gentle reminder…"
              />
            </label>
            <div className="form-row">
              <label>
                Priority
                <select
                  aria-label="Priority"
                  value={editing.priority}
                  onChange={(event) => setEditing({ ...editing, priority: event.target.value })}
                >
                  {['High', 'Medium', 'Low'].map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={editing.due}
                  onChange={(event) => setEditing({ ...editing, due: event.target.value })}
                />
              </label>
            </div>
            <label>
              Status
              <select
                aria-label="Status"
                value={editing.status}
                onChange={(event) => setEditing({ ...editing, status: event.target.value })}
              >
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              Save task
              <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete task?" onClose={() => setDeleting(null)}>
          <div className="form-content">
            <p>“{deleting.title}” will be permanently removed.</p>
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
