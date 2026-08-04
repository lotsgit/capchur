# Browser Store Listing

## Listing Copy

**Name:** Capchur - Workflow Guide Recorder

**Category:** Productivity

**Short description:** Record browser workflows and turn them into editable, privacy-aware visual guides.

**Full description:** Capchur captures supported clicks, committed inputs, selections, and form submissions only after you start recording. It saves visible-tab screenshots, keeps typed values out of action payloads, and rejects password and payment fields. Review recordings locally, sync them to your authenticated workspace, edit and redact screenshots, collaborate with controlled access, and export HTML, Markdown, PDF, or DOCX guides. Recording can be stopped at any time, and unsupported browser surfaces are explained without losing the session.

**Support:** `support@bizleader.ai`

**Privacy policy:** `https://capchur.io/privacy`

## Permission Explanations

| Permission               | Store explanation                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`              | Checks and captures only the tab where the user explicitly starts or resumes recording.                                   |
| `scripting`              | Installs the recorder after the user grants access for the active site and restores it after supported navigation.        |
| `storage`                | Persists recording state, local steps, review edits, and the resumable sync queue across browser/service-worker restarts. |
| `identity`               | Opens the browser-managed authorization flow that connects the extension to the user's Capchur workspace.                 |
| `alarms`                 | Retries interrupted authenticated synchronization after MV3 service-worker suspension or temporary network failure.       |
| Production web origin    | Connects only to the Capchur web application for authorization, sync, and opening the mapped guide.                       |
| Optional HTTP(S) origins | Requested per site only when the user starts recording; never a silent install-time grant.                                |

Firefox data declarations are required because recordings can contain browsing activity, website content, screenshots, and identifying information. Authentication information means Capchur's own expiring workspace credential, not page passwords.

## Submission Assets And Notes

Use the 128 px extension icon, screenshots of recording controls/local review/web editing, and the packages produced by `zip:extension:browsers`. Do not include customer captures, real tokens, private URLs, or development-server screenshots. Chrome and Edge use MV3; Firefox 140+ uses MV2 with explicit data-collection declarations.
