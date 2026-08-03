# Capchur Development Playbook

This is the global reference for developing Capchur across separate VS Code and Copilot sessions. It combines the product roadmap, architecture, command sequence, acceptance criteria, and progress tracker.

Every contributor and coding agent must read the **Current State**, **Architecture Rules**, and active session before generating code. Update this document when a session changes architecture, contracts, setup, commands, or milestone status.

## How To Use This Document

You do not need coding experience to follow this process.

1. Open the `Capchur` folder in VS Code.
2. Open this file and find the first session marked `NEXT`.
3. Run the commands listed under **Start Every Coding Session**.
4. Ask Copilot to complete only that session, using the supplied prompt.
5. Test the acceptance checklist yourself.
6. Run the commands under **Finish Every Coding Session**.
7. Change the session status only after all acceptance checks pass.

Use these status words consistently:

- `DONE`: implemented, tested, and committed.
- `NEXT`: the only planned session that should begin now.
- `BLOCKED`: cannot continue; record the reason in **Decision Log**.
- `PLANNED`: intentionally not started.

Do not mark a session `DONE` because code exists. Its acceptance checks and validation commands must pass.

## Current State

**Current milestone:** `S07 - Local session review`

**Current repository status:** Runtime-validated contracts, persistent recording state, popup controls, pure element analysis, approved-page click capture, and visible-tab screenshots are implemented with focused Vitest coverage. Accepted steps persist before throttled screenshot capture, PNG pixels are stored separately in IndexedDB, and editable highlights are converted from viewport CSS coordinates using actual screenshot dimensions while retaining viewport, scroll, zoom, visual viewport, and DPR metadata.

**Last completed session:** `S06 - Screenshots and highlights`

**Next action:** Complete S07 only. Add a local session review surface for inspecting and editing persisted steps and screenshots.

## Product Goal

Capchur records a user's browser workflow and turns it into an editable guide containing:

- A sequence of meaningful user actions.
- Automatically generated step descriptions.
- A screenshot for each action.
- A movable highlight around the target element.
- Editing, reordering, deletion, cropping, and redaction.
- Private sharing and team collaboration.
- HTML, Markdown, PDF, and DOCX exports.

The first releasable milestone is narrower: record five browser clicks, retain them after reload, show accurate descriptions and highlights, edit the guide, and export it.

## System Architecture

```mermaid
flowchart LR
    Page[Web page] -->|DOM events| Content[Extension content script]
    Content -->|Validated messages| Worker[MV3 service worker]
    Worker -->|State| Local[(Extension storage)]
    Worker -->|Visible viewport| Shot[Screenshot capture]
    Worker -->|Authenticated API| API[Next.js server boundary]
    API --> DB[(PostgreSQL)]
    API --> Objects[(S3-compatible storage)]
    API --> Jobs[Export and AI jobs]
    DB --> Editor[Next.js guide editor]
    Objects --> Editor
    Editor --> Export[HTML / Markdown / PDF / DOCX]
```

### Repository Ownership

| Location                       | Owns                                                                                     | Must not own                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/extension`               | Browser events, permissions, extension lifecycle, screenshots, local queue, extension UI | Database implementation, server secrets, web editor components |
| `apps/web`                     | Guide editor, trusted API boundaries, authentication, server workflows                   | Browser extension APIs or content-script implementation        |
| `packages/contracts`           | Versioned messages and data exchanged between processes/apps                             | Browser, React, database, or framework implementation          |
| Future `packages/capture-core` | Pure element analysis and description rules                                              | DOM event registration or extension APIs                       |
| Future `packages/export-core`  | Pure guide-to-document transformations                                                   | UI, authentication, or storage clients                         |

Dependencies flow from applications toward shared packages. An application must never import code from another application.

### End-To-End Data Flow

1. The popup asks the service worker to start a recording session.
2. The service worker persists recording state before replying.
3. The content script observes supported user actions only while recording.
4. Pure capture logic converts an untrusted DOM element into sanitized metadata.
5. The content script sends a validated, versioned message to the service worker.
6. The service worker captures the visible tab and stores the step atomically.
7. Local steps upload through an authenticated API when cloud sync is available.
8. The web editor loads guide data through its server boundary.
9. Export logic consumes the same guide contract used by the editor.

## Architecture Rules

These rules apply to every development session.

1. **Contract first:** Define or update shared data and message contracts before changing producers and consumers. Update both sides in the same session.
2. **Validate boundaries:** Page DOM, extension messages, storage, URLs, API input, imported files, and AI output are untrusted.
3. **Persist important state:** Never rely on Manifest V3 service-worker memory. Recording state and accepted steps must survive suspension.
4. **Separate logic from frameworks:** Element naming, selector generation, guide transformations, and export mapping should be pure functions with tests.
5. **Store annotations separately:** Keep screenshots unchanged. Store highlight rectangles, crop settings, and redactions as metadata until export.
6. **Minimize permissions:** Add a browser permission only in the session that needs it, document why, and test denied permission behavior.
7. **Protect sensitive data:** Never capture password values, payment values, secrets, authentication data, or full private page payloads in logs.
8. **Keep server secrets server-side:** API keys, database credentials, and storage credentials must never enter extension or client bundles.
9. **No silent failures:** User-facing flows require loading, empty, error, denied, and retry states.
10. **No isolated feature completion:** A cross-boundary feature is complete only when its contract, producer, consumer, tests, documentation, and migration impact are handled together.

## Technology Baseline

Do not replace these choices without recording an architecture decision.

- Workspace: pnpm 11 through `corepack pnpm`.
- Language: strict TypeScript.
- Extension: WXT, React, Manifest V3, WebExtension APIs.
- Web: Next.js App Router, React, Tailwind CSS.
- Shared validation: choose and add one schema library in S01; use inferred TypeScript types from schemas at runtime boundaries.
- Unit tests: Vitest.
- Browser and workflow tests: Playwright.
- Database phase: PostgreSQL with Drizzle ORM unless an architecture decision changes it.
- Object storage phase: S3-compatible storage with development adapter.
- Background jobs phase: a durable queue, introduced only when exports or AI need it.

## Commands

Run all commands from the repository root, `D:\BizLeader\AI\Capchur`.

### One-Time Setup On A New Computer

Open one VS Code PowerShell terminal and run these commands in order:

```powershell
node --version
corepack --version
git --version
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
```

Expected minimum Node version: 22. Do not use `npm install`, create nested lockfiles, or run forceful audit fixes.

### Start Every Coding Session

Use a new Copilot chat for one roadmap session. In the VS Code terminal, run:

```powershell
git status --short
git pull --ff-only
corepack pnpm install --frozen-lockfile
corepack pnpm run typecheck
corepack pnpm run lint
```

If `git status --short` shows files you do not recognize, stop and ask Copilot to inspect them. Do not delete or reset them.

Copy this message into the new Copilot chat, replacing `SXX`:

```text
Read .github/copilot-instructions.md and docs/DEVELOPMENT_PLAYBOOK.md first.
Implement only session SXX from the playbook. Respect repository ownership and
contract-first rules. Update tests and the playbook progress/decision log. Run
the required validation, but do not commit until I ask.
```

### Run Both Applications

Keep these in two separate VS Code terminals while manually testing.

**Terminal 1 - web editor:**

```powershell
corepack pnpm run dev:web
```

Open http://localhost:3000.

**Terminal 2 - browser extension:**

```powershell
corepack pnpm run dev:extension
```

WXT opens a development Chrome profile. Its development server uses http://localhost:3001. Test the extension in the Chrome profile WXT opens, not your normal browser profile.

Stop a running development server by clicking its terminal and pressing `Ctrl+C` once.

### Finish Every Coding Session

Run these in order:

```powershell
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
git status --short
git diff --stat
```

For dependency changes, also run:

```powershell
corepack pnpm audit --audit-level high
```

An audit finding is not permission to run `--force`. Record unresolved findings in **Known Risks**.

After the acceptance checks pass, ask Copilot:

```text
Update docs/DEVELOPMENT_PLAYBOOK.md to mark the active session DONE and the next
session NEXT. Summarize validation and inspect the staged files for secrets or
generated output. Then commit this session with a concise conventional commit.
```

Do not push unless a remote repository has been configured and you intend to publish the work.

## Development Roadmap

### S00 - Workspace Setup

**Status:** `DONE`

**Outcome:** Runnable WXT extension, Next.js app, shared package, pnpm workspace, VS Code tasks, and root Git repository.

**Evidence:** Commit `d7a0774` (`chore: scaffold Capchur workspace`).

### S01 - Test And Contract Foundation

**Status:** `DONE`

**Goal:** Establish versioned runtime-validated contracts and focused test infrastructure before browser behavior is added.

**Tasks:**

- [x] Add one runtime schema library to `packages/contracts`.
- [x] Define schemas and inferred types for recording session, step, element metadata, viewport, screenshot metadata, and highlight metadata.
- [x] Define versioned request, response, and event message schemas.
- [x] Add Vitest to contracts and extension packages.
- [x] Test valid and invalid messages and sensitive-field rejection rules.
- [x] Add root `test` and focused package test scripts.
- [x] Update this playbook if actual commands differ.

**Acceptance:** Invalid messages are rejected at runtime; shared types compile in both apps; tests fail when a required contract field is removed.

**Validation evidence:** Contracts tests passed (9), extension tests passed (2), typecheck passed across contracts and both applications, lint passed, and both production builds passed. The required dependency audit ran and reported the existing toolchain advisories recorded under **Known Risks**.

### S02 - Recording State Machine

**Status:** `DONE`

**Goal:** Start, stop, resume, query, and clear a recording session without relying on service-worker memory.

**Tasks:**

- [x] Implement a pure recording state machine.
- [x] Add storage adapter around extension storage.
- [x] Handle typed start, stop, resume, status, and clear messages in the service worker.
- [x] Persist state before acknowledging commands.
- [x] Test service-worker restart and corrupted storage recovery.

**Acceptance:** Start recording, reload the extension, and observe the same recording state; clear requires explicit user action.

**Validation evidence:** Extension tests passed (6), including simulated service-worker restart, corrupted storage recovery, and mismatched clear protection. All 15 workspace tests, typecheck, lint, and production builds passed. The emitted MV3 manifest contains the required `storage` permission.

### S03 - Popup Recording Controls

**Status:** `DONE`

**Goal:** Replace starter popup UI with accessible controls connected to S02.

**Tasks:**

- [x] Build start, stop, resume, clear, and open-session commands.
- [x] Show recording status, duration, and step count.
- [x] Add loading, permission-denied, unavailable-page, and error states.
- [x] Remove generated WXT/React demo assets and styles.

**Acceptance:** Keyboard-only users can control recording; reopening the popup reflects persisted state.

**Validation evidence:** All 21 workspace tests passed, including six focused popup command, response-validation, page-availability, and duration tests. Repository typecheck, lint, and production builds passed. The emitted MV3 manifest contains only the required `activeTab` and `storage` permissions, and the popup uses native keyboard controls with visible focus states and live status/error announcements.

### S04 - Element Analysis Core

**Status:** `DONE`

**Goal:** Convert a DOM target into safe, useful metadata and a deterministic description.

**Tasks:**

- [x] Add `packages/capture-core` with pure element naming and selector logic.
- [x] Prioritize accessible name, label, text, alternative text, title, placeholder, and nearby context.
- [x] Generate multiple locator candidates without exposing them in descriptions.
- [x] Detect sensitive and unsupported elements.
- [x] Test native controls, ARIA controls, nested targets, shadow DOM paths, and missing labels.

**Acceptance:** Fixtures produce descriptions such as `Click the Save button`; passwords and sensitive values are excluded.

**Validation evidence:** All 36 workspace tests passed, including 15 capture-core fixtures for naming priority, native and ARIA controls, nested targets, deterministic locator candidates, open shadow roots, unlabeled controls, and privacy rejection. Repository typecheck, lint, and production builds passed. The dependency audit reported only the existing toolchain advisories recorded under **Known Risks**.

### S05 - Click Capture Pipeline

**Status:** `DONE`

**Goal:** Capture supported clicks from ordinary HTTP(S) pages and persist steps through validated messages.

**Tasks:**

- [x] Request the minimum host access when recording starts.
- [x] Register content scripts for approved HTTP(S) pages.
- [x] Listen in capture phase and use `event.composedPath()`.
- [x] Ignore extension UI, duplicate events, hidden targets, and unsupported pages.
- [x] Send only schema-validated metadata to the service worker.

**Acceptance:** Five clicks produce five ordered persisted steps; no events are captured while stopped.

**Validation evidence:** All 43 workspace tests passed, including composed-path targeting, hidden and extension-owned target rejection, duplicate listener prevention, sender URL validation, five-step ordering, persistence, and stopped-state gating. Repository typecheck, lint, and production builds passed. The emitted MV3 manifest contains `activeTab`, `scripting`, and `storage`, with HTTP(S) host access optional; the dependency audit reports the existing advisories under **Known Risks**.

### S06 - Screenshots And Highlights

**Status:** `DONE`

**Goal:** Attach an accurate visible-tab screenshot and editable highlight metadata to every accepted step.

**Tasks:**

- [x] Capture through the service worker with rate limiting.
- [x] Store viewport, scroll, zoom, visual viewport, and device pixel ratio.
- [x] Convert CSS coordinates to screenshot coordinates.
- [x] Keep screenshot pixels separate from highlight metadata.
- [x] Handle capture failure without losing the underlying step.

**Acceptance:** Highlights align at 100%, 125%, and 150% browser zoom and after scrolling.

**Validation evidence:** All 53 workspace tests passed, including actual-PNG dimension parsing, 100%, 125%, and 150% zoom conversion, scrolled and offset visual viewports, clipping, capture throttling, separate image storage, successful step enrichment, and screenshot-failure fallback. Repository typecheck, lint, and production builds passed with no permission or dependency changes.

### S07 - Local Session Review

**Status:** `NEXT`

**Goal:** Let users inspect, rename, delete, and reorder captured steps before cloud work begins.

**Tasks:**

- [ ] Add an extension review page or approved local handoff surface.
- [ ] Display screenshot, description, timestamp, and target highlight.
- [ ] Support edit, delete, reorder, retry screenshot, and clear.
- [ ] Add session JSON export/import for debugging and recovery.

**Acceptance:** A five-step session survives browser restart and can be edited and exported as valid JSON.

### S08 - Web Guide Editor Foundation

**Status:** `PLANNED`

**Goal:** Replace the Next.js starter with a responsive guide editor using shared guide contracts.

**Tasks:**

- [ ] Define guide domain model separately from capture transport.
- [ ] Build guide navigation, step list, selected-step editor, and media canvas.
- [ ] Support local fixture loading before live API integration.
- [ ] Include loading, empty, error, and unsaved states.
- [ ] Add component and workflow tests.

**Acceptance:** A fixture guide can be reordered and edited on desktop and mobile without layout overlap.

### S09 - Database, Object Storage, And API

**Status:** `PLANNED`

**Goal:** Persist guides and images behind trusted server boundaries.

**Tasks:**

- [ ] Add PostgreSQL and Drizzle schema with migrations.
- [ ] Add local development storage and S3-compatible production adapter.
- [ ] Define authenticated guide/session API routes with runtime validation.
- [ ] Use signed upload/download flows rather than exposing credentials.
- [ ] Add integration tests for authorization and transaction failures.

**Acceptance:** Create, read, update, and delete a guide; restart services; data and images remain consistent.

### S10 - Authentication And Workspaces

**Status:** `PLANNED`

**Goal:** Add users, sessions, workspaces, and ownership authorization.

**Tasks:**

- [ ] Record an architecture decision for the selected auth provider/library.
- [ ] Implement sign-in, sign-out, session expiry, and protected routes.
- [ ] Add workspace owner/member roles.
- [ ] Enforce authorization on every server mutation and object access.

**Acceptance:** One user cannot access another workspace by changing a URL or request ID.

### S11 - Extension Authentication And Sync

**Status:** `PLANNED`

**Goal:** Securely upload local sessions and open them in the web editor.

**Tasks:**

- [ ] Authenticate the extension without storing long-lived secrets in page context.
- [ ] Add resumable upload queue and idempotency keys.
- [ ] Map local session IDs to server guide IDs.
- [ ] Add offline, retry, conflict, expired-session, and partial-upload handling.

**Acceptance:** Record offline, reconnect, upload once, and open the correct guide in the editor.

### S12 - Complete Editing And Privacy Tools

**Status:** `PLANNED`

**Goal:** Deliver expected guide editing tools with safe image handling.

**Tasks:**

- [ ] Add manual steps, duplicate, crop, zoom, and annotation controls.
- [ ] Add movable/resizable highlights.
- [ ] Add irreversible export redaction and editable source redaction metadata.
- [ ] Add title, introduction, section, and branding controls.
- [ ] Add undo/redo and autosave conflict handling.

**Acceptance:** Users can produce a polished guide without editing raw JSON or images externally.

### S13 - HTML And Markdown Export

**Status:** `PLANNED`

**Goal:** Establish a tested, framework-independent export model.

**Tasks:**

- [ ] Add `packages/export-core`.
- [ ] Map guide contracts into an export document model.
- [ ] Generate accessible HTML and portable Markdown bundles.
- [ ] Test escaping, image references, ordering, and redactions.

**Acceptance:** Exported documents preserve order, descriptions, images, highlights, and redactions.

### S14 - PDF And DOCX Export

**Status:** `PLANNED`

**Goal:** Generate professional PDF and Word documents through background jobs.

**Tasks:**

- [ ] Add PDF rendering with Playwright.
- [ ] Add DOCX generation from the export model.
- [ ] Add durable job status, retry, cancellation, and expiration.
- [ ] Verify page breaks, image scaling, fonts, links, and large guides.

**Acceptance:** A 50-step guide exports to valid PDF and DOCX without clipped text or missing images.

### S15 - AI Description Enhancement

**Status:** `PLANNED`

**Goal:** Improve deterministic descriptions without making AI required for recording.

**Tasks:**

- [ ] Define sanitized AI input and structured output schemas.
- [ ] Keep provider calls on the server.
- [ ] Add opt-in controls, timeout, fallback, rate limiting, and cost tracking.
- [ ] Prevent page instructions from controlling prompts or tools.
- [ ] Test that deterministic descriptions remain available during provider failure.

**Acceptance:** AI improves ambiguous text but never receives secrets, full DOM payloads, or password/payment values.

### S16 - Sharing, Collaboration, And History

**Status:** `PLANNED`

**Goal:** Add controlled sharing and team workflows.

**Tasks:**

- [ ] Add private, workspace, and revocable-link sharing.
- [ ] Add comments and version history.
- [ ] Add optimistic concurrency or explicit conflict resolution.
- [ ] Add audit events for sensitive workspace actions.

**Acceptance:** Revoked links stop working immediately; simultaneous edits do not silently overwrite data.

### S17 - Capture Hardening And Cross-Browser Support

**Status:** `PLANNED`

**Goal:** Handle real-world browser complexity and package Chrome, Edge, and Firefox builds.

**Tasks:**

- [ ] Test navigation, multiple tabs, iframes, shadow DOM, SPAs, and delayed DOM updates.
- [ ] Define explicit behavior for canvas/WebGL and protected browser pages.
- [ ] Add input/select/submit support with privacy-safe value handling.
- [ ] Run automated extension E2E tests across supported browsers.
- [ ] Verify permission prompts and denied states.

**Acceptance:** Supported workflows pass the compatibility matrix; unsupported contexts explain limitations without data loss.

### S18 - Security, Reliability, And Release

**Status:** `PLANNED`

**Goal:** Prepare a production release with evidence.

**Tasks:**

- [ ] Threat-model extension, API, storage, sharing, exports, and AI boundaries.
- [ ] Resolve or formally accept high/critical dependency advisories.
- [ ] Add retention, deletion, backup, restore, observability, and incident procedures.
- [ ] Complete accessibility and performance checks.
- [ ] Prepare privacy policy, store listing, permission explanations, and release packages.
- [ ] Run clean-machine installation and full end-to-end release rehearsal.

**Acceptance:** Release checklist passes with no unexplained high-risk finding and documented rollback procedure.

## Progress Summary

| Session                | Status  | Commit / evidence | Notes                                                            |
| ---------------------- | ------- | ----------------- | ---------------------------------------------------------------- |
| S00 Workspace setup    | DONE    | `d7a0774`         | Baseline apps build successfully.                                |
| S01 Test and contracts | DONE    | This commit       | Runtime contracts and focused tests passed.                      |
| S02 Recording state    | DONE    | This commit       | Persistent commands and restart recovery passed.                 |
| S03 Popup controls     | DONE    | This commit       | Persisted controls and popup states passed.                      |
| S04 Element analysis   | DONE    | This commit       | Deterministic privacy-safe metadata and locator fixtures passed. |
| S05 Click capture      | DONE    | This commit       | Five ordered clicks persist through a validated sender boundary. |
| S06 Screenshots        | DONE    | This commit       | Throttled screenshots and pixel-aligned metadata passed.         |
| S07 Local review       | NEXT    | -                 | MVP capture checkpoint.                                          |
| S08 Web editor         | PLANNED | -                 | Can use fixtures after guide contract exists.                    |
| S09 Persistence API    | PLANNED | -                 | Depends on S08 model.                                            |
| S10 Authentication     | PLANNED | -                 | Required before cloud sync.                                      |
| S11 Extension sync     | PLANNED | -                 | Depends on S09 and S10.                                          |
| S12 Complete editing   | PLANNED | -                 | Depends on cloud editor.                                         |
| S13 HTML/Markdown      | PLANNED | -                 | Establishes export model.                                        |
| S14 PDF/DOCX           | PLANNED | -                 | Depends on S13.                                                  |
| S15 AI descriptions    | PLANNED | -                 | Deterministic fallback required.                                 |
| S16 Collaboration      | PLANNED | -                 | Depends on authorization.                                        |
| S17 Hardening          | PLANNED | -                 | Cross-browser evidence.                                          |
| S18 Release            | PLANNED | -                 | Final gate.                                                      |

## Decision Log

Record decisions that affect more than one module or future session. Do not silently rewrite previous entries; add a superseding entry.

| Date       | Decision                                                                                                            | Reason                                                                                                                                                       | Consequences                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-31 | Use a pnpm monorepo with WXT, Next.js, and shared contracts.                                                        | Keeps browser capture and web concerns separate while sharing wire types.                                                                                    | Run commands from root; no application-to-application imports.                                                                                                           |
| 2026-07-31 | Use action-based visible-tab screenshots with separate annotation metadata.                                         | Browser API and editability constraints favor one screenshot per accepted action.                                                                            | Continuous video and native desktop capture are outside the initial scope.                                                                                               |
| 2026-07-31 | Build deterministic element descriptions before AI enhancement.                                                     | Improves privacy, cost, reliability, and offline behavior.                                                                                                   | AI work waits until S15 and always has a deterministic fallback.                                                                                                         |
| 2026-08-03 | Use Zod 4 for shared runtime contracts and infer TypeScript types from strict schemas.                              | Zod provides runtime boundary validation while keeping wire schemas and static types in one owner package.                                                   | Producers and consumers import contracts from `@capchur/contracts`; unknown message and metadata fields are rejected.                                                    |
| 2026-08-03 | Persist the active recording session under one validated `storage.local` key and serialize service-worker commands. | MV3 workers can suspend at any time, and concurrent commands must not overwrite newer state.                                                                 | Commands load from storage, persist before replying, and delete invalid stored data during recovery; starting never replaces an existing session.                        |
| 2026-08-03 | Use `activeTab` for popup page-availability checks without requesting host patterns.                                | The popup must distinguish recordable websites from protected pages while preserving least privilege before capture begins.                                  | Access is temporary and user-invoked; broader host access remains deferred to S05.                                                                                       |
| 2026-08-03 | Keep DOM element analysis in a pure shared package and return no metadata for sensitive or unsupported targets.     | Capture descriptions and locators need deterministic tests and must not expose password or payment fields across extension boundaries.                       | S05 consumes a discriminated analysis result; locator candidates remain metadata and never appear in user-facing descriptions.                                           |
| 2026-08-03 | Request optional access for only the active HTTP(S) hostname and keep persistence fields worker-owned.              | Click capture must start on the current page without permanent broad host access, and page context cannot be trusted to assign session identity or ordering. | The popup injects the registered script after permission is granted; the worker verifies the sender URL, assigns IDs and sequence numbers, and persists before replying. |
| 2026-08-03 | Upgrade WXT and pin vulnerable transitive dependencies at the pnpm workspace boundary.                              | Current stable Next and WXT dependency ranges still resolve known vulnerable PostCSS, Sharp, shell-quote, and adm-zip releases.                              | Reassess and remove each override when upstream stable ranges include the patched release; validate Chrome, Firefox, and Next image processing after dependency changes. |
| 2026-08-03 | Store screenshot PNG blobs in extension IndexedDB and derive highlight pixels from each image's actual dimensions.     | Large image pixels do not belong in the validated session metadata key, and browser zoom or DPR assumptions alone cannot guarantee overlay alignment.         | Steps retain an IndexedDB storage key and screenshot-space annotation; S07 must load images through the screenshot storage boundary and keep annotations independently editable. |

## Known Risks

| Risk                                                                                                                                | Status                   | Planned treatment                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 2026-08-03 audit reports one low-severity esbuild advisory affecting local Windows development servers through WXT/Vite/Vitest. | Open                     | Keep development servers bound to localhost and adopt esbuild 0.28.1 or later when parent tool ranges support it; do not force an unsupported 0.x override. |
| Browser extensions cannot inspect native desktop applications or protected browser pages.                                           | Accepted for browser MVP | Explain unsupported pages in S03/S17; evaluate a separate desktop recorder only after browser release.                                                      |
| Canvas/WebGL applications provide weak semantic element data.                                                                       | Open                     | Define fallback behavior and possible OCR investigation in S17.                                                                                             |
| Cross-origin frames and closed shadow roots limit DOM access.                                                                       | Open                     | Test and document explicit behavior in S17 without broadening permissions unnecessarily.                                                                    |

## Session Completion Record

Append one concise row whenever a roadmap session is completed.

| Date       | Session | Summary                                                                                                                                               | Validation                                                                                                                          | Commit      |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 2026-07-31 | S00     | Created workspace, extension, web app, contracts package, VS Code tasks, and root documentation.                                                      | Typecheck, lint, and build passed at setup.                                                                                         | `d7a0774`   |
| 2026-08-03 | S01     | Added strict versioned runtime contracts, inferred shared types, application contract boundaries, and focused tests.                                  | 11 tests, typecheck, lint, and production builds passed; audit findings recorded as known risks.                                    | This commit |
| 2026-08-03 | S02     | Added a pure recording state machine, validated extension storage adapter, and serialized service-worker command handling.                            | 15 tests, typecheck, lint, and production builds passed; restart and corrupted-state recovery covered.                              | This commit |
| 2026-08-03 | S03     | Replaced the starter popup with accessible persisted recording controls, status metrics, and explicit unavailable, denied, loading, and error states. | 21 tests, typecheck, lint, and production builds passed; emitted permissions inspected.                                             | This commit |
| 2026-08-03 | S04     | Added pure element naming, descriptions, locator candidates, shadow paths, and explicit privacy and support rejection.                                | 36 tests, typecheck, lint, and production builds passed; existing audit findings remain recorded.                                   | This commit |
| 2026-08-03 | S05     | Added optional-origin click capture, composed-path element analysis, strict capture messages, sender validation, and ordered worker persistence.      | 43 tests, typecheck, lint, and production builds passed; emitted permissions inspected and existing audit findings remain recorded. | This commit |
| 2026-08-03 | S06     | Added throttled active-tab PNG capture, separate IndexedDB image storage, actual-image coordinate conversion, and durable failure fallback.             | 53 tests, typecheck, lint, and production builds passed; zoom, scrolling, clipping, rate limiting, and capture failure covered.      | This commit |

## Scope Changes

When a new feature is requested:

1. Identify which existing session owns it.
2. Add it to that session if it preserves the architecture and acceptance criteria.
3. Create a new session only when it represents a distinct testable milestone.
4. Record any cross-cutting architecture decision in **Decision Log**.
5. Keep exactly one session marked `NEXT`.

Do not move a convenient UI task earlier when its contract, security boundary, or persistence dependency is not ready.
