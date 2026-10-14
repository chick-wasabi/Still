# Still — a personal sanctuary

A private React/Vite workspace with an illustrated forest lock screen, warm ambient light, independent Personal and Work spaces, a journal, an instant notepad for tasks, and a weekly habit grid. Built with Tailwind CSS, Lucide React, and Framer Motion.

## Run and validate

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci --cache /tmp/still-npm-cache
npm run dev
npm run build
npm run preview
npm test
npm run test:e2e
npm run format:check
```

Deploy `dist/` to a static host using HTTPS. There is no backend, email integration, account service, or cloud synchronization. End-to-end tests use `/usr/bin/chromium` if installed; otherwise run `npx playwright install chromium` or set `CHROMIUM_PATH`.

## A space for each part of life

Use the sidebar workspace switcher to move between **Personal** and **Work**. Journal entries, drafts, tasks, habit histories, collections, and subcollections are isolated. The selected workspace survives reloads. Profile and PIN protection are shared across the sanctuary. Both spaces start empty.

Existing single-workspace data is moved into Personal after a successful unlock. Nothing is reset or pushed to a server. Older demo records are removed by the existing fingerprint-based migration, while authored content is preserved.

## Journal

Choose any calendar day, **New entry**, or **Quick thought** for an undated note. The editor opens centered with room on both sides. Titles, emoji, mood, and collection are optional; even blank entries can be saved. Use the expanded emoji picker, or choose **None**.

The editor supports Markdown formatting, keyboard shortcuts (Cmd/Ctrl+B and Cmd/Ctrl+I), and an on-demand preview. Draft changes save automatically after a short idle period. After a reload/unlock, resume them from the journal’s draft tray. **Save entry** publishes the draft into your local entry list. Closing a changed editor asks before discarding its draft. Wait for the saved/encrypted status before leaving; clearing browser data deletes everything on this origin.

Create and edit nested collections in the sidebar. Parent selection prevents cycles. Collection menus provide ordering controls; drag collections to reorder or move between levels. Drag notes into a collection or onto another note to reorder them. Deleting a collection keeps its notes and subcollections, moving them to its parent. Search entries, drafts, and tasks with Cmd/Ctrl+K.

## Tasks

Use the left-aligned **New task** action or type directly into the notepad and press Enter. Shift+Enter inserts a line break. There are no required priorities or context fields.

- **Today’s Main Tasks:** undated tasks, today’s tasks, and overdue items.
- **Daily Repeatable Tasks:** completion is stored per date and resets at local midnight, preserving previous completions.
- **Upcoming Due Dates:** tasks with future due dates, sorted chronologically. When their date arrives, they appear in Today.

Drag a card using its small top handle onto another section’s heading, or use the card’s options menu to move it. Click a task’s text to edit it. Due dates and status are optional controls. Existing task details remain stored through migration. Deletion requires confirmation.

## Habits

A minimal top-aligned list and weekly grid. Add or edit a ritual, choose an emoji, and check elapsed days. Future days are disabled. Streaks count consecutive completed days ending today or yesterday, including across month and year boundaries. The table scrolls inside its panel on mobile.

## PIN and local recovery

An optional 6–12 digit PIN encrypts the complete sanctuary using AES-256-GCM and a non-extractable key derived with PBKDF2-HMAC-SHA-256 (600,000 iterations and a random salt). Each encryption has a fresh random IV. PINs and derived PIN keys are never stored. Startup/reload locks the sanctuary, and **Lock workspace** saves before locking. Changing or disabling an existing PIN requires the **Old PIN**, checked by decrypting the stored vault.

Set up **Local recovery** in Settings while you still know your PIN. Choose a question/prompt, an optional hint, and a private answer of at least 12 characters. A memorable secret phrase is preferable to a publicly known fact. Answers are case-sensitive; surrounding whitespace is ignored and Unicode is normalized with NFKC.

Recovery uses a separate random 256-bit key. Your answer derives another salted PBKDF2 key that wraps that recovery key with AES-GCM. The recovery key encrypts an up-to-date copy of the sanctuary on every save. The answer is never stored; the recovery key is present only inside encrypted payloads and in memory while unlocked. The **question and hint are intentionally visible on the lock screen**, so they must not reveal the answer.

On the lock screen, choose **Forgot your PIN?**, answer the private question, and set a new PIN. A wrong answer fails authenticated decryption and leaves the vault intact. Recovery restores the latest entries and drafts; it cannot restore a device whose browser storage was cleared. Removing recovery requires the current PIN. Turning off PIN protection also removes the recovery copy and returns storage to plaintext.

This is local protection at rest, not protection against a compromised browser or an already unlocked session. PIN and answer strength matter because stored ciphertext can be attacked offline. If both the PIN and recovery answer are lost, there is no bypass or remote reset. Keep a separate private backup of irreplaceable writing.

## Persistence and failure handling

The `still-workspace-v2` key holds either the plaintext sanctuary (PIN off) or the encrypted envelope (PIN on). Both workspaces and drafts are encrypted together. Legacy plaintext keys are removed only after successful replacement. Malformed records and storage failures are reported, never silently replaced. Save failures keep changes in memory and offer a retry button.

Changes in another tab update an unprotected workspace, or lock a protected tab to prevent stale writes. All persisted entities use stable IDs. Task, habit, folder, and draft updates use functional state setters.

## Interaction and motion

The forest is a bundled SVG illustration, with no external image/font requests. Ambient sunlight and motes use transform/opacity animation, and the calendar cat crosses on a compositor-friendly transform track. The scene pauses when the page is hidden. Reduced-motion settings stop continuous movement and remove the unlock transition. Dialogs trap focus, make background content inert, restore focus, and support Escape.

## Architecture

- `src/hooks/useWorkspace.js`: persistence, workspace isolation, PIN lifecycle, recovery, cross-tab protection.
- `src/lib/vault.js`: AES-GCM, PIN/answer derivation, recovery wrapping, data validation.
- `src/data.js`: legacy migration, sanctuary normalization, date, folder, task, and streak logic.
- `src/hooks/useToday.js`: midnight/focus rollover for daily tasks and habits.
- `src/components/`: modular navigation/switcher, journal/calendar/editor, notepad tasks, habits, settings, lock/recovery screen, emoji picker, accessible modal, and error recovery.
- `src/styles.css`: shared layout and component foundation.
- `src/styles/sanctuary.css`: nature theme, illustrated lock scene, ambient motion, editor, notepad, and workspace-specific styling.

Tests exercise crypto authentication and tamper rejection, local recovery, wrong old PINs, migration, workspace isolation, auto-saved drafts, midnight resets, task drag/state updates, habits, storage failures, responsive layouts, and keyboard/reduced-motion behavior.
