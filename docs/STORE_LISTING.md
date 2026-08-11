# Browser Store Submission Pack

This document contains release-owner copy and selections for Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons (AMO). Verify every answer against the submitted package and the live policy at `https://capchur.io/privacy` before submission.

## Shared Product Details

| Field | Submission value |
| --- | --- |
| Name | Capchur - Workflow Guide Recorder |
| Category | Productivity |
| Default language | English |
| Homepage | `https://capchur.io` |
| Support URL | `https://capchur.io/help` |
| Support email | `support@capchur.io` |
| Privacy policy | `https://capchur.io/privacy` |
| Version | `0.1.0` |
| Mature content | No |
| Payment required | No for release 0.1; a free Capchur account is required for cloud sync and web editing |

**Single purpose:** Record user-initiated browser workflows and turn them into editable visual guides in the user's Capchur workspace.

**Short description:** Record browser workflows and turn them into editable, privacy-aware visual guides.

**Detailed description:**

> Capchur turns browser workflows into clear, editable visual guides. Start a recording from the extension, perform the workflow, and Capchur captures supported actions with visible-tab screenshots only while recording is active.
>
> Review steps locally before syncing them to your authenticated Capchur workspace. In the web editor you can rename and reorder steps, crop screenshots, add highlights, apply redactions, collaborate through controlled workspace access or revocable links, and export guides as HTML, Markdown, PDF, or DOCX.
>
> Capchur is designed around user control and data minimization. It requests site access only when you enable recording for an HTTP(S) site. Typed and selected values are not included in action payloads, and password and payment fields are rejected. Recording can be stopped at any time. Protected browser pages and other unsupported surfaces are skipped without discarding the session.
>
> A free Capchur account is required to sync recordings and use the web editor. Local review and deletion are available before sync.

## Permission Justifications

| Permission | Store explanation |
| --- | --- |
| `activeTab` | Identifies and captures only the tab where the user explicitly starts or resumes recording. |
| `scripting` | Installs the recorder after the user grants access to the active site and restores it after supported navigation. |
| `storage` | Persists recording state, local steps, review edits, screenshots, and the resumable sync queue across browser or service-worker restarts. |
| `identity` | Opens the browser-managed authorization flow used to connect the extension to the user's Capchur workspace. |
| `alarms` | Retries interrupted authenticated synchronization after service-worker suspension or a temporary network failure. |
| `https://capchur.io/*` | Connects to the Capchur web application for authorization, sync, and opening the corresponding guide. |
| Optional `http://*/*` and `https://*/*` | Requests access only to the current site when the user starts recording. These origins are optional and are not silently granted at installation. |

**Remote code declaration:** No. The extension does not download or execute remotely hosted code. Network requests exchange data with `https://capchur.io`; all executable extension code is packaged in the submitted archive.

## User Data Disclosures

Select the store categories equivalent to the following and do not select categories marked **No**.

| Data category | Collect? | Explanation |
| --- | --- | --- |
| Personally identifiable information | Yes | Name, email address, and workspace identity are processed when the user connects a Capchur account. |
| Authentication information | Yes | Capchur's own expiring workspace credential is stored for authenticated sync. Page passwords are never collected. |
| Web history / browsing activity | Yes | Page URL and title are recorded only for a user-started workflow. |
| User activity / website activity | Yes | Supported clicks, committed input/select actions without values, and form submissions are recorded while recording is active. |
| Website content | Yes | Privacy-filtered element labels, geometry, and visible-tab screenshots are used to build the guide. |
| Financial and payment information | No | Payment-field values are rejected. |
| Health information | No | Not intentionally collected. Users control the sites they record and should not record sensitive content. |
| Personal communications | No | Capchur does not provide or monitor messaging and does not intentionally collect communications. |
| Location | No | Capchur does not request location permission or intentionally collect precise location. |

Certify only after verifying the live policy and package behavior:

- Data is used only to provide or improve Capchur's single purpose.
- Data is not sold or transferred for advertising, credit, or unrelated purposes.
- Data is not used for personalized advertising.
- Human access is limited to cases permitted by store policy, such as support, security, legal compliance, or user-authorized access.

## Chrome Web Store

**Package:** `apps/extension/.output/capchurextension-0.1.0-chrome.zip`

1. **Store Listing:** use the shared product copy, Productivity category, English language, icon, screenshots, and promotional tile.
2. **Privacy:** enter the single purpose; paste each permission justification; choose **No** for remote code; make the user-data selections above; complete limited-use certifications; enter the privacy URL.
3. **Distribution:** choose Public when approved for general release, all intended countries, and free distribution.
4. **Test instructions:** paste the reviewer workflow below and provide disposable credentials only through protected dashboard fields.
5. Choose deferred publishing so production links and final sign-off can be coordinated after review.

Required listing assets:

- 128 x 128 PNG store icon.
- At least one and preferably 3-5 screenshots at 1280 x 800, maximum 5.
- 440 x 280 PNG or JPEG small promotional tile.
- 1400 x 560 PNG or JPEG marquee tile if used.
- Optional public YouTube demonstration; do not upload private rehearsal footage.

## Microsoft Edge Add-ons

**Package:** upload the same `capchurextension-0.1.0-chrome.zip` used for Chrome. Edge assigns a separate listing and extension ID.

1. **Availability:** choose Public for discoverability or Hidden for controlled pre-release; select intended markets.
2. **Properties:** Productivity category, `https://capchur.io`, `support@capchur.io`, no mature content, and **Yes** for handling personal information with the privacy URL.
3. **Privacy:** use the shared single purpose, permission justifications, **No** remote code answer, user-data selections, certifications, and privacy URL.
4. **Store listings:** use the shared detailed description. Edge requires 250-10,000 characters, a logo, and the manifest-provided name and short description.
5. **Certification notes:** paste the reviewer workflow below and provide disposable credentials in the protected submission field.

Listing assets:

- 300 x 300 recommended logo; minimum 128 x 128.
- Up to 6 screenshots at 1280 x 800 or 640 x 480.
- Optional 440 x 280 small tile and 1400 x 560 large tile.

Retain the Edge listing URL separately from the Chrome listing URL even though both use the same package.

## Firefox Add-ons (AMO)

**Package:** `apps/extension/.output/capchurextension-0.1.0-firefox.zip`

**Source package:** `apps/extension/.output/capchurextension-0.1.0-sources.zip`

Choose **On this site** for a discoverable AMO listing. Select Firefox desktop for Windows, macOS, and Linux; do not select Android. Use Productivity as the primary category and do not mark the release experimental after release sign-off.

Firefox-specific answers:

- The add-on requires Firefox 142 or later, the first release supporting the required data collection consent manifest key.
- Data declarations: `authenticationInfo`, `browsingActivity`, `personallyIdentifyingInfo`, `websiteActivity`, and `websiteContent`.
- Authentication information means Capchur's own expiring workspace credential, never passwords from recorded pages.
- The manifest declarations activate Firefox's built-in data collection consent experience.
- A free external Capchur account/service is required for sync and editing; no payment is required for release 0.1.
- The add-on transmits data, so include the complete privacy policy in AMO and provide `https://capchur.io/privacy`.

Upload the source archive because WXT bundles and transpiles the extension. Source reviewer instructions:

> Build environment: Node.js 22 or later with Corepack and pnpm 11 on a supported Windows, macOS, or Linux environment. From the repository root run `corepack pnpm install --frozen-lockfile`, set `WXT_WEB_ORIGIN=https://capchur.io`, then run `corepack pnpm --filter @capchur/extension build:firefox`. The reproduced extension is written to `apps/extension/.output/firefox-mv2`. Create the submitted package with `corepack pnpm --filter @capchur/extension zip:firefox`. Dependencies are downloaded only through the official pnpm/npm registry using the included lockfile. No proprietary build tool is required.

Recommended AMO assets are the extension icon and 1280 x 800 screenshots. Provide a concise summary, shared detailed description, support email/site, privacy policy, appropriate license, and reviewer notes.

## Reviewer Instructions

Paste this workflow into each store's test-instruction field and adjust labels only where the browser differs:

> Capchur requires a disposable reviewer account, supplied securely in this submission. Do not use personal or production customer data.
>
> 1. Install the extension in a clean browser profile and open an ordinary HTTPS page containing buttons, text inputs, a select control, and a form.
> 2. Open Capchur and choose Start recording. Grant access to the current site when the browser prompts.
> 3. Perform several clicks, enter and commit text in a non-sensitive field, change a selection, and submit the form. Stop recording.
> 4. Choose Review session. Confirm steps and screenshots are present, entered values are absent from step descriptions, and a step can be renamed or deleted.
> 5. Choose Connect & sync once and sign in with the supplied reviewer account. Return to the extension and sync the stopped session.
> 6. Open the mapped guide at capchur.io. Reorder a step, apply a redaction, save, and verify an export control is available.
> 7. Deny site access on a second origin and confirm Capchur explains the denied state without deleting the session.
>
> Expected limitations: browser settings/store pages, password and payment fields, canvas/WebGL semantics, closed shadow roots, and inaccessible cross-origin frames are intentionally not captured. The extension does not execute remote code. AI description enhancement is optional, server-side, and off by default.

## Asset Capture Plan

Use only synthetic data in a clean release profile:

1. Extension popup while a recording is active.
2. Local review with five sanitized steps and screenshots.
3. Web editor showing reorder, highlight, crop, and redaction controls.
4. Collaboration access controls and revocable link state.
5. Export controls with a completed sample guide.

Do not include customer captures, real tokens, personal email addresses, private URLs, browser developer UI, or localhost/development-server content. Keep text readable at store display size and avoid claims not implemented in version 0.1.0.

## Release Owner Checklist

- Confirm `https://capchur.io/privacy`, `/help`, and the homepage return successfully without authentication.
- Confirm privacy/support/security mailboxes are monitored.
- Build against `WXT_WEB_ORIGIN=https://capchur.io` and run release verification.
- Compare uploaded archive hashes with [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
- Scan archives for secrets, source maps, localhost, and generated-only files.
- Provide disposable reviewer credentials securely, never in source control.
- Resolve validator warnings or record their disposition.
- Test store-installed identity connection because Chrome and Edge receive distinct extension IDs.
- Record listing IDs, URLs, review results, approver, and publication date in the release checklist.
