# Capchur Privacy Policy

Effective August 6, 2026.

The public, store-facing policy is available at `https://capchur.io/privacy`. That web page is the authoritative published copy; keep this release reference synchronized with it.

## Overview

Capchur records browser workflows that a user explicitly starts and turns them into editable visual guides. This policy covers the Capchur browser extension and web application. Contact `privacy@capchur.io` with privacy questions or requests.

## Information We Process

- Account and authentication information: name, email address, workspace membership, authentication records, web sessions, and Capchur's own expiring extension credential.
- Workflow and website information while recording is active: page URL/title, supported clicks, committed input or selection actions without entered values, form submissions, privacy-filtered element labels and geometry, viewport details, and visible-tab screenshots.
- Guide and collaboration information: guides, edits, crops, redactions, comments, revisions, sharing settings, exports, and security audit events.
- Service information: request/job status, timestamps, error categories, export status, and AI token and cost totals.

Diagnostic logs are designed not to contain captured payloads, screenshots, credentials, share tokens, or full private URLs.

## Capture Boundaries And Consent

Capchur excludes password and payment-field values. Input and selection actions record that an action occurred, not the entered or selected value. Capchur does not record protected browser pages, native desktop applications, canvas/WebGL content semantics, closed shadow roots, or inaccessible cross-origin frames.

The extension does not record continuously. Recording starts only after the user chooses to start or resume it. Site access is requested for the active HTTP(S) site and can be denied without losing the current session. Users can stop recording and review or delete local steps before syncing.

Firefox 142+ uses Firefox's built-in data collection consent experience. Chrome and Edge expose requested permissions and site-access controls through their browser interfaces.

## How We Use Information

Capchur processes information to provide recording, review, synchronization, editing, collaboration, sharing, export, authentication, security, abuse prevention, support, and service reliability. Capchur does not sell personal information, use captured content for advertising, or transmit browsing information for an unrelated purpose.

## Local Storage And Cloud Sync

Recording state, steps, screenshots, review edits, and a resumable sync queue can remain in browser storage until the user clears them or removes extension data. Cloud sync occurs after the user connects an authenticated Capchur workspace. Synced data is sent over encrypted HTTPS to Capchur's production service at `capchur.io`.

## Sharing And Service Providers

Guides are private by default. A workspace owner can enable workspace access or create a revocable link. Anyone with an active link can view that guide until the link is revoked.

Capchur uses restricted infrastructure providers for database, object storage, backup, email delivery, and application hosting. These providers process information only to deliver their contracted services. Information may also be disclosed when required by law or necessary to protect users, the service, or others.

## Optional AI Processing

AI description enhancement is off by default and runs only after a workspace owner opts in for a step. Capchur sends bounded, redacted step text to the configured AI provider. Screenshots, credentials, full page content, and tools are not sent for this feature. Capchur retains usage totals rather than AI request content; provider retention follows the configured provider agreement.

## Retention And Deletion

- Local extension sessions remain until the user clears them or removes extension data.
- Guides and related source content remain until a workspace owner deletes the guide.
- PDF and DOCX artifacts expire after 24 hours.
- Web sessions last up to 7 days; extension credentials expire after 1 hour.
- Encrypted production backups retain up to 30 daily recovery points and are isolated for disaster recovery.

Deletion removes information from live systems. Residual backup copies age out within 30 days and are not restored except for disaster recovery.

Users can stop recording, deny or revoke site access, delete local sessions, remove steps before sync, revoke guide links, and delete guides they own. Verified access, correction, export, or deletion requests may be sent to `privacy@capchur.io`.

## Security, Children, And Changes

Capchur uses encrypted transport, private storage, scoped authorization, expiring credentials, runtime validation, audit events, backup controls, and tested deletion procedures. Report suspected vulnerabilities to `security@capchur.io` without including captured private content or credentials in the initial report.

Capchur is a workplace productivity service and is not directed to children. We do not knowingly collect personal information from children.

We may update this policy when the product, providers, or legal requirements change. Material changes will update the effective date and be communicated through the service or browser-store listing where appropriate.

Privacy: `privacy@capchur.io`. Support: `support@capchur.io`.
