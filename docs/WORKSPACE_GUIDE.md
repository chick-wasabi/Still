# Still — a personal sanctuary

A private React/Vite workspace with an illustrated forest lock screen, warm ambient light, independent Personal and Work spaces, a journal, an instant notepad for tasks, and a weekly habit grid. Built with Tailwind CSS, Lucide React, Framer Motion, React Three Fiber, Three.js, and Rapier.

## Run and validate

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
npm test
npm run test:e2e
npm run format:check
```

Deploy `dist/` to a static host using HTTPS. There is no backend, email integration, account service, or cloud synchronization. End-to-end tests use `/usr/bin/chromium` if installed; otherwise run `npx playwright install chromium` or set `CHROMIUM_PATH`.

For Vercel, use the **Vite** framework preset, the default npm install command, `npm run build` as the build command, and `dist` as the output directory. No peer-dependency bypass flags are needed.

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

## Atmosphere and the cat companion

Personal uses a warm charcoal/forest palette with golden and emerald highlights. Work uses slate-indigo with violet/cyan accents. Switching spaces crossfades background layers and transitions the shared accent tokens, including dialogs rendered in portals. The selected space remains the source of truth; theming does not copy journal or task data into preferences.

The Journal renders 44 motes across three depth layers (24 visible on small screens), with static soft-focus treatment, brighter glow, and faster floating paths. Cursor movement gently shifts light and depth layers on devices with a precise pointer. Pointer updates are coalesced through a damped animation frame loop and never update React state. Other views use a quieter eight-particle scene. All illustrations are bundled SVGs with no external image/font requests.

The companion is a textured tabby on a fitted **108-joint skinned rig**, rendered in a lazy-loaded transparent React Three Fiber canvas mounted absolutely inside the scrolling `.workspace-shell`. Standing height is normalized to 45 CSS pixels at 40 pixels per world unit. The bundled `public/models/still-tabby.v1.glb` combines Micael Martins’ tabby geometry/atlas with Animal Animator’s adapted skeleton and clips. Three material primitives share cached geometry/textures, with independent cloned skeletons and material instances per mount. No Sketchfab iframe or external texture/decoder service is used. See `THIRD_PARTY_NOTICES.md` and Settings → About & credits for each source’s separate license and modifications.

The GLB retains twelve clips: idle, walk, trot, gallop/run, climb, swim, leap/jump, stalk/hunt, hiss, pounce, lick paw, and bite. The behavior adapter selects appropriate authored locomotion, climbing, grooming, stalk and pounce clips with short crossfades. Swim, hiss, and bite remain available in the asset without forcing unsuitable behaviors onto the dashboard. Sleeping, sitting, stretching, rolling, scratching, head tilts, and speech add custom procedural poses to the evaluated skeleton. These are adapted poses rather than additional supplied animation clips. Jump uses an authored flight pose while Rapier owns the arc; authored hip translation is removed to prevent double jumps and document-position drift. Reduced motion uses a static resting pose. Frame updates mutate the mixer and reused bone poses without React renders.

`blender -b -t 2 --python scripts/build-tabby-asset.py -- TABBY.glb RIG.glb OUTPUT.glb` reproduces the derivative from the two original user-supplied files using Blender 4.3+. It fits bone rest proportions, transfers barycentric nearest-surface skin weights, preserves the nested eye/whisker geometry, consolidates the UV-atlas materials, resizes the atlas, scales animation translations, and compacts exact constant tracks/buffer views without a runtime decoder. The source GLBs are not shipped separately. Normal application installation/build does not require Blender.

Rapier owns motion at a fixed 60 Hz with CCD on both the cat and its toy ball. DOM measurements produce invisible solid panel/button colliders, thin heading ledges, solid HTML panel sidewalls, and document boundaries. Every collider is measured relative to the scrolling dashboard origin, including surfaces below the fold. Physics raycasts verify landable surfaces. The planner chooses launch velocity using gravity and rejects obstructed ballistic arcs; animation cannot move a jumping rigid body along a floating timeline. Ground detection samples the body footprint, including panel edges. Scrolling never rebuilds colliders, resets a body, or changes its document coordinates. Real layout changes move an actor with its supporting ledge when possible; navigation remembers positions per workspace/view for the current session. A bounded raster window (at most 2,048 CSS pixels high) and orthographic camera render the visible part of a long document without allocating a page-height framebuffer. Stochastic decisions depend on fatigue, recent behavior history, under-visited surfaces, cursor inactivity, and recent ball activity. Refresh randomizes a visible safe spawn and initial pose. Sleep lasts a few seconds; sitting, grooming, looking around, meowing, exploring and text mischief provide variety. Repeated pet clicks cycle through a purring stretch, paw swat, head tilt and physical hop. Short decorative speech bubbles follow the cat.

**Play:** drag the 3D cat or toy ball and release to throw it. Release velocity uses recent pointer samples, is capped, and drops to zero if the drag stops. The cat briefly clings after a sufficiently fast wall impact, then falls under gravity. The optional yarn ball bounces, rolls, and attracts pursuit/pounces/paw impulses. The cat can fetch it in its mouth, carry it, and drop it back into dynamic physics; it can descend from a ledge to follow a ball on lower content. Climbing locks to measured vertical panel sidewalls with alternating paw grips, then uses a ballistic landing onto the panel. Text targets are collected across headings, journal cards, calendar cells, tasks, habits and sidebar labels. The cat approaches a reachable target before scratching with alternating poses or borrowing a letter. CSS Custom Highlights decorate the original range, while a single floating glyph follows the mouth. No React text nodes, accessible labels, or stored content are edited. Scratch highlights heal after 850 ms; borrowed letters return after a few seconds, user input, pause, reduced motion or unmount. Browsers without Custom Highlights retain the original glyph and show only its carried copy. The two small companion controls provide keyboard-accessible **Pet 3D cat** and **Toss toy ball** alternatives. The top-right cat and Play Ball toggles are independent and persist in `still-motion-preferences`; Play Ball starts OFF, including for existing installations. The cat can be off while the ball remains playable. Turning off both unmounts the scene. The ball has higher mass, friction and damping, and lower restitution, for a heavier feel. A throw creates a bounded play session, after which the cat leaves the ball where play ended and returns to other activities.

On a fine pointer, a beveled 3D arrow (or text caret over writing fields) replaces the native pointer while the pointer is over the active dashboard. After 6–8 idle seconds, the cat approaches the nearest reachable perch, grabs the cursor visual, and holds it at its animated **mouth bone** while it continues autonomous behaviors. It randomly lets go; mouse movement, clicks, or keyboard input immediately break the hold. The held cursor follows the mouth in document coordinates and scrolls out of view with the cat. Scroll alone does not break a hold. Real operating-system coordinates and HTML click targets never move. Raycasting consumes pointer events only when picking a cat/ball mesh; the canvas itself has `pointer-events: none`. Touch keeps the native pointer behavior and supports direct pet/ball dragging.

Dialogs, open menus/mobile navigation, hidden tabs, locking, and pause suspend the renderer/physics and restore the native pointer. Reduced motion gives the cat a static resting pose and freezes physics; custom-cursor emulation is disabled. WebGL 2 failure or context loss restores the normal workspace and offers a retry. The 3D code and bundled Rapier/WASM payload load separately from the HTML workspace; no remote asset service is required. DPR is bounded and adapts to sustained frame cost. Observers, pointer capture, native-cursor styles, geometries, materials, skeletons, and physics resources are cleaned up when the companion unmounts. Frame rate still depends on the device/GPU; no universal 60 fps guarantee is made.

The 3D companion uses Three.js skeletal animation and Fiber 9/React 19 directly. The unused, deprecated `framer-motion-3d` package is excluded because its peer requirements target Fiber 8/React 18. Framer Motion remains installed for the HTML interface.

## Architecture

- `src/hooks/useWorkspace.js`: persistence, workspace isolation, PIN lifecycle, recovery, cross-tab protection.
- `src/lib/vault.js`: AES-GCM, PIN/answer derivation, recovery wrapping, data validation.
- `src/data.js`: legacy migration, sanctuary normalization, date, folder, task, and streak logic.
- `src/components/pet3d/PetCompanion.jsx`: global lifecycle, lazy loading, controls, pause, and fallback handling.
- `src/components/pet3d/PetScene.jsx`: transparent canvas, lights, Rapier world, actors, and 3D cursor.
- `src/lib/pet3d/catModel.js`: cloned GLB rig, authored clip selection/crossfades, and additive poses.
- `src/lib/pet3d/director.js`: stochastic decisions, physical locomotion, ball pursuit, and cursor holding.
- `src/lib/pet3d/domWorld.js`: batched DOM-to-physics geometry and invalidation.
- `src/lib/pet3d/input.js`: mesh raycasting, drag capture, velocity sampling, and cursor interaction.
- `src/lib/pet3d/math.js`: coordinate mapping, collision planning, ballistics, and behavior weights.
- `src/lib/pet3d/state.js`: shared imperative input state and native-cursor restoration.
- `src/hooks/useAmbientLight.js`: frame-coalesced cursor lighting without React re-renders.
- `src/hooks/useMotionPreferences.js`: non-sensitive companion visibility preference.
- `src/hooks/useToday.js`: midnight/focus rollover for daily tasks and habits.
- `src/components/`: modular navigation/switcher, journal/calendar/editor, notepad tasks, habits, settings, lock/recovery screen, emoji picker, accessible modal, and error recovery.
- `src/styles.css`: shared layout and component foundation.
- `src/styles/sanctuary.css`: nature illustration, lock scene, editor, and notepad foundation.
- `src/styles/motion.css`: workspace palette tokens, ambient depth layers, and motion accessibility.
- `src/styles/pet3d.css`: transparent overlay, companion controls, and cursor/fallback styling.

Unit tests cover gravity/ballistics, safe perches, toss velocity, weighted decisions, skeleton/gait construction, and actual Rapier body/ball collisions in addition to workspace/crypto logic. WebGL browser tests exercise real rendered meshes, transparent hit testing, cat tossing/wall clinging, ball dragging, mouth-held cursor release, reduced motion, responsive colliders, persistent pause, context loss, and unsupported-device fallback. They explicitly enable Chromium software WebGL; on constrained CI hosts run `npx playwright test --workers=1`. Workspace tests continue to cover journal/task/habit workflows, recovery, encryption, isolation, migration, and storage failures.
