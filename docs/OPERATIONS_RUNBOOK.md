# Capchur Operations Runbook

## Data Lifecycle

| Data                                                                      | Retention                                                    | Deletion                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Local extension sessions and screenshots                                  | Until the user clears/deletes them or removes extension data | Review-page clear/delete removes session metadata and IndexedDB screenshots               |
| Guides, source screenshots, revisions, comments, shares, and audit events | Until the workspace owner deletes the guide                  | Authenticated guide deletion cascades related database records and deletes source objects |
| Captured upload sessions                                                  | Until explicitly deleted or converted under product workflow | Workspace-scoped session delete endpoint                                                  |
| PDF/DOCX artifacts                                                        | 24 hours                                                     | Export worker expires metadata and deletes private objects                                |
| Auth sessions and extension credentials                                   | Web session: 7 days; extension token: 1 hour                 | Expiry; operator revocation during an incident                                            |
| AI request content                                                        | Not stored by Capchur; usage metadata only                   | Provider retention follows the configured provider agreement                              |
| Production backups                                                        | 30 daily restore points                                      | Backup lifecycle policy removes expired recovery points                                   |

Deletion is irreversible after backup expiry. Until then, backup copies are isolated from the live product and used only for disaster recovery. A privacy deletion request must be recorded, verified, completed in live systems, and allowed to age out of backups within 30 days.

## Backup And Restore

Production operators must enable encrypted daily PostgreSQL backups with point-in-time recovery and private versioned object-storage backups in the deployment platform. Keep database and object backups in the same recovery window and restrict restore roles separately from application roles.

Monthly restore rehearsal:

1. Restore the database and object snapshot into an isolated non-production account.
2. Start the matching application release with outbound email and AI disabled.
3. Verify workspace isolation, one guide with its screenshots, one revision, one completed export where present, and object checksums.
4. Confirm active production share links and credentials are not exercised from the restore environment.
5. Delete the rehearsal environment and record date, recovery point, duration, and result in the release checklist.

Targets: recovery point objective 24 hours; recovery time objective 4 hours. A failed monthly restore blocks the next release.

## Observability

Alert on API 5xx rate, p95 latency, authentication failures, extension sync failures, export queue age/failure/retry rate, AI timeout/fallback rate, database/storage errors, object deletion failures, and backup age. Logs must use request/job identifiers and status codes, never credentials, share tokens, full URLs with query strings, prompts, screenshots, or captured payloads.

Minimum alerts:

- Critical: sustained API unavailability, cross-workspace access, public object exposure, backup failure over 24 hours.
- High: 5xx rate over 5% for 10 minutes, export queue oldest job over 15 minutes, repeated authorization spikes, deletion failures.
- Warning: p95 API latency over 1 second for 15 minutes, AI fallback over 20%, storage nearing quota.

## Incident Procedure

1. Acknowledge and assign an incident lead; classify severity and start an internal timeline.
2. Contain: revoke affected sessions/extension credentials/share links, disable AI or exports, or roll back the application as appropriate.
3. Preserve privacy-safe logs and relevant audit IDs. Do not copy customer content into tickets or chat.
4. Determine affected workspaces, data classes, time window, and legal notification obligations.
5. Recover from a known-good release or isolated verified backup; monitor the original symptom.
6. Notify affected users and authorities when required. Publish only verified facts.
7. Complete a blameless review with corrective owners and deadlines.

Contacts: `security@bizleader.ai` for security/privacy incidents and `support@bizleader.ai` for service incidents.

## Deployment And Rollback

Before deployment, verify backup freshness, migration compatibility, environment secrets, private bucket policy/CORS, HTTPS, alert routing, and the full release checklist. Deploy web/API before publishing browser packages when compatibility is additive.

Rollback order:

1. Stop store rollout and disable affected optional workers/providers.
2. Redeploy the previous application image without reversing a database migration.
3. If the release wrote incompatible data, place writes in maintenance mode and restore the pre-deploy database and matching objects into isolation before promotion.
4. Revoke credentials or links created by the faulty release when exposure is possible.
5. Run authentication, guide read, image read, sync, export, and share-revocation smoke tests.

Database migrations are forward-only. Never improvise a destructive down migration in production. Prefer a compatibility migration; use snapshot restore only with incident-lead approval and an explicit accepted data-loss window.
