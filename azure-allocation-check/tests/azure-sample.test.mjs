import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseCsv, detectColumns, detectCostProfile, normalizeAzureRows, normalizeAzureInventory, normalizeAzureScopes } from "../src/azureCsv.js";
import { analyzeAllocation } from "../src/analyze.js";
import { parseAllocationPolicy } from "../src/policy.js";
import { escapeCsvCell, renderReport } from "../src/report.js";

const fixturePath = fileURLToPath(new URL("../sample-azure-cost-export.csv", import.meta.url));
const sampleText = await readFile(fixturePath, "utf8");
const inventoryText = await readFile(fileURLToPath(new URL("../sample-azure-resource-inventory.csv", import.meta.url)), "utf8");
const scopesText = await readFile(fileURLToPath(new URL("../sample-azure-scope-mappings.csv", import.meta.url)), "utf8");

test("reads the Azure CSV fixture and calculates tag-based allocation figures", () => {
  const records = parseCsv(sampleText);
  const columns = detectColumns(records);
  const rows = normalizeAzureRows(records, columns);
  const result = analyzeAllocation(rows, "CostCenter");

  assert.equal(result.recordCount, 5);
  assert.equal(result.currency, "EUR");
  assert.equal(result.totals.total, 758);
  assert.equal(result.totals.allocated, 601.6);
  assert.equal(result.totals.unallocated, 92.15);
  assert.equal(result.totals.unresolved, 64.25);
  assert.equal(result.coverage, 601.6 / 758);
  assert.equal(result.rows.filter(row => row.allocationStatus !== "Allocated").length, 2);
});

test("matches the allocation tag key without case sensitivity", () => {
  const records = parseCsv(sampleText);
  const result = analyzeAllocation(normalizeAzureRows(records, detectColumns(records)), "costcenter");
  assert.equal(result.tagKey, "CostCenter");
  assert.equal(result.totals.allocated, 601.6);
});

test("refuses to combine costs with different currencies", () => {
  const records = parseCsv(sampleText);
  const rows = normalizeAzureRows(records, detectColumns(records));
  rows[0].currency = "USD";
  assert.throws(() => analyzeAllocation(rows, "CostCenter"), /multiple currencies/i);
});

test("refuses to combine cost columns with different semantics", () => {
  const records = parseCsv(sampleText);
  const rows = normalizeAzureRows(records, detectColumns(records));
  rows[1].costColumn = "EffectiveCost";
  assert.throws(() => analyzeAllocation(rows, "CostCenter"), /multiple cost measures/i);
});

test("parses semicolon-delimited and UTF-8 BOM exports", () => {
  const records = parseCsv("\uFEFFPreTaxCost;Currency;Tags\r\n12,50;EUR;\"{\"\"CostCenter\"\":\"\"CC-1\"\"}\"\r\n1.234,50;EUR;");
  assert.equal(records[0].PreTaxCost, "12,50");
  assert.equal(records[0].Currency, "EUR");
  assert.equal(records[0].Tags, '{"CostCenter":"CC-1"}');
  assert.equal(normalizeAzureRows(records, detectColumns(records))[0].cost, 12.5);
  assert.equal(normalizeAzureRows(records, detectColumns(records))[1].cost, 1234.5);
});

test("rejects malformed and ambiguous CSV inputs with actionable errors", () => {
  assert.throws(() => parseCsv('Cost,Cost\n1,2'), /duplicate column/i);
  assert.throws(() => parseCsv('Cost,ResourceId\n"10,/vm-1'), /unclosed quoted/i);
  assert.throws(() => parseCsv('Cost,ResourceId\n10,/vm-1,extra'), /more fields than the header/i);
});

test("identifies cost semantics instead of treating columns as equivalent", () => {
  const profile = detectCostProfile(parseCsv("EffectiveCost,Currency\n10,EUR"));
  assert.match(profile.profile, /amortized\/effective/i);
  assert.ok(profile.warnings.length);
});

test("accepts default blank policy fields so a selected export can be analyzed", () => {
  const policy = parseAllocationPolicy("CostCenter", "", "");
  assert.deepEqual(policy, { tagKey: "CostCenter", requiredTags: [], allowedValues: {} });
  const rows = normalizeAzureRows(parseCsv(sampleText), detectColumns(parseCsv(sampleText)));
  assert.equal(analyzeAllocation(rows, policy.tagKey, policy).recordCount, 5);
});

test("validates non-empty client policy rules and removes repeated required keys", () => {
  const policy = parseAllocationPolicy("CostCenter", "Environment\nEnvironment", "CostCenter=CC-1|CC-2\n");
  assert.deepEqual(policy.requiredTags, ["Environment"]);
  assert.deepEqual(policy.allowedValues.CostCenter, ["CC-1", "CC-2"]);
  assert.throws(() => parseAllocationPolicy("CostCenter", "", "bad-rule"), /invalid/i);
  assert.throws(() => parseAllocationPolicy("CostCenter", "", "CostCenter=A\ncostcenter=B"), /duplicated/i);
});

test("escapes spreadsheet formulas while preserving signed numeric costs", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(1)"), "\"'=HYPERLINK(1)\"");
  assert.equal(escapeCsvCell("  @SUM(A1)"), "\"'  @SUM(A1)\"");
  assert.equal(escapeCsvCell("-12.50"), "\"'-12.50\"");
  assert.equal(escapeCsvCell("\t=cmd"), "\"'\t=cmd\"");
  assert.equal(escapeCsvCell("\r@cmd"), "\"'\r@cmd\"");
  assert.equal(escapeCsvCell("-cmd"), "\"'-cmd\"");
});

test("renders hostile client metadata as text in the assessment", () => {
  const result = analyzeAllocation([{ cost: 1, currency: "EUR", resourceId: '<img src=x onerror=alert(1)>', date: "2026-01-01", service: "<script>alert(1)</script>", tags: {}, sourceRow: 2 }], "CostCenter");
  globalThis.document = { getElementById: () => ({ addEventListener() {} }) };
  const target = { innerHTML: "" };
  renderReport(result, target);
  assert.ok(!target.innerHTML.includes("<script>alert(1)</script>"));
  assert.ok(target.innerHTML.includes("&lt;script&gt;"));
  delete globalThis.document;
});

test("recognizes Azure usage detail aliases and excludes blank cost values", () => {
  const records = parseCsv('PreTaxCost,Currency,InstanceId,ResourceGroup,Tags\n"1,234.50",EUR,/subscriptions/sub-1/resourceGroups/app/providers/test/vm,app,"{""CostCenter"":""CC-1""}"\n,EUR,/subscriptions/sub-1/resourceGroups/app/providers/test/empty,app,');
  const rows = normalizeAzureRows(records, detectColumns(records));
  assert.equal(rows[0].cost, 1234.5);
  assert.equal(rows[0].currency, "EUR");
  assert.equal(rows[0].resourceId, "/subscriptions/sub-1/resourceGroups/app/providers/test/vm");
  assert.equal(rows[0].resourceGroup, "app");
  assert.equal(rows[1].cost, null);
});

test("applies required tag keys and allowed-value rules without counting invalid allocation values", () => {
  const records = parseCsv(sampleText);
  const rows = normalizeAzureRows(records, detectColumns(records));
  const result = analyzeAllocation(rows, "CostCenter", {
    requiredTags: ["Environment"],
    allowedValues: { CostCenter: ["CC-100", "CC-210"] }
  });

  assert.equal(result.totals.allocated, 614.1);
  assert.equal(result.totals.invalid, -12.5);
  assert.equal(result.policyIssueCount, 4);
  assert.ok(result.rows[1].policyIssues.includes("Missing required tag: CostCenter"));
  assert.ok(result.rows[4].policyIssues.includes("Invalid CostCenter value: CC-310"));
});

test("resolves approved tags from resource inventory and Azure scope mappings", () => {
  const costRecords = parseCsv(sampleText);
  const rows = normalizeAzureRows(costRecords, detectColumns(costRecords));
  const inventory = normalizeAzureInventory(parseCsv(inventoryText));
  const scopes = normalizeAzureScopes(parseCsv(scopesText));
  const result = analyzeAllocation(rows, "CostCenter", {
    requiredTags: ["Environment"],
    allowedValues: { CostCenter: ["CC-100", "CC-210", "CC-420"] }
  }, { inventory, scopes });

  assert.equal(result.inventoryMatchCount, 1);
  assert.equal(result.scopeCount, 2);
  assert.equal(result.rows[1].allocationValue, "CC-420");
  assert.equal(result.rows[1].allocationSource, "Resource group mapping");
  assert.equal(result.rows[3].allocationValue, "CC-100");
  assert.equal(result.rows[3].allocationSource, "Subscription mapping");
  assert.equal(result.rows[3].allocationStatus, "Allocated");
});

test("uses resource inventory tags before parent scope mappings and reports the source", () => {
  const costRecords = parseCsv(sampleText);
  const rows = normalizeAzureRows(costRecords, detectColumns(costRecords));
  const inventory = normalizeAzureInventory(parseCsv(inventoryText));
  const scopes = normalizeAzureScopes(parseCsv(scopesText));
  const rowIndex = rows.findIndex(row => row.resourceGroup === "rg-data");
  const matchedInventory = inventory.findIndex(item => item.resourceId.toLowerCase() === rows[rowIndex].resourceId.toLowerCase());
  inventory[matchedInventory] = { ...inventory[matchedInventory], tags: { CostCenter: "CC-210" } };
  const result = analyzeAllocation(rows, "CostCenter", {}, { inventory, scopes: scopes.filter(scope => scope.scopeType === "subscription") });

  assert.equal(result.rows[rowIndex].allocationValue, "CC-210");
  assert.equal(result.rows[rowIndex].allocationSource, "Resource inventory");
});

test("follows subscription hierarchy to an approved management group mapping", () => {
  const rows = [{
    cost: 10,
    currency: "EUR",
    resourceId: "/subscriptions/sub-9/resourceGroups/app/providers/Microsoft.Compute/virtualMachines/vm-1",
    subscriptionId: "sub-9",
    resourceGroup: "app",
    subscription: "Production",
    service: "Virtual Machines",
    tags: {}
  }];
  const scopes = [
    { scopeType: "subscription", scopeId: "subscriptions/sub-9", parentScopeId: "/providers/Microsoft.Management/managementGroups/engineering", tags: {} },
    { scopeType: "managementGroup", scopeId: "/providers/Microsoft.Management/managementGroups/engineering", parentScopeId: "", tags: { CostCenter: "CC-900" } }
  ];
  const result = analyzeAllocation(rows, "CostCenter", { allowedValues: { CostCenter: ["CC-900"] } }, { scopes });

  assert.equal(result.rows[0].allocationValue, "CC-900");
  assert.equal(result.rows[0].allocationSource, "Management group mapping");
  assert.equal(result.rows[0].allocationStatus, "Allocated");
});

test("separates policy-compliant spend and marks conflicting allocation evidence ambiguous", () => {
  const rows = [{ cost: 10, costColumn: "CostInBillingCurrency", currency: "EUR", resourceId: "/subscriptions/s/resourceGroups/r/providers/x/y/z", subscriptionId: "s", resourceGroup: "r", date: "2026-01-01", tags: { CostCenter: "A" }, sourceRow: 2 }];
  const result = analyzeAllocation(rows, "CostCenter", { requiredTags: ["Environment"] }, {
    scopes: [{ scopeType: "subscription", scopeId: "/subscriptions/s", tags: { CostCenter: "B" } }]
  });
  assert.equal(result.rows[0].allocationStatus, "Ambiguous: conflicting allocation values");
  assert.equal(result.coverage, 0);
  assert.equal(result.policyComplianceCoverage, 0);
  assert.equal(result.rows[0].allocationEvidence.length, 2);
});

test("rejects duplicate inventory IDs and cyclic scope mappings", () => {
  const rows = [{ cost: 10, currency: "EUR", resourceId: "/subscriptions/s/resourceGroups/r/providers/x/y/z", subscriptionId: "s", resourceGroup: "r", tags: {}, sourceRow: 2 }];
  const duplicateInventory = [{ resourceId: rows[0].resourceId, tags: {} }, { resourceId: rows[0].resourceId, tags: {} }];
  assert.throws(() => analyzeAllocation(rows, "CostCenter", {}, { inventory: duplicateInventory }), /duplicate resource IDs/i);
  const cyclicScopes = [
    { scopeType: "subscription", scopeId: "/subscriptions/s", parentScopeId: "/providers/Microsoft.Management/managementGroups/a", tags: {} },
    { scopeType: "managementGroup", scopeId: "/providers/Microsoft.Management/managementGroups/a", parentScopeId: "/subscriptions/s", tags: {} }
  ];
  assert.throws(() => analyzeAllocation(rows, "CostCenter", {}, { scopes: cyclicScopes }), /parent cycle/i);
});

test("returns N/A coverage for zero or negative net spend and keeps signed credits", () => {
  const makeRow = cost => ({ cost, currency: "USD", resourceId: "/subscriptions/s/resourceGroups/r/providers/x/y/z", date: "2026-01-01", tags: { CostCenter: "A" }, sourceRow: 2 });
  for (const costs of [[5, -5], [-8, 2]]) {
    const result = analyzeAllocation(costs.map(makeRow), "CostCenter");
    assert.ok(result.totals.total <= 0);
    assert.equal(result.coverage, null);
    assert.equal(result.policyComplianceCoverage, null);
  }
});

test("distinguishes direct, inherited, ambiguous, and unresolved spend", () => {
  const rows = [
    { cost: 10, currency: "EUR", resourceId: "/subscriptions/s/resourceGroups/r1/providers/x/y/a", tags: { CostCenter: "A" }, sourceRow: 2 },
    { cost: 20, currency: "EUR", resourceId: "/subscriptions/s/resourceGroups/r2/providers/x/y/b", tags: {}, sourceRow: 3 },
    { cost: 30, currency: "EUR", resourceId: "", tags: {}, sourceRow: 4 }
  ];
  const scopes = [{ scopeType: "resourceGroup", scopeId: "r2", parentScopeId: "", tags: { CostCenter: "B" } }];
  const result = analyzeAllocation(rows, "CostCenter", {}, { scopes });
  assert.equal(result.totals.direct, 10);
  assert.equal(result.totals.inherited, 20);
  assert.equal(result.totals.unresolved, 30);
});

test("reports hierarchy mappings with an unresolved parent scope", () => {
  const rows = [{ cost: 1, currency: "EUR", resourceId: "/subscriptions/s/r", tags: {}, sourceRow: 2 }];
  const scopes = [{ scopeType: "subscription", scopeId: "/subscriptions/s", parentScopeId: "/providers/Microsoft.Management/managementGroups/missing", tags: {} }];
  const result = analyzeAllocation(rows, "CostCenter", {}, { scopes });
  assert.match(result.hierarchyWarnings[0], /missing parent scope/i);
});

test("preserves duplicate cost records as separate source rows", () => {
  const raw = "CostInBillingCurrency,Currency,ResourceId,Tags\n10,USD,/subscriptions/s/r,\n10,USD,/subscriptions/s/r,";
  const rows = normalizeAzureRows(parseCsv(raw));
  const result = analyzeAllocation(rows, "CostCenter");
  assert.equal(result.recordCount, 2);
  assert.equal(result.totals.total, 20);
  assert.deepEqual(result.rows.map(row => row.sourceRow), [2, 3]);
});
