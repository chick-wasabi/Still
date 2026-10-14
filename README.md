# Still — Your personal workspace

A responsive React workspace for journaling, tasks, and daily habits. Built with Vite, Tailwind CSS, Lucide React, and Framer Motion.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci --cache /tmp/still-npm-cache
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` directory to any static host. No server credentials are required.

## Features

- Monthly journal calendar with dated entries, undated scratchpad notes, mood tags, emoji icons, and a Markdown-style editing toolbar.
- Search notes and tasks with the sidebar search or Cmd/Ctrl+K.
- Nested collections with create, rename, emoji customization, delete, and drag ordering. Drag notes between collections or onto another note to reorder them. Folder controls appear on hover; notes can also be moved using the editor's folder selector.
- Task board and list with priorities, due dates, edit dialogs, completion toggles, status selectors, and desktop drag-and-drop.
- Weekly habits with completion toggles, previous-week navigation, and current streaks. Future days cannot be checked.
- Responsive sidebar, keyboard-accessible dialogs, Escape to close, focus trapping, and reduced-motion CSS support.

## Data

Data is stored in this browser's localStorage, under keys prefixed `still-`. Initial examples appear on first use. This version is a single-device application: it has no account authentication, cloud synchronization, server backup, or multi-user access. Clearing browser storage removes your changes. Journal edits are saved explicitly with **Save entry**.

## Structure

`src/components/` contains Sidebar, JournalView, Calendar, Editor, Modal, TaskView, and HabitTracker. `src/data.js` contains initial examples, date helpers, and persistence. `src/styles.css` contains the Tailwind import and responsive visual styles.

## Validation

Production build passed. Headless Chromium smoke checks exercised entry creation and persistence after reload, task creation and completion in board/list views, habit creation and completion, and mobile overflow at 390px. No JavaScript runtime errors were observed.
