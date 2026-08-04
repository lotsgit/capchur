# Capchur Privacy Policy

Effective: 2026-08-04.

Capchur records browser actions that a user explicitly starts and turns them into editable visual guides. This policy describes Capchur 0.1.0. Contact `privacy@bizleader.ai` with privacy questions or requests.

## Data We Process

- Account and workspace information, including name, email address, membership, and authentication records.
- Supported browser actions, page URL/title, privacy-filtered element metadata, viewport details, and visible-tab screenshots while recording is active.
- Guides, edits, redactions, comments, revisions, sharing settings, exports, and security audit events.
- Service metadata such as job status, error category, token counts, cost, and timestamps.

Capchur does not capture password or payment-field values. Input/select capture records the action but not the entered value. It does not record protected browser pages, native desktop applications, canvas/WebGL content semantics, closed shadow roots, or inaccessible cross-origin frames.

## Why We Process It

We process data to provide recording, editing, synchronization, collaboration, sharing, export, security, abuse prevention, support, and service reliability. We do not sell personal information or use captured content for advertising.

AI description enhancement is off by default. When a workspace owner opts in, Capchur sends bounded, redacted step text to the configured AI provider. Screenshots, credentials, full page content, and tools are not sent by this feature. Provider processing is governed by the operator's provider agreement.

## Storage And Sharing

Production data is stored in private PostgreSQL and S3-compatible services configured by the operator. Signed media links expire. Guides are private by default; workspace owners can enable workspace access or create a revocable link. Anyone with an active link can view that guide, so owners should revoke a disclosed link.

Retention and deletion periods are defined in [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md). Workspace owners can delete guides and local extension sessions. Verified access, correction, export, or deletion requests may be sent to `privacy@bizleader.ai`; identity verification may be required. Backup copies age out within 30 days.

## Security And Changes

Capchur uses encrypted transport, private storage, scoped authorization, expiring credentials, runtime validation, audit events, and tested deletion controls. No system is completely secure; report suspected vulnerabilities to `security@bizleader.ai`.

We may update this policy when the product or legal requirements change. Material changes will update the effective date and be communicated through the service or release listing.
