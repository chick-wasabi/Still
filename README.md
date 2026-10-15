<div align="center">

# 🌿 Still

### A hyper-immersive personal workspace where a chaotic cat occasionally steals your cursor.

**Find your focus. Write your story. Negotiate with the cat.**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=61DAFB&labelColor=0F172A)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=646CFF&labelColor=0F172A)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8&labelColor=0F172A)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-BB4DFF?style=for-the-badge&logo=framer&logoColor=BB4DFF&labelColor=0F172A)](https://motion.dev/)

🍃 Your thoughts, at home. · 🌙 Your tasks, under control. · 🐈 Your cursor, allegedly yours.

[Features](#-a-sanctuary-with-a-slight-chaos-problem) · [Run locally](#-summon-your-sanctuary) · [Known bugs](#-known-bugs)

</div>

---

Still brings your journal, tasks, and habits into one quiet corner of the internet. Think warm forest light, glassy dark panels, and room to breathe. Then imagine a tiny 3D cat sprinting across that carefully composed moment of inner peace.

**Everything starts empty.** No fake meetings. No inspirational sample diary. Just you, a fresh page, and a coworker who believes the mouse belongs in its mouth.

## ✨ A sanctuary with a slight chaos problem

| Feature                                        | What makes it feel like home                                                                                                                                          |
| :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔐 **Local-first privacy**                     | Your writing stays in this browser. Optional PIN protection encrypts your workspace, with recovery using a private answer. No account or cloud sync required.         |
| 🌲 **A gorgeous dark-nature sanctuary**        | Warm golden light, emerald accents, floating particles, and a forest lock screen. Personal feels cozy; Work switches to focused slate, violet, and cyan.              |
| 📓 **A journal that gives you space**          | A clickable calendar, centered Markdown editor, saved drafts, and instant undated thoughts. Titles and metadata are optional. A blank page is a valid starting point. |
| 📝 **An intelligent sticky task manager**      | Capture a thought and press Enter. Today’s Main Tasks, Daily Repeatable Tasks, and Upcoming Due Dates keep things organized without a mandatory metadata interview.   |
| 🌱 **A habit tracker without the lecture**     | A clean weekly grid, custom rituals, and streaks that cross month boundaries. Check the box. Enjoy the tiny victory.                                                  |
| 🗂️ **Separate spaces, tidy collections**       | Isolated Personal and Work content, nested folders, emoji icons, drag-and-drop organization, and quick search. Your grocery list can stop attending stand-up.         |
| 🐈 **The legendary cursor-stealing companion** | An articulated 3D cat with randomized decisions, gravity-driven jumps, a throwable toy ball, and absolutely no respect for your pointer’s personal space.             |

## 🐾 Meet your least productive teammate

The cat is a textured tabby on an adapted 108-joint rig, with 12 supplied animation clips, 13 custom comfort clips, Rapier physics, and a stochastic behavior engine. Now 45 pixels tall, with soft tabby fur and a flowing tail, it walks, gallops, stretches, sleeps, belly-rolls, and occasionally auditions for a career in parkour on your UI panels. It lives in the page itself: scroll away and it leaves the screen with the content, then comes back where you left it (unless it has been busy being a cat).

- **Drag and release the cat** to toss it. Fast wall impacts can produce a brief cling before gravity files its objection.
- **Enable Play Ball in the top-right controls** (it starts off), then throw the toy ball and let the cat decide whether this meeting could have been a chase. Play sessions end, so the rest of your dashboard still gets a visit.
- **Leave your pointer still for 6–8 seconds** and the cat may stalk it, grab its visual, and carry it around in its mouth for 5–10 seconds. Your native pointer stays visible until the cat actually reaches it.
- **Move, click, or type** to reclaim control immediately. No ransom. No CAPTCHA. Mild judgment.
- **Click the kitten** for a cycle of purrs, paw swats, head tilts, and a tiny hop. It might even meow, ask for pets, scratch a heading, or borrow a letter. All text returns intact.
- **Let it settle in.** Loafing, kneading, grooming and longer naps give the sanctuary a quieter rhythm. Claw marks heal after 5–20 seconds; your actual writing stays untouched. Optional purring lives in Settings → Companion sounds and starts off.
- **Use the pet and ball buttons** for keyboard-accessible play, or pause the companion from the top bar when it is time to be suspiciously productive.

> [!NOTE]
> The cat carries an emulated in-app cursor. Your operating-system pointer coordinates and actual click targets never move. Touch keeps normal pointer behavior; reduced motion rests the cat and disables cursor emulation. Devices without WebGL 2 still get a usable workspace.

## 🚀 Summon your sanctuary

Bring **Node.js 20.19+ or 22.12+** and npm. Cat treats are optional; the cat disputes this.

```sh
git clone https://github.com/chick-wasabi/still.git
cd still
npm ci
npm run dev
```

Open the local URL printed by Vite, usually **http://localhost:5173**. No API keys, backend, or account ceremony required.

### Build for production

```sh
npm run build
npm run preview
```

Production files land in `dist/`. On **Vercel**, choose the **Vite** framework preset, keep the default npm install command, set the build command to `npm run build`, and use `dist` as the output directory. No `--force` or `--legacy-peer-deps` required.

### Check that the cat has not eaten the code

```sh
npm test
npm run format:check
npx playwright install chromium
npm run test:e2e -- --workers=1
```

Browser tests use `/usr/bin/chromium` when available, otherwise Playwright’s installed Chromium. You can also set `CHROMIUM_PATH` to your browser executable. The WebGL tests enable software rendering; a single worker is friendlier to constrained machines.

## 🧰 Under the moss

| Layer                 | Tools                                                                       |
| :-------------------- | :-------------------------------------------------------------------------- |
| Interface             | React 19, Vite 6, Tailwind CSS 4, Lucide React                              |
| Motion                | Framer Motion for the interface; Three.js skeletal animation for the cat    |
| Tiny chaotic universe | React Three Fiber, Drei, Rapier physics                                     |
| Writing               | Markdown formatting and preview via React Markdown                          |
| Persistence           | Browser localStorage; Web Crypto AES-256-GCM when PIN protection is enabled |
| Quality checks        | Node.js test runner, Playwright, Prettier                                   |

The 3D scene and bundled GLB load separately from the main workspace. The model and textures are served by Still itself, with no third-party viewer or asset service. Frame rate depends on your device and GPU. The cat has many talents; manufacturing graphics hardware is still on the roadmap of its imagination.

## 🐛 Known Bugs

_Filed by humans. Categorized as “features” by the cat._

| Incident                         | Current investigation                                                                                                                                                                   |
| :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severe caffeine addiction**    | The cat occasionally absconds with your on-screen pointer as though it has consumed three espressos and a sprint retrospective. Coffee access has been revoked. Enforcement is pending. |
| **Unauthorized gravity testing** | Throwing the cat reveals that gravity works. The cat requests a second opinion.                                                                                                         |
| **Calendar occupancy dispute**   | A perfectly good UI surface may become a bed. The cat has produced no lease but appears legally confident.                                                                              |
| **Productivity inversion**       | You opened Still to finish a task. You have now thrown the ball eleven times. The task remains optimistic.                                                                              |
| **Streak-induced smugness**      | Checking a habit may cause a small, entirely deserved sense of accomplishment. No fix planned.                                                                                          |

These are jokes about the companion’s intended behavior. Actual broken behavior deserves an [issue](https://github.com/chick-wasabi/still/issues), ideally with reproduction steps and the cat’s alibi.

## 🔒 Your sanctuary, your responsibility

Content stays in this browser’s storage, separated into Personal and Work spaces. With PIN protection **off**, it is stored as plaintext. With PIN protection **on**, the workspace is encrypted using AES-256-GCM and a PBKDF2-derived key. Changing an existing PIN requires the old PIN.

Configure local recovery in Settings while you still know your PIN. The recovery question and hint are visible on the lock screen; keep the answer private. There is no email reset or server-side rescue. **Clearing browser data deletes the local workspace**, so keep separate copies of irreplaceable writing. Encryption protects stored data, not an already unlocked session or a compromised browser.

For the full workspace guide, recovery details, persistence behavior, and architecture, read [the field guide](docs/WORKSPACE_GUIDE.md).

---

<div align="center">

**A little less noise. A little more intention. One deeply unserious cat.**

🌿 Stay Still. The cat probably won’t.

</div>

### Cat credits

The tabby combines **Micael Martins’ “Realistic cat – Pets for your project”**
(Sketchfab Standard License) with the adapted skeleton and animation clips from
**Animal Animator’s “Sphynx Cat – Rigged & Animated (10 Anims)”**
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source links, separate
license terms, and modifications. Credits are also available in Settings → About
& credits. Models and textures load locally; no Sketchfab iframe or service is used.

The [feline behavior core](docs/FELINE_BEHAVIOR.md) documents calibrated gait, grounded comfort poses, 40–50-second naps, connected surface navigation, claw marks, and bounded ball play.
