# Browser Compatibility

S17 supports Capchur recording in current Chrome, Edge, and Firefox 140 or later. Chrome and Edge consume the same Chromium Manifest V3 package; Firefox has a separate WXT package with built-in data collection consent metadata.

## Compatibility Matrix

| Workflow                                    | Chrome                                               | Edge                                    | Firefox                                 | Automated evidence                                                   |
| ------------------------------------------- | ---------------------------------------------------- | --------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Start, stop, resume, and persisted recovery | Supported                                            | Supported                               | Supported                               | Recording-state and message tests                                    |
| Click, input, select, and submit            | Supported                                            | Supported                               | Supported                               | DOM dispatch and worker persistence tests                            |
| SPA navigation and delayed DOM updates      | Supported                                            | Supported                               | Supported                               | Delegated-listener tests with `history.pushState` and late insertion |
| Multiple tabs, origins, or web popup windows | Supported after optional website access is granted   | Supported                               | Supported                               | Permission tests and packaged Chromium screenshot E2E                |
| Open shadow DOM                             | Supported                                            | Supported                               | Supported                               | Composed-path and shadow-locator tests                               |
| Same-origin iframe                          | Supported when origin access is granted              | Supported when origin access is granted | Supported when origin access is granted | All-frame manifest/build validation                                  |
| Cross-origin iframe                         | Supported after optional website access is granted    | Same                                    | Same                                    | All-frame manifest/build validation                                  |
| Native select menu                          | Pre-selection screenshot retained on committed change | Same                                    | Same                                    | Content/worker tests and packaged Chromium screenshot E2E            |
| ARIA listbox/menu dropdown                  | Dwell candidate plus visual retention on matching click | Same                                    | Same                                    | Dynamics-style DOM tests and packaged Chromium pixel assertion       |
| Browser permission/file/system dialogs      | Not captured                                          | Not captured                            | Not captured                            | Browser-owned UI is outside visible-tab capture                      |
| Canvas/WebGL semantic actions               | Not captured                                         | Not captured                            | Not captured                            | Unsupported-element tests and popup limitation state                 |
| Protected browser/extension pages           | Not captured                                         | Not captured                            | Not captured                            | URL classification tests and disabled controls                       |

## Privacy And Recovery

Input and selected values are never read or included in capture messages. Opening a native select or dwelling over an ARIA option/menu item prepares one in-memory screenshot for at most 10 seconds; it is written to IndexedDB only if the matching action commits. Password and payment-related fields are rejected before metadata is produced. A denied permission request or unsupported action does not stop, clear, or replace the persisted recording session.

## Validation

Run from the repository root:

```powershell
corepack pnpm run install:extension-browsers
corepack pnpm run test
corepack pnpm --filter @capchur/extension test:browser
corepack pnpm --filter @capchur/extension test:screenshot:chromium
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build:extension:browsers
```

Inspect `.output/chrome-mv3/manifest.json` and `.output/firefox-mv2/manifest.json` to confirm only the documented required and optional permissions are emitted. Manual release rehearsal in installed Chrome, Edge, and Firefox remains part of S18.
