# Remotion Evaluation for myK9Show Tutorial Videos

**Date:** 2026-03-24
**Status:** Research complete, pending decision

---

## Overview

### What is Remotion?

Remotion is a framework for creating MP4 videos programmatically using React components and TypeScript. Instead of editing video in a GUI tool like Premiere or DaVinci Resolve, you write React components that receive a `frame` number and render their state at that point in time. Remotion then renders each frame in a headless browser and encodes them into a video file.

**Core mental model:** Every frame of the video is a React render. You use `useCurrentFrame()` to read the current frame, calculate animations, and conditionally show/hide content. `<Sequence>` components let you compose and time-shift independent sections.

**Key components of the Remotion ecosystem:**

- **Remotion core** -- React hooks and components for defining video compositions (`useCurrentFrame`, `<Sequence>`, `<Composition>`, `<Audio>`, `<Img>`, `<Video>`)
- **Remotion Studio** -- Local dev environment with a preview player, timeline scrubbing, and visual prop editing
- **Remotion Player** -- Embeddable React component for playing compositions in the browser (no MP4 needed)
- **Remotion CLI** -- `npx remotion render` to export MP4/WebM from the command line
- **Remotion Renderer** -- Node.js API (`renderMedia()`) for programmatic/CI rendering
- **Remotion Lambda** -- Distributed rendering on AWS Lambda for scale
- **Remotion Recorder** -- A production tool for recording webcam + screen + overlays into polished videos

**Scale of adoption:** 40,000 GitHub stars, 1.4M monthly npm installs, 8,000+ Discord members. This is a mature, actively maintained project (v4.x current, v5.0 in progress).

### How Rendering Works

1. Your React composition is bundled with Webpack
2. Remotion opens a headless Chromium instance
3. For each frame, it navigates the browser to that frame number, waits for all assets to load, and takes a screenshot
4. Screenshots are piped to FFmpeg (embedded via Rust) to encode the final video
5. Audio tracks are mixed and muxed into the output

This means anything you can render in a browser -- HTML, CSS, SVG, Canvas, images, embedded videos -- can appear in your Remotion video.

---

## Licensing

Remotion uses a **dual-license model**:

| Category                                | Cost                  | Notes                |
| --------------------------------------- | --------------------- | -------------------- |
| Individuals                             | Free                  | Full feature access  |
| Organizations with 3 or fewer employees | Free                  | Full feature access  |
| Non-profits                             | Free                  | Full feature access  |
| Evaluation / pre-production             | Free                  | No time limit stated |
| For-profit companies with 4+ employees  | Paid license required | Via remotion.pro     |

**What the free license permits:** Commercial use for creating videos and images. You can sell videos you produce. The restriction is on reselling or relicensing Remotion itself (no building competing products).

**Paid license details:** Pricing is not publicly listed on their website -- you need to contact them or visit remotion.pro. The store shows add-on templates ranging from $10-$600 (Editor Starter, animated captions, etc.), but the base company license price is not disclosed.

**For myK9 specifically:** The myK9 platform is a for-profit product. If the team exceeds 3 people (including contractors), a paid license would be required. During evaluation and prototyping, use is free. This is worth clarifying with Remotion before committing to production use.

**License change note:** Remotion 5.0 will include license term changes (PR #3750 pending). Worth monitoring before making a long-term commitment.

---

## Integration with the myK9 Monorepo

### Feasibility: High

Remotion officially supports pnpm and has clear documentation for "brownfield" (existing project) installation. It would fit naturally as a new workspace in the monorepo.

### Proposed Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/
│   ├── myk9q/
│   └── videos/              # New Remotion workspace
│       ├── src/
│       │   ├── compositions/ # Video definitions
│       │   ├── components/   # Reusable visual elements
│       │   ├── assets/       # Screenshots, audio, logos
│       │   └── index.ts      # registerRoot()
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── ...
```

### Required Packages

```bash
pnpm add remotion @remotion/cli @remotion/renderer  # Core + CLI + Node API
# Optional:
pnpm add @remotion/player      # If embedding preview in myK9Show
pnpm add @remotion/lambda      # If cloud rendering needed later
```

### Build Integration

- Remotion bundles independently via Webpack (its own bundler). This is separate from Vite (used by myK9Show) and would not conflict.
- Rendering can be triggered via CLI (`npx remotion render`) or Node.js API, making it easy to add as a Turborepo task.
- Turborepo could orchestrate: `turbo run render:videos` alongside existing build/test tasks.

### Potential Friction Points

- **Webpack vs Vite:** Remotion uses Webpack for bundling compositions. This adds a second bundler to the monorepo but only for the videos workspace. No conflict with Vite in myK9Show.
- **tsconfig paths:** Remotion warns about import alias collisions if your tsconfig has paths that could resolve `import {...} from 'remotion'` to a local `remotion/` folder. Solvable with careful naming (e.g., `videos/` not `remotion/`).
- **Heavy dependency:** Remotion pulls in Chromium and FFmpeg for rendering. This adds significant `node_modules` weight to the videos workspace, though it would not affect other apps thanks to pnpm's workspace isolation.
- **Linux rendering dependencies:** CI rendering on Linux requires Libc 2.35+ and additional system packages. Alpine Linux and nixOS are not supported. GitHub Actions Ubuntu runners should work fine.

---

## Capabilities Assessment

### Can it use actual UI screenshots with overlay narration?

**Yes, with caveats.**

1. **Static screenshots:** Place PNG/JPEG screenshots in a `public/` folder and use Remotion's `<Img>` component. The `staticFile()` helper ensures images are fully loaded before the frame renders (no flicker). This is the simplest approach -- screenshot the UI, drop it into the composition, animate callouts/highlights on top.

2. **Screen recordings:** Remotion supports embedding video files via `<OffthreadVideo>` (recommended, uses Rust+FFmpeg for frame-perfect accuracy) or `<Video>` (WebCodecs-based, faster). You could record a walkthrough of myK9Show, then overlay annotations, zoom effects, and narration programmatically.

3. **Overlay narration:** Audio files (MP3, WAV, etc.) are supported via `<Audio>` component with volume control, trimming, and synchronization. You would record or generate narration separately, then sync it to the visual timeline using `<Sequence>` components.

4. **Text-to-speech:** Remotion does not have built-in TTS, but you could generate narration audio using any TTS service (ElevenLabs, Google Cloud TTS, Amazon Polly, OpenAI TTS) as a pre-processing step, then import the audio files. The `@remotion/install-whisper-cpp` package provides speech-to-text for generating synchronized captions from narration audio.

5. **Live component rendering:** Since Remotion renders in a browser, you could theoretically import actual myK9Show React components and render them directly in the video. However, this would require careful dependency management and mocking of data/auth contexts. Screenshots are more practical for most cases.

### Can videos be regenerated when the UI changes?

**Yes -- this is Remotion's primary value proposition for this use case.**

- **Screenshot-based workflow:** Take new screenshots, drop them into the assets folder, re-run `npx remotion render`. The animations, narration, and structure remain the same. This could be scripted: Playwright captures screenshots of key screens, then Remotion renders videos referencing those screenshots.
- **Data-driven compositions:** Pass different props (text, images, role-specific content) to the same composition to generate role-specific variants (exhibitor vs. secretary vs. judge).
- **CI/CD integration:** `renderMedia()` Node.js API or CLI can run in GitHub Actions. A workflow could: (1) deploy staging, (2) capture screenshots with Playwright, (3) render updated videos with Remotion, (4) upload to CDN/storage.
- **Parameterized videos:** Remotion compositions accept input props as JSON. You can change text, images, and timing without touching code.

### What can you animate?

Anything CSS/HTML/SVG can do:

- Zoom into a screenshot region (CSS transform + clip-path)
- Highlight a button or field with a pulsing ring
- Slide in/out callout boxes with text explanations
- Animate arrows pointing to UI elements
- Fade between screenshots showing a multi-step flow
- Show a mouse cursor moving to simulate clicks
- Display captions synchronized to narration
- Render charts, progress indicators, or other data visualizations

---

## Alternatives

### Motion Canvas

- **What:** TypeScript library using generator functions for programmatic animation, with a real-time editor
- **License:** MIT (fully open source, no commercial restrictions)
- **Language:** TypeScript (generators, not React)
- **Strengths:** Clean animation API, MIT license, good for vector/motion graphics, built-in voice-over synchronization, 18.3k GitHub stars
- **Weaknesses:** Smaller ecosystem than Remotion, no React (different paradigm), less documentation, no cloud rendering option, focused on vector animations rather than composite video production
- **Verdict for myK9:** Interesting but less practical. The generator-based API is a different programming model from the React/TypeScript the team already knows. Lacks the screenshot/video compositing features that are central to our use case.

### Manim (3Blue1Brown's engine)

- **What:** Python-based animation engine designed for mathematical/educational videos
- **License:** MIT
- **Language:** Python (not TypeScript)
- **Strengths:** Beautiful mathematical animations, battle-tested (powers 3Blue1Brown's YouTube channel), MIT license
- **Weaknesses:** Python-only (doesn't fit our TypeScript monorepo), focused on math visualizations not UI walkthroughs, steep learning curve for non-math content, no built-in support for compositing screenshots or screen recordings
- **Verdict for myK9:** Wrong tool for the job. Designed for math explanations, not software tutorials. Would require a separate Python toolchain.

### Plain FFmpeg (scripted)

- **What:** Command-line multimedia framework; the underlying engine Remotion uses
- **Strengths:** Free, no licensing concerns, maximum control, lightweight
- **Weaknesses:** No authoring environment, extremely verbose command syntax, no preview, no animation framework, manual frame-by-frame scripting, maintenance nightmare for complex compositions
- **Verdict for myK9:** Too low-level. You'd essentially be rebuilding what Remotion provides. Only makes sense for simple concat-and-overlay tasks, not structured tutorial content.

### Reveal.js (presentation framework)

- **What:** HTML-based presentation framework
- **Strengths:** Easy to build slide-based content, supports embedded code/video, auto-animate transitions, can export to PDF
- **Weaknesses:** Not a video tool -- produces interactive slide decks, not MP4 files. No narration sync, no timeline control, limited animation capabilities
- **Verdict for myK9:** Could work for interactive help content embedded in the app (tooltip tours, guided walkthroughs) but does not solve the video generation problem.

### Comparison Summary

| Criteria               | Remotion              | Motion Canvas         | Manim      | FFmpeg     | Reveal.js  |
| ---------------------- | --------------------- | --------------------- | ---------- | ---------- | ---------- |
| Language               | TypeScript/React      | TypeScript            | Python     | CLI        | HTML/JS    |
| Fits monorepo          | Yes                   | Partial               | No         | N/A        | Partial    |
| Screenshot compositing | Strong                | Weak                  | No         | Manual     | No         |
| Video compositing      | Strong                | Weak                  | No         | Strong     | No         |
| Audio/narration        | Good                  | Good                  | No         | Manual     | No         |
| Animation quality      | High                  | High                  | Very high  | Low        | Medium     |
| CI/CD rendering        | Yes (CLI + API)       | Yes (CLI)             | Yes (CLI)  | Yes        | N/A        |
| License cost risk      | Paid for 4+ employees | Free (MIT)            | Free (MIT) | Free       | Free (MIT) |
| Learning curve         | Moderate (React)      | Moderate (generators) | Steep      | Very steep | Low        |
| Ecosystem maturity     | Very high             | Medium                | High       | Very high  | High       |

---

## Recommendation

**Remotion is the right tool for this use case**, with one caveat around licensing cost.

### Why Remotion wins:

1. **React + TypeScript alignment.** The team already thinks in React components and TypeScript. Remotion's mental model (video = React component that receives a frame number) is natural to pick up.

2. **Screenshot + overlay workflow.** The core need -- take UI screenshots, add animated callouts and narration, output MP4 -- maps directly to Remotion's capabilities. `<Img>` for screenshots, `<Audio>` for narration, CSS animations for highlights, `<Sequence>` for timing.

3. **Regeneration on UI changes.** This is where Remotion justifies the investment over manual video production. A pipeline of Playwright screenshots + Remotion rendering can be automated in CI, keeping tutorial videos current as the UI evolves.

4. **Parameterized role-specific content.** One composition template can produce exhibitor, secretary, and judge variants by passing different props (screenshots, narration audio, text).

5. **Monorepo integration is clean.** pnpm support, Webpack bundler isolation, CLI/API rendering, Turborepo task compatibility.

### The licensing caveat:

If the myK9 team grows beyond 3 people, Remotion requires a paid company license at an undisclosed price. This is the main risk. Mitigations:

- **Start with evaluation (free).** Build a proof-of-concept before committing.
- **Contact Remotion for pricing** before moving to production.
- **Motion Canvas as fallback.** If the license cost is prohibitive, Motion Canvas (MIT) is the best alternative, though it requires learning a different animation paradigm and has weaker compositing.

### What Remotion does NOT solve:

- **Narration recording/generation.** You still need to produce the voiceover audio separately (record manually or use a TTS service like ElevenLabs/OpenAI TTS).
- **Content scripting.** Someone still needs to write the tutorial scripts and decide what to show. Remotion automates production, not content strategy.
- **Screenshot capture.** You need a separate tool (Playwright recommended, already in the monorepo for E2E tests) to capture UI screenshots automatically.

---

## Development Effort Estimate

### Phase 1: Proof of Concept (2-3 days)

- Set up `apps/videos` workspace with Remotion
- Create one composition: a 60-second "Getting Started for Exhibitors" video
- Use static screenshots (manually captured), simple text overlays, background music
- Render locally via CLI
- Deliverable: One MP4 demonstrating the approach works

### Phase 2: Template System (3-5 days)

- Build reusable component library: highlight rings, callout boxes, animated cursors, caption overlays, transition wipes
- Create parameterized composition that accepts role + screenshot set + narration audio
- Integrate narration audio (pre-recorded or TTS-generated)
- Deliverable: Template that produces exhibitor/secretary/judge variants from different inputs

### Phase 3: Automated Pipeline (3-5 days)

- Playwright script to capture screenshots of key myK9Show screens
- GitHub Actions workflow: capture screenshots, render videos, upload to storage
- Wire up Turborepo task for local rendering
- Deliverable: `pnpm render:videos` produces all tutorial videos from current UI state

### Total: ~2-3 weeks for a production-ready pipeline

This is a meaningful investment, but the ongoing maintenance cost drops dramatically. When the UI changes, you update screenshots (or let Playwright do it) and re-render. No video editing software, no re-recording, no re-uploading manually.

---

## Next Steps

1. **Confirm licensing.** Contact Remotion (hi@remotion.dev) or check remotion.pro for company license pricing. This is the gate decision.
2. **Build Phase 1 PoC.** Scaffold `apps/videos`, create one simple composition, validate the developer experience.
3. **Evaluate narration approach.** Test OpenAI TTS or ElevenLabs for generating voiceover audio programmatically. Compare quality to manual recording.
4. **Monitor Remotion 5.0.** License terms are changing. Review before committing to production use.
5. **Consider Remotion Player.** If helpful, embed the Player component in myK9Show itself for in-app tutorial playback (no MP4 download needed).

---

## References

- Remotion docs: https://remotion.dev/docs
- Remotion licensing: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- Remotion pricing: https://remotion.pro
- Remotion Recorder: https://remotion.dev/docs/recorder
- Motion Canvas: https://github.com/motion-canvas/motion-canvas
- Manim: https://github.com/3b1b/manim
