# Still’s feline behavior core

This implements the supplied Feline Procedural Core guide within the existing
React/Vite app. The tabby, 108-joint GLB, 12 supplied clips, 45px standing height,
local data, workspace controls, and document-relative canvas remain in place.

| Guide behavior      | Implementation                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Living idle         | Continuous chest/back breathing, intermittent blinks, ear flicks, and quaternion-damped saccadic head/eye tracking. The eye geometry is bound to its eye joints. Reduced motion uses a static pose.                                                        |
| Loaded crouch       | Spine compression, blended pose layers, and analytic two-bone paw IK on raycast surface normals. Walking cycles follow distance travelled and stop when the body stops.                                                                                    |
| Cursor hunt         | After 6–8 seconds without pointer input, stalk toward a reachable perch and solve a gravity-driven pounce using a sampled future mouth pose. A failed route never grants a remote capture.                                                                 |
| Cursor grab         | Actual mouth proximity must be within 0.18 world units (7.2 CSS pixels). The native cursor stays visible until contact. The replica starts at its original coordinates, converges over 120ms, and attaches to the mouth hierarchy.                         |
| Cursor hold/release | The cat may roam with the replica for 5–10 seconds. Moving/clicking/typing, pausing, leaving, or opening a dialog restores the native pointer. Real hardware coordinates never move.                                                                       |
| Visual spatial map  | Painted card edges/dividers and individual text-line ink bounds become measured surfaces. Transparent padding creates no collider. The sidebar divider is a climb sensor, allowing passage in front of this decorative separator.                          |
| Scramble/climb      | Paw-grip impulses work against scaled gravity along actual panel sides. Thin sidewalls resolve to the parent’s full roof for landing. A genuine falling exit beside a wall can scramble upward; scrolling alone never relocates the cat.                   |
| Enter a panel       | The cat can deliberately drop through its chosen top border to reach the panel’s contents. Per-contact Rapier filtering affects that cat/platform pair; props and other obstacles retain collision.                                                        |
| Letter theft        | Choose the nearest Unicode grapheme, hide it with a CSS Custom Highlight, and render a reusable 3D glyph at the jaw. Run toward another visible surface, then guard or chew the treasure.                                                                  |
| Letter restoration  | Restore the original highlight after a random 5–10 seconds and show a brief glyph drop/particle dissolve. User input, pause, selection, and unmount restore immediately. Original React text nodes, accessible writing, and saved data are never replaced. |
| Play Ball           | Toggle ON drops the heavier toy from the current view’s ceiling and starts a short priority play window. Chase its current position, strike only within paw reach, alternate front paws, and apply the impulse during the strike.                          |
| Fetch/exit          | A fetched ball lifts smoothly to the mouth, travels toward the pointer/center, then returns to dynamic physics. Play budgets, bat limits, and cooldowns return the cat to ordinary activities.                                                             |
| Arbitration         | Weighted choices consider arousal, fatigue, recent actions, under-visited surfaces, available text, and play windows. Movement attempts have short budgets; persistent goals expire.                                                                       |

`brain.worker.js` performs asynchronous numeric arbitration and bounded reachable
surface scoring. It receives rectangles, IDs, and numeric state—not DOM nodes or
journal text. A main-thread fallback uses the same decision function. Rapier’s
fixed-step simulation remains colocated with React Three Rapier so dragging,
contacts, and rendering do not depend on asynchronous physics messages.

`legIK.js` solves the two-bone leg chains. `catModel.js` combines the original
clips with soft procedural layers. `mouthProps.js` reuses a glyph texture and
particle buffers. Rendering and pose updates mutate Three objects without React
state updates each frame. Worker, input, timer, highlight, and GPU resources are
released on unmount; hidden views and dialogs suspend activity.

The app uses gravity of 26 world units/s², corresponding to 9.81 m/s² at roughly
106 CSS pixels per metre and 40 pixels per world unit. This keeps arcs calibrated
to the miniature pet. Frame rate depends on hardware; there is no universal
60fps guarantee.

Tests cover IK reach, breathing and stopped gait, exact-contact capture, bounded
holds and play, per-body drop-through collision, worker fallback, visual-only
surfaces, grapheme restoration, and the existing journal/privacy workflows.
