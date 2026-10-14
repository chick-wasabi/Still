# Still

A calm, private personal workspace for your journal, tasks, and daily rituals. Built with React 19, Vite, Tailwind CSS, Lucide React, and Framer Motion.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci --cache /tmp/still-npm-cache
npm run dev
```

The workspace begins empty: no demo entries, tasks, habits, collections, or invented identity. Use **Settings** (the profile or avatar button) to add your name and choose an avatar.

## Build and validate

```sh
npm run build
npm run preview
npm test
npm run test:e2e
npm run format:check
```

Deploy `dist/` to a static host using HTTPS. No server credentials or database are required. End-to-end tests use the installed `/usr/bin/chromium` when available. Otherwise run `npx playwright install chromium`, or set `CHROMIUM_PATH` to your Chromium executable. The test runner starts Vite automatically. Unit tests use Node’s built-in test runner.

## Your workspace

- **Journal:** Select a calendar date or choose **New entry**. Use **Quick thought** for an undated scratchpad. The editor supports bold, italic, lists, fenced code, Markdown preview, emoji, mood, and collection selection. Cmd/Ctrl+B and Cmd/Ctrl+I format selected text. Save explicitly with **Save entry**; closing a changed editor asks before discarding.
- **Collections:** Create collections and subcollections using the sidebar. The options menu edits names, emoji, and parents, and provides keyboard/touch-friendly ordering. Parent selection prevents cycles. Drag a collection onto another to place it before that collection at the same level; use the parent selector to nest. Drag notes into collections or onto another note to reorder them. Parent views include descendant entries. Deleting a collection preserves its notes and subcollections by moving them up one level.
- **Tasks:** Switch between board and list layouts. Tasks have priority, due date, notes, a completion toggle, and a status menu. Drag cards between board columns, or use the status selector on any device. Click a task title to edit it. Destructive actions require confirmation.
- **Habits:** Create and edit custom rituals and emojis. Check off any elapsed day in the weekly grid. Future days are disabled. Navigate to earlier weeks to backfill completions. Current streaks span consecutive dates ending today or yesterday; a gap resets the streak. The weekly percentage excludes future days.
- **Search:** Search journal text and tasks using the sidebar or Cmd/Ctrl+K.
- **Accessibility:** Dialogs trap focus, make background content inert, restore focus, and close with Escape. All views support reduced motion, keyboard navigation, responsive layouts, and readable body typography. On narrow screens, the habit table scrolls within its panel.

## Local persistence and privacy

Workspace data is saved to `localStorage` under `still-workspace-v2`. It stays in this browser and origin. This is a single-device application, without account authentication, server backups, cloud synchronization, or multi-user permissions. Clearing site data removes the workspace. Storage failures show an error and a retry action; corrupt data is preserved and reported rather than silently overwritten.

Settings includes an optional **6–12 digit PIN**. When enabled, all saved workspace content (including profile and collection names) is encrypted using AES-256-GCM. A random salt and PBKDF2-HMAC-SHA-256 with 600,000 iterations derive a non-extractable key. Every encryption uses a fresh random IV. The PIN and the derived key are never written to storage. The active key is held in memory while unlocked.

The lock screen appears on reload/startup. Use **Lock workspace** to lock immediately; locking flushes saved changes before clearing the active workspace and key. PIN changes re-encrypt existing content. Turning protection off stores plaintext again. Enabling protection in one tab locks other open tabs; encrypted changes in one tab also lock other tabs to prevent stale writes. Legacy plaintext keys are removed after the new workspace is successfully saved.

PIN protection requires HTTPS or localhost. It protects data at rest, not an already unlocked session or a compromised browser/device. Numeric PINs have limited entropy; choose a longer one. There is **no forgotten-PIN recovery**. Keep a separate private backup of irreplaceable writing. Wait for the saved/encrypted status before closing after a change.

The v1 migration removes recognizable examples, preserves authored or edited content and needed collection parents, and runs once after a successful save.

## Architecture

```text
src/
  App.jsx                     Workspace composition, navigation, search
  data.js                     Empty defaults, migration, dates, folder and streak logic
  hooks/useWorkspace.js       Persistence, save status, cross-tab changes, lock lifecycle
  lib/vault.js                Web Crypto encryption and workspace validation
  lib/legacy.js               Fingerprints for retiring v1 examples
  components/
    Sidebar.jsx               Collection tree, ordering, collection dialogs
    JournalView.jsx           Journal views and empty states
    Calendar.jsx              Month navigation and dated entries
    Editor.jsx                Markdown-style editor and save lifecycle
    MarkdownPreview.jsx       Lazy-loaded Markdown renderer
    TaskView.jsx              Board/list, task dialogs, drag/state transitions
    HabitTracker.jsx          Weekly grid, editing, completion and streaks
    Settings.jsx              Profile and PIN settings
    LockScreen.jsx            Startup/manual unlock
    EmojiPicker.jsx           Shared emoji picker
    Modal.jsx                 Shared accessible dialog and focus handling
    EmptyState.jsx            Shared first-use experiences
    ErrorBoundary.jsx         Unexpected rendering error recovery
  styles.css                  Design tokens and responsive styles
```

Only opacity and small transform animations run during navigation/dialog opening; reduced-motion preferences are respected. The Markdown renderer loads on demand. Crypto key derivation occurs only on PIN setup/change/unlock, and storage encryption uses the active in-memory key. Functional updates prevent stale task, habit, and collection state.

## Regression coverage

Unit tests cover blank defaults, date-boundary streaks, folder cycles, migration, malformed data, encryption round-trips, unique IVs, wrong PINs, and ciphertext tampering. Chromium tests cover clean states, profile/avatar persistence, editor/calendar/search, nested collections and drag moves, task board/list updates, habits, the full PIN lifecycle, encrypted edits, cross-tab protection, storage errors/retry, corrupt data, mobile overflow, focus containment, and reduced motion.
