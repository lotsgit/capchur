# Capchur Browser Extension

Capchur captures supported actions on HTTP(S) pages after the user grants access to the active origin. Recording state and accepted steps are persisted by the background worker.

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
- Use **Enable this tab** after moving to a new tab or origin. Denying access leaves the current session intact.
- Same-origin open shadow roots and permitted frames are supported.
- Password/payment fields, canvas/WebGL surfaces, protected browser pages, closed shadow roots, and inaccessible cross-origin frames are skipped. The popup explains these limits and recording continues.

See [../../docs/BROWSER_COMPATIBILITY.md](../../docs/BROWSER_COMPATIBILITY.md) for the validation matrix.
