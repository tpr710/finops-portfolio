# Local Product Security and Operations Notes

## Scope

This document describes the current local browser application. It does not describe a hosted service or cloud connector. The app is read-only: it does not authenticate to Azure or write cloud resources.

## Data flow

1. User selects local cost, inventory, and hierarchy CSV files in the browser.
2. Browser reads file text into memory; parser normalizes it and analyzer produces results.
3. User views findings in the page and may download an HTML report or CSV backlog.
4. Browser download location and subsequent handling are controlled by the user and operating system.

No app server, account, external network request, analytics, telemetry, or persistence is part of the intended build. Do not include client data in application diagnostics or repository fixtures.

## Data classification and user responsibilities

Treat all exports, resource identifiers, tags, subscription names, policy rules, and reports as confidential client information. Use an approved device and storage location. Close the app when finished and handle downloads under the client's retention rules. The app cannot erase copies the user downloads or copies made by the browser/operating system.

## Threats and controls

| Threat | Control in this release | Remaining limitation |
|---|---|---|
| Malicious/oversized CSV causes unsafe parsing or browser exhaustion | 50 MB, 500,000 row, 500 column, and field length limits; malformed quoting/row checks | Browser memory usage still depends on device; tune limits after representative large-file validation |
| CSV content executes as markup in findings/report | Dynamic values are HTML escaped before rendering | Regression tests and browser security review remain necessary for each new rendering path |
| Findings CSV triggers spreadsheet formula evaluation | Formula-like cell values are prefixed with a text marker and quoted | Spreadsheet applications vary; recipient should treat client data as untrusted |
| Client data leaks through upload/telemetry | No network calls, backend, analytics, external scripts, or intended persistence | Recheck every distribution build; this does not govern browser extensions or compromised endpoints |
| Conflicting metadata silently assigns a cost | Conflicting allocation values are marked ambiguous and surfaced separately | Human/client review still determines authoritative policy |
| Incorrect cost semantics imply inaccurate finance result | Cost profile labels and warnings; mixed currencies rejected; methodology caveats shown | No invoice reconciliation; real Azure export validation is outstanding |

## Release checklist

- [ ] Build `index.html` from source; verify page uses no remote resources.
- [ ] Run automated checks and inspect report/download flows in a supported browser.
- [ ] Confirm application has no cloud credentials, network upload, telemetry, or local storage persistence.
- [ ] Review formulas/XSS regression checks and file input limits.
- [ ] Confirm the full upload interaction in a real supported browser, including keyboard access and downloads.
- [ ] Record release version/date and material changes in `CHANGELOG.md`.
- [ ] Ship `index.html`, `styles.css`, README, and this security note together.
- [ ] Do not distribute as commercially validated until representative client exports reconcile and a client accepts the report.

## Incident and support handling

For a local-only release, instruct users not to send raw cost files by email when reporting a defect. Ask for a sanitized minimal reproduction, the app version, browser version, and error description. If a data exposure or unsafe output issue is suspected, pause distribution, preserve the affected release, reproduce with synthetic data, fix, verify, issue a versioned replacement, and notify affected customers under the applicable agreement.

## Explicitly out of scope

Hosted authentication, tenant isolation, database/object storage, support impersonation, cloud connector permissions, encryption/key management, server backups, centralized audit logs, and SOC/ISO certification do not apply to this local build. They become mandatory design work before any hosted/cloud-connected customer-data service is introduced.
