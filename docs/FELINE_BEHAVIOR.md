# Still’s grounded companion

The tabby remains 45 CSS pixels tall when standing on its 108-joint rig. The
bundled GLB now contains the twelve original supplied clips and thirteen Still
comfort clips. Geometry, atlas, source hashes and separate license credits remain
in the asset and in Settings. Nothing is fetched from Sketchfab at runtime.

## Motion and contact

`catModel.js` retains hips translation: the source clips are in place, and their
vertical offsets are essential posture data. Only the authored flight translation
is removed during physical jumps, including in the predictive mouth probe.
Rapier owns document-space translation throughout.

`scripts/author-cat-motion.mjs` authors sit, groom, lie-down, get-up, loaf, sploot,
knead, curled sleep, side sleep, belly roll, stretch and two scratch variants as
24fps skeletal clips. It uses anatomically directed two-bone solves during
**offline authoring**, then exports reusable keyframes. These are custom authored
motions, not additional animations supplied by the model creators or motion
capture. The model’s transferred skin weights still constrain extreme poses.

The script measures actual skinned soles and support vertices at 64 samples per
clip. Profiles in `asset.extras.stillMotion` contain measured strides, foot contact
windows and calibrated support seeds for all three skins, including the separate
eye and cornea shells. Runtime gait phase advances
from distance actually travelled; changing gaits preserves phase. The former
independent, assumed foot-lock cycle has been removed. It caused large paw snaps
when it disagreed with the imported animation.

Each grounded frame evaluates the support seeds on the blended skins, then searches
adjacent vertices for contact points that move during crossfades and gaze changes.
It aligns the resulting contact plane to the known support. This covers seated grooming,
lying and rolling rather than assuming every pose rests on four standing paws.
The outer model group never rotates to simulate sleep or a roll. Nine tail joints
receive subtle secondary motion, with floor avoidance while resting. Breathing,
blinks, ear movement and damped gaze remain additive. Sleeping closes the eyes and
suppresses active head tracking.

Regenerate the clips and contact profiles without Blender or external sources:

```bash
node scripts/author-cat-motion.mjs public/models/still-tabby.v1.glb /tmp/still-tabby.glb
# Review the output before replacing public/models/still-tabby.v1.glb.
```

The authoring script removes previous Still clips and compacts their unused
accessors/buffers, so repeated generation does not accumulate dead binary data.
The original mesh/rig fitting pipeline remains in `scripts/build-tabby-asset.py`.

## A page that can be traversed

The canvas is absolute inside `.workspace-shell`, with a bounded raster window.
Body positions are in document coordinates; scrolling never resets or pins the
cat. Geometry, text, pointer picking, the ball, mouth props and scratches use the
same origin. Sticky sidebar geometry is measured relative to that origin too;
scrolling updates its visible surfaces without carrying or teleporting the cat.

Painted horizontal edges are one-way platforms. Calendar cells are not closed
collision cages. Decorative sidewalls are climb sensors: the pet can pass in front
of the panel in this 2.5D scene while still finding a wall to climb. Actual document
boundaries remain solid. Short text glyphs are interaction targets, not obstacles;
longer text lines can be perches. Grounded actors keep their support identity,
height and extents.

`navigation.js` performs bounded A* over perches and several anchors on long
surfaces. Routes can walk away from a destination to find a useful intermediate
ledge. Edges use the same scaled gravity and one-way semantics as physics. A cat
can jump upward through a painted platform and land on it while descending, or
choose a controlled drop-through. Physical climbing provides an additional escape
route. Movement progress is monitored; failed edges temporarily cool down and are
replanned. Intentional naps are never treated as a stuck actor.

The one-way contact hook reads **pre-step numeric snapshots only**. Reading a
Rapier body’s translation/velocity inside a Rust contact callback re-enters the
simulation and can prevent collision resolution. CCD contacts are classified from
the approach position, before a fast body crosses a thin painted edge.

## Intentions and pacing

`behaviorConfig.js` centralizes per-action weights, durations, cooldowns and
families. Selection considers fatigue, arousal, space, recent actions and available
interactions. Energy changes with elapsed activity rather than number of decisions.
The intended unprompted time budget is roughly 40% sleep, 25% quiet observation,
15% comfort motions, 15% exploration and 5% mischief. Actual occupancy depends on
user input and available routes and is exposed in the development inspector.

Typical naps last **40–50 seconds**, with optional side-sleep variants. Comfort
motions use lie-down/get-up transitions and compatible optional branches; kneading
or loafing may lead to sleep, while waking may lead to stretching. This is not one
fixed routine. Rolls need a sufficiently wide support. Resting intentions are
protected from automatic cursor hunts. An idle pointer after 6–8 seconds creates
an opportunity, not a command to abandon sleep; declined opportunities back off.
Explicit petting, dragging and ball throws can still interrupt ordinary activity.

Worker arbitration remains numeric-only, with a main-thread fallback. Surface
edge plans are bounded and cached by layout. Frame updates mutate Three/Rapier
objects rather than React state. Hardware and GPU determine achievable frame rate.

## Mischief and play

The native cursor stays visible until the animated mouth actually reaches its
position (within 7.2 CSS pixels). The replica converges to and attaches at the
mouth for 5–10 seconds. Mouse, click and keyboard input immediately release it.
Real pointer coordinates and HTML click targets never move.

Letter theft requires mouth proximity to the nearest measured Unicode grapheme.
A CSS Custom Highlight hides only that range; no React text node or stored text is
changed. A 3D glyph follows the jaw, then falls/dissolves on timed release. Original
text restores after 5–10 seconds or immediately on input/pause/unmount.

Scratches require an animated paw within 22 pixels of a reachable text contact, or
an actual paw position for surface scratching. Three irregular paired groove paths
appear there. Marks remain for **5–20 seconds**, then fade. Up to twelve decals are
retained, attached to their target as the page scrolls. There is no strikethrough,
text replacement or layout transform. Selection/editable text blocks mischief.
Timers, decals and document listeners are cleaned up separately from ordinary
pause/restoration so effects continue working after reopening a modal.

Play Ball defaults off. Enabling it drops a heavier, frictional toy from the visible
ceiling; throwing renews a short priority play window. Pursuit, paw strikes and
fetching remain physical. Play ends with the ball left where it was dropped.
Cat and ball visibility persist independently. Settings → **Companion sounds** is
a separate opt-in, initially off. Quiet purring/sleep breathing is synthesized
locally only after a user gesture; pause, hidden views, reduced motion and unmount
silence it.

## Review and verification

In development, open `/?petDebug=1` for the motion lab. It provides pose previews,
time scrubbing, natural-nap preview, real destination navigation, support lines,
climb walls, paw joints, routes, fatigue and measured time occupancy. The inspector
and its debug object are excluded from the production build.

Unit checks cover actual skin-to-plane contact, maximum paw displacement, authored
clips, multi-level routes that temporarily move away from a goal, real Rapier CCD
one-way landings, long naps and protected rest. WebGL checks exercise calendar
escape from multiple cells, pose transitions on a real panel, sticky coordinates,
contact-only claw marks/lifetime, sound preferences, plus existing cursor, toss,
ball, touch, reduced-motion, context-loss and workspace flows. Visual review must
still accompany numerical checks: a valid skeleton and a state label alone do not
establish convincing motion.
