# FinOps Toolkit — Azure Allocation Assessment

Local, read-only analysis for Azure cost CSV exports. The selected files are processed in the browser and are not sent to a service. The first release is designed for a FinOps consultant or client analyst preparing an allocation review; it is not an Azure account connector or a complete billing reconciliation system.

## Use the product

1. Open `index.html` in a current desktop version of Microsoft Edge or Google Chrome. Keep `styles.css` beside it.
2. Click anywhere in the dashed upload area or use **browse files**; you can also drop a CSV there. The preflight shows row count, cost column, currency, and profile. The Analyze button is enabled only if this succeeds.
3. Set one allocation tag key and any client-approved required tags or allowed values. Add optional inventory or hierarchy CSVs if available, then click **Analyze export**. File selection alone does not run the assessment.
4. Review the dashboard’s allocation breakdown, coverage, tag-policy compliance, and findings separately.
5. Download the standalone HTML assessment or complete findings CSV. Client files stay under the user's browser/download controls.

Use **Explore with sample data** to walk through the interface without a client export.

## Inputs

### Cost export

The parser recognizes common aliases including `CostInBillingCurrency`, `PreTaxCost`, `Cost`, `EffectiveCost`, and `BilledCost`; currency; date; subscription; resource group; service; resource ID; and tags. Comma, semicolon, and tab-delimited files are supported, including UTF-8 BOM and quoted CSV fields.

Column names do not prove cost semantics. `EffectiveCost`, `BilledCost`, generic `Cost`, and `CostInUSD` are identified with warnings that require analyst confirmation. Confirm actual versus amortized/billed cost, billing scope, period, currency, filters, credits, and exclusions with the source export before comparing totals. Mixed currencies are rejected. `CostInUSD` is labeled USD when the export does not provide a currency field. The product does not currently reconcile Azure invoice/billing totals or prove equivalence across export types.

### Resource inventory (optional)

CSV should contain Azure resource `id` or `ResourceId`, with `subscriptionId`, `resourceGroup`, and `tags` where available. Export only fields needed for the assessment. Inventory tags provide evidence, not proof that a particular policy approves them.

### Approved hierarchy mappings (optional)

CSV columns: `ScopeType`, `ScopeId`, optional `ParentScopeId`, and `Tags` as a JSON object; or `TagKey` and `TagValue`. Supported scope types include `resourceGroup`, `subscription`, and `managementGroup`. Only include mappings the client has approved. Parent links should use a complete Azure scope ID and must be reviewed for conflicts and cycles.

## Measures and interpretation

- **Allocation coverage** = accepted allocation spend ÷ total valid in-scope spend. A conflict between sources is ambiguous and is not allocated. Coverage is N/A when net in-scope spend is zero or negative.
- **Policy-compliant spend** = spend on records with all configured required tags present and allowed ÷ total valid in-scope spend. This is also N/A when net spend is zero or negative.
- **Needs review** sums the absolute exposure for invalid, unallocated, ambiguous, and unresolved rows so credits cannot cancel the review workload.
- Costs/credits remain signed in totals and findings. Duplicate cost rows are preserved as separate source rows; the tool does not deduplicate because identical-looking lines may be legitimate billing records. Blank resource IDs are unresolved unless approved metadata available in the row assigns them.
- Direct and inherited evidence sources are recorded on findings. Shared-cost allocation is not calculated by the app.
- A missing required governance tag remains a policy issue even if a parent mapping allocates the spend.
- The source CSV row is retained as a finding reference. Assessment ID, generated time, cost profile, cost column, and policy fingerprint are included in the results.

These are assessment measures, not invoice reconciliation or a full allocation verdict. Confirm exclusions, hierarchy/inheritance semantics, shared-cost rules, commitments, credits, and unsupported charges with the client.

## Local security and data handling

- No credentials, cloud connection, upload, analytics, telemetry, external script, or backend is used by this app.
- Input files are processed in browser memory. Avoid shared/public computers; close the page after analysis. Downloaded reports/CSVs are saved by the browser and must be handled according to the client's data policy.
- Do not add real client files to the repository, email them to developers, or use them as test fixtures without explicit client authorization and an approved handling process.
- Files over 50 MB, CSVs over 500,000 records or 500 columns, and fields over 100,000 characters are rejected. Split large periods before analysis.
- The parser validates quoting, column names, and row shape. CSV exports escape formula-like values. Reports HTML-escape input values.
- This is not a formal security certification or regulatory compliance claim. The local threat/data-flow notes are in `SECURITY-AND-OPERATIONS.md`.

## Development and release

The modular source is in `src/`; `index.template.html` is the page template. Rebuild the file-based app after changing modules:

```powershell
npm run build
```

Run automated parser, allocation, report-safety, and fixture checks:

```powershell
npm test
```

Before distribution, review `CHANGELOG.md`, verify the generated `index.html` opens locally in supported browsers, and deliver `index.html` together with `styles.css`, this guide, and the security notes. The project has no third-party runtime dependencies.

## Current product limits

No Azure live connector, authoritative billing reconciliation, direct/indirect shared-cost splitting, stored review workflow, client account system, hosted SaaS, PDF report, AWS/GCP, scheduled monitoring, or automated tag changes. The current rule fingerprint is a repeatability aid, not a cryptographic signature. Representative customer exports, customer acceptance, pricing, support arrangements, and legal review are required before making a commercial-readiness claim.
