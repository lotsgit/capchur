# Capchur Browser Extension

Capchur captures supported actions on HTTP(S) pages after the user grants optional recording access to websites. Recording state and accepted steps are persisted by the background worker.

## Supported Browsers

- Chrome and Edge use the Chromium Manifest V3 build in `.output/chrome-mv3`.
- Firefox uses the build in `.output/firefox-mv2`.

Build both targets from the repository root:

```powershell
corepack pnpm run install:extension-browsers
corepack pnpm run build:extension:browsers
corepack pnpm --filter @capchur/extension test:browser
```

The Edge E2E target uses the locally installed stable Microsoft Edge channel.

Create both store archives with `corepack pnpm run zip:extension:browsers`.

## Capture Behavior

- Clicks, committed text-input changes, selections, and form submissions are captured without field values.
- SPA route changes and controls added after page load are handled by the delegated listeners.
- Start or resume recording to grant optional website access. This allows interactions and screenshots to continue across tabs, origins, and separate web popup windows. Denying access leaves the current session intact.
- Same-origin open shadow roots and permitted frames are supported.
- Opening a native select starts a short-lived screenshot candidate while its menu is visible. The image is retained only when a selection is committed and otherwise expires without being stored.
- Dwelling briefly over an open ARIA option or menu item prepares the same short-lived candidate. On click, an inert visual copy of the open menu remains until capture completes, allowing application-rendered dropdowns such as Dynamics 365 lookups to survive delayed browser screenshot processing.
- Browser permission/file dialogs, password/payment fields, canvas/WebGL surfaces, protected browser pages, closed shadow roots, and inaccessible cross-origin frames are skipped. The popup explains these limits and recording continues.

See [../../docs/BROWSER_COMPATIBILITY.md](../../docs/BROWSER_COMPATIBILITY.md) for the validation matrix.
