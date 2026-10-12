export function renderReport(result, target) {
  const money = value => `${result.currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  const pct = value => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const affected = result.rows.filter(row => row.allocationStatus !== "Allocated" || row.policyIssues.length > 0 || (row.allocationSource && row.allocationSource !== "Cost export metadata"))
    .sort((left, right) => Math.abs(right.cost) - Math.abs(left.cost));
  const statusNote = result.tagObserved ? `Checking allocation tag <strong>${escape(result.tagKey)}</strong> and ${result.requiredKeys.length - 1} other required tag(s) across ${result.recordCount.toLocaleString()} cost records.` : `No tag columns were detected. The export may omit tag data, or this allocation key may not be present.`;
  const needsReview = Math.abs(result.totals.invalid) + Math.abs(result.totals.unallocated) + Math.abs(result.totals.ambiguous) + Math.abs(result.totals.unresolved);
  const valueRules = Object.entries(result.allowedValues).map(([key, values]) => `${escape(key)}: ${values.map(escape).join(", ")}`).join(" · ") || "Any non-empty value";
  const periodLabel = result.periodStart === result.periodEnd ? result.periodStart : `${result.periodStart} – ${result.periodEnd}`;
  target.innerHTML = `
    <div class="report-head"><div><h3>Allocation snapshot</h3><p>${statusNote}</p></div><div class="report-actions"><button class="secondary" id="download-report">Download report ↓</button><button class="secondary" id="download-findings">Download findings ↓</button></div></div>
    <div class="policy-summary"><strong>Assessment scope</strong><span>Period: ${escape(periodLabel)} · Subscriptions: ${result.subscriptions.length ? result.subscriptions.map(escape).join(", ") : "Not provided"}</span><span>Cost profile: ${escape(result.profile?.profile || "Not identified")} · Column: ${escape(result.costColumn)}</span><span>Assessment ID: ${escape(result.assessmentId)} · Policy fingerprint: ${escape(result.policyHash)} · Generated: ${escape(result.generatedAt)}</span><strong>Policy checked</strong><span>Required: ${result.requiredKeys.map(escape).join(", ")}</span><span>Allowed values: ${valueRules}</span><span>Inventory matches: ${result.inventoryMatchCount.toLocaleString()} of ${result.recordCount.toLocaleString()} · Approved mappings: ${result.scopeCount.toLocaleString()}</span></div>
    <div class="metrics">
      <div class="metric"><span>IN-SCOPE SPEND</span><strong>${money(result.totals.total)}</strong><small>${result.recordCount.toLocaleString()} valid records</small></div>
      <div class="metric"><span>ALLOCATION COVERAGE</span><strong>${pct(result.coverage)}</strong><small>Spend with an accepted ${escape(result.tagKey)} value</small></div>
      <div class="metric"><span>POLICY-COMPLIANT SPEND</span><strong>${pct(result.policyComplianceCoverage)}</strong><small>Spend with all required tags valid</small></div>
      <div class="metric"><span>ALLOCATION NEEDS REVIEW</span><strong>${money(needsReview)}</strong><small>${result.policyIssueCount} records have policy issues</small></div>
    </div>
    <div class="section-heading"><h4>Allocation breakdown</h4><span>${escape(result.currency)} · ${escape(periodLabel)}</span></div>
    <div class="allocation-breakdown"><div><span>Directly allocated</span><strong>${money(result.totals.direct)}</strong></div><div><span>Inherited / mapped</span><strong>${money(result.totals.inherited)}</strong></div><div><span>Unallocated</span><strong>${money(result.totals.unallocated)}</strong></div><div><span>Ambiguous</span><strong>${money(result.totals.ambiguous)}</strong></div><div><span>Invalid</span><strong>${money(result.totals.invalid)}</strong></div><div><span>Unresolved</span><strong>${money(result.totals.unresolved)}</strong></div></div>
    <div class="bar-label"><span>Allocation coverage = accepted allocation spend ÷ in-scope spend (${money(result.totals.allocated)} ÷ ${money(result.totals.total)})</span><strong>${pct(result.coverage)}</strong></div>
    <p class="formula-note">Policy-compliant spend = records meeting all required tags ÷ in-scope spend (${money(result.policyCompliant.spend)} ÷ ${money(result.totals.total)}). ${result.coverage === null ? "Coverage is N/A because net in-scope spend is zero or negative; signed credits are included." : "Negative costs remain signed; needs-review uses absolute exposure so credits do not cancel review amounts."}</p>
    <div class="bar"><span style="width:${Math.min(100, Math.max(0, (result.coverage ?? 0) * 100))}%"></span></div>
    <div class="section-heading"><h4>Records to review</h4><span>${affected.length.toLocaleString()} records</span></div>
    <div class="table-wrap"><table><thead><tr><th>Finding ID</th><th>Resource</th><th>Subscription</th><th>Service</th><th>Cost</th><th>Evidence / Finding</th><th>Next action</th></tr></thead><tbody>
    ${affected.slice(0, 250).map(row => { const finding = row.policyIssues.join("; ") || (row.conflictingAllocationValues ? `Conflicting approved values: ${row.allocationEvidence.map(item => `${item.source}: ${item.value}`).join(" · ")}` : row.allocationSource && row.allocationSource !== "Cost export metadata" ? `Allocated via ${row.allocationSource} (${result.tagKey}=${row.allocationValue})` : row.allocationStatus); return `<tr><td>${escape(row.findingId)}</td><td title="${escape(row.resourceId)}">${escape(row.resourceId || "Not provided")}</td><td>${escape(row.subscription || "—")}</td><td>${escape(row.service || "—")}</td><td>${money(row.cost)}</td><td><span class="${row.policyIssues.length || row.allocationStatus !== "Allocated" ? "tag-bad" : "tag-good"}">${escape(finding)}</span></td><td>${escape(row.recommendedAction || "Review evidence and confirm client owner")}</td></tr>`; }).join("") || `<tr><td colspan="7">No records need review for this tag policy.</td></tr>`}
    </tbody></table></div>
    <p class="footnote">This is a tag-based signal, not a complete allocation verdict. Hierarchy, inherited tags, shared-cost rules, unsupported resources, credits, and export type can change interpretation. ${result.hierarchyWarnings?.length ? `Hierarchy warning: ${result.hierarchyWarnings.map(escape).join("; ")} ` : ""}${result.skippedCount ? `${result.skippedCount} rows with invalid costs were excluded.` : ""}${affected.length > 250 ? ` Showing 250 of ${affected.length} review rows; CSV download contains all ${affected.length} findings.` : ""}</p>`;
  document.getElementById("download-findings").addEventListener("click", () => downloadCsv(affected, result));
  document.getElementById("download-report").addEventListener("click", () => downloadClientReport(target, result));
}

export function escapeCsvCell(value) {
  let safe = String(value ?? "");
  const formulaLike = /^[\t\r\n]/.test(safe) || /^[\s\u0000-\u001f]*[=+@-]/.test(safe);
  if (formulaLike) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(rows, result) {
  const fields = ["findingId", "sourceRow", "resourceId", "resourceGroup", "subscriptionId", "subscription", "service", "date", "cost", "currency", "allocationValue", "allocationSource", "allocationStatus", "allocationEvidence", "policyIssues", "recommendedAction", "requiredTagKeys", "allowedValues"];
  const quote = escapeCsvCell;
  const csv = [fields.join(","), ...rows.map(row => fields.map(field => {
    if (field === "requiredTagKeys") return quote(result.requiredKeys.join("; "));
    if (field === "allowedValues") return quote(JSON.stringify(result.allowedValues));
    if (field === "allocationEvidence") return quote(JSON.stringify(row.allocationEvidence));
    return quote(Array.isArray(row[field]) ? row[field].join("; ") : row[field]);
  }).join(","))].join("\r\n");
  saveBlob(`azure-findings-${result.assessmentId}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function downloadClientReport(target, result) {
  const content = target.innerHTML.replace(/<button[^>]*id="download-(?:report|findings)"[^>]*>.*?<\/button>/g, "");
  const reportHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Azure Allocation Assessment</title><style>body{font:14px Arial,sans-serif;color:#182a35;max-width:1100px;margin:40px auto;padding:0 24px}h1{font:32px Georgia,serif}h2{font-size:18px;margin:30px 0 10px}.eyebrow{font-size:10px;letter-spacing:1px;color:#157d65;font-weight:bold}.report-head{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #dce6e2;padding-bottom:12px}.report-head h3{font-size:20px;margin:0 0 6px}.report-head p,.footnote{font-size:11px;color:#64777c;line-height:1.6}.policy-summary{display:grid;gap:6px;background:#f6f9f8;padding:14px;margin:14px 0;border-radius:6px;font-size:11px;color:#64777c}.policy-summary strong{color:#182a35}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.metric{padding:16px;background:#f6f9f8;border:1px solid #edf1ef;border-radius:7px}.metric span,.metric small{display:block;color:#64777c;font-size:10px;margin-bottom:8px}.metric strong{font-size:22px}.bar-label{display:flex;justify-content:space-between;font-size:11px;margin:20px 0 8px}.bar{height:8px;background:#f2dcd3;border-radius:9px;overflow:hidden}.bar>span{height:100%;display:block;background:#157d65}.section-heading{margin:25px 0 10px}table{width:100%;border-collapse:collapse;font-size:10px}td,th{text-align:left;padding:9px;border-bottom:1px solid #dce6e2;vertical-align:top}th{background:#f6f9f8}.tag-bad{color:#a54b37}.tag-good{color:#14765f}.action-note{display:block;color:#64777c;margin-top:5px}.footnote{margin-top:14px}@media(max-width:700px){.metrics{grid-template-columns:1fr}.report-head{display:block}}</style></head><body><p class="eyebrow">FINOPS TOOLKIT · AZURE</p><h1>Allocation & Tagging Assessment</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p>${content}</body></html>`;
  saveBlob("azure-allocation-assessment.html", reportHtml, "text/html;charset=utf-8");
}

function saveBlob(filename, content, contentType) {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
