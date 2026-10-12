export function analyzeAllocation(rows, tagKey, policy = {}, data = {}) {
  const valid = rows.filter(row => row.cost !== null);
  if (!valid.length) throw new Error("No valid numeric costs were found in the selected column.");

  const currencies = [...new Set(valid.map(row => row.currency).filter(Boolean))];
  if (currencies.length > 1) throw new Error("This export contains multiple currencies. Filter it to one billing currency before analyzing so totals are not combined incorrectly.");
  const currencyMissing = valid.some(row => !row.currency);
  const costColumns = [...new Set(valid.map(row => row.costColumn).filter(Boolean))];
  if (costColumns.length > 1) throw new Error("This export combines multiple cost measures. Analyze one cost column at a time.");

  const inventory = buildInventoryIndex(data.inventory ?? []);
  const scopes = buildScopeIndex(data.scopes ?? []);
  if (inventory.duplicates.length) throw new Error(`Resource inventory contains ${inventory.duplicates.length} duplicate resource IDs. Resolve duplicates before analysis.`);
  if (scopes.duplicates.length) throw new Error(`Hierarchy mappings contain ${scopes.duplicates.length} duplicate scope IDs. Resolve duplicates before analysis.`);
  if (scopes.cycles.length) throw new Error(`Hierarchy mappings contain a parent cycle involving ${scopes.cycles.length} scope(s). Resolve cycles before analysis.`);
  const keys = new Set(valid.flatMap(row => Object.keys(row.tags)));
  const actualTagKey = [...keys].find(key => key.toLowerCase() === tagKey.trim().toLowerCase()) ?? tagKey.trim();
  const requiredKeys = [...new Set([actualTagKey, ...(policy.requiredTags ?? [])].map(key => String(key).trim()).filter(Boolean))];
  const allowedValues = normalizeAllowedValues(policy.allowedValues ?? {});
  const totals = { total: 0, allocated: 0, direct: 0, inherited: 0, invalid: 0, unallocated: 0, ambiguous: 0, unresolved: 0 };
  const policyCompliant = { spend: 0, records: 0 };

  const findings = valid.map(row => {
    const inventoryRow = inventory.index.get(normalizeId(row.resourceId));
    const resourceGroup = row.resourceGroup || inventoryRow?.resourceGroup || resourceGroupFromId(row.resourceId);
    const subscriptionId = row.subscriptionId || inventoryRow?.subscriptionId || subscriptionFromId(row.resourceId);
    const ancestry = resolveScopes(scopes, { resourceGroup, subscriptionId, resourceId: row.resourceId, inventoryRow });
    const candidates = [
      { tags: row.tags, source: "Cost export metadata" },
      { tags: inventoryRow?.tags ?? {}, source: "Resource inventory" },
      ...ancestry.map(scope => ({ tags: scope.tags, source: scope.scopeTypeLabel }))
    ];
    const allocationCandidates = candidates.map(candidate => ({ source: candidate.source, value: getTagValue(candidate.tags, actualTagKey) })).filter(candidate => candidate.value);
    const conflictingAllocationValues = [...new Set(allocationCandidates.map(candidate => candidate.value.toLowerCase()))].length > 1;
    const { tags: effectiveTags, sources: tagSources } = mergeTags(candidates);
    const allocationValue = getTagValue(effectiveTags, actualTagKey);
    const allocationSource = getTagSource(tagSources, actualTagKey);
    const allocationValues = allowedValuesFor(allowedValues, actualTagKey);
    const allocationIsInvalid = Boolean(allocationValue && allocationValues && !includesIgnoreCase(allocationValues, allocationValue));
    const policyIssues = [];

    for (const key of requiredKeys) {
      const value = getTagValue(effectiveTags, key);
      if (!value) policyIssues.push(`Missing required tag: ${key}`);
      else {
        const accepted = allowedValuesFor(allowedValues, key);
        if (accepted && !includesIgnoreCase(accepted, value)) policyIssues.push(`Invalid ${key} value: ${value}`);
      }
    }
    if (!policyIssues.length) { policyCompliant.spend += row.cost; policyCompliant.records += 1; }

    totals.total += row.cost;
    let allocationStatus;
    if (allocationIsInvalid) {
      totals.invalid += row.cost;
      allocationStatus = "Invalid allocation tag";
    } else if (conflictingAllocationValues) {
      totals.ambiguous += row.cost;
      allocationStatus = "Ambiguous: conflicting allocation values";
    } else if (allocationValue) {
      totals.allocated += row.cost;
      if (allocationSource === "Cost export metadata") totals.direct += row.cost;
      else totals.inherited += row.cost;
      allocationStatus = "Allocated";
    } else if (!row.resourceId) {
      totals.unresolved += row.cost;
      allocationStatus = "Unresolved: no resource ID";
    } else {
      totals.unallocated += row.cost;
      allocationStatus = "Unallocated";
    }

    return {
      ...row,
      resourceGroup,
      subscriptionId,
      allocationValue,
      allocationSource,
      allocationEvidence: allocationCandidates,
      conflictingAllocationValues,
      allocationStatus,
      policyIssues,
      recommendedAction: remediationFor(policyIssues, allocationStatus, actualTagKey, allocationValues),
      inventoryMatched: Boolean(inventoryRow),
      inventoryTags: inventoryRow?.tags ?? {},
      effectiveTags,
      effectiveTagSources: tagSources,
      findingId: `AZ-${String(row.sourceRow).padStart(6, "0")}`
    };
  }).map(row => ({
    ...row,
    spendImpact: Math.abs(row.cost),
    priority: !row.policyIssues.length && row.allocationStatus === "Allocated" ? "No action" : "Review",
    ownerRole: "Client to assign",
    confidence: row.conflictingAllocationValues ? "Low · conflicting evidence" : row.allocationStatus.startsWith("Unresolved") ? "Low · insufficient source data" : row.allocationStatus === "Unallocated" ? "Medium · no approved value found" : "High · matched explicit metadata"
  }));

  const coverage = totals.total > 0 ? totals.allocated / totals.total : null;
  const period = valid.map(row => row.date).filter(Boolean).sort();
  const subscriptions = [...new Set(valid.map(row => row.subscription).filter(Boolean))].sort();
  const generatedAt = new Date().toISOString();
  const assessmentId = stableHash(`${generatedAt}:${rows.length}:${data.filename ?? "local"}`);
  return {
    tagKey: actualTagKey,
    requiredKeys,
    allowedValues,
    totals,
    coverage,
    policyComplianceCoverage: totals.total > 0 ? policyCompliant.spend / totals.total : null,
    policyCompliant,
    currency: currencies[0] || "Currency not provided",
    periodStart: period[0] ?? "Not provided",
    periodEnd: period.at(-1) ?? "Not provided",
    subscriptions,
    rows: findings,
    recordCount: valid.length,
    skippedCount: rows.length - valid.length,
    inventoryCount: inventory.index.size,
    inventoryMatchCount: findings.filter(row => row.inventoryMatched).length,
    scopeCount: data.scopes?.length ?? 0,
    hierarchyWarnings: scopes.missingParents.map(parent => `Missing parent scope mapping: ${parent}`),
    currencyMissing,
    costColumn: costColumns[0] ?? "Not provided",
    policyHash: stableHash(JSON.stringify({ tagKey: actualTagKey, requiredKeys, allowedValues })),
    assessmentId,
    generatedAt,
    profile: data.profile ?? null,
    sourceFile: data.filename ? String(data.filename).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) : "Sample data",
    tagObserved: keys.size > 0 || findings.some(row => Object.keys(row.effectiveTags).length > 0),
    policyIssueCount: findings.filter(row => row.policyIssues.length > 0).length
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildInventoryIndex(records) {
  const index = new Map();
  const duplicates = new Set();
  for (const record of records) if (record.resourceId) {
    const id = normalizeId(record.resourceId);
    if (index.has(id)) duplicates.add(id);
    index.set(id, record);
  }
  return { index, duplicates: [...duplicates] };
}

function buildScopeIndex(records) {
  const byTypeAndId = new Map();
  const byId = new Map();
  const duplicates = new Set();
  for (const scope of records) {
    const normalized = { ...scope, scopeTypeLabel: labelForScope(scope.scopeType), aliases: scopeAliases(scope) };
    for (const alias of normalized.aliases) {
      if (byId.has(normalizeId(alias)) && byId.get(normalizeId(alias)).scopeId !== scope.scopeId) duplicates.add(normalizeId(alias));
      byId.set(normalizeId(alias), normalized);
      byTypeAndId.set(`${normalizeScopeType(scope.scopeType)}:${normalizeId(alias)}`, normalized);
    }
  }
  const cycles = [];
  const missingParents = [];
  for (const scope of records) {
    if (scope.parentScopeId && !findScopeById({ byId }, scope.parentScopeId)) missingParents.push(scope.parentScopeId);
    const visited = new Set();
    let current = scope;
    while (current?.parentScopeId) {
      const id = normalizeId(current.scopeId);
      if (visited.has(id)) { cycles.push(id); break; }
      visited.add(id);
      current = byId.get(normalizeId(current.parentScopeId)) ?? null;
    }
  }
  return { byTypeAndId, byId, duplicates: [...duplicates], cycles: [...new Set(cycles)], missingParents: [...new Set(missingParents)] };
}

function resolveScopes(index, { resourceGroup, subscriptionId, resourceId, inventoryRow }) {
  const groupId = resourceGroupScopeFromId(resourceId) || resourceGroupScopeFromId(inventoryRow?.resourceId);
  const group = findScope(index, "resourceGroup", [groupId, resourceGroup]);
  const subscription = findScope(index, "subscription", [subscriptionId, `/subscriptions/${subscriptionId}`]);
  const ordered = [];
  const seen = new Set();
  const addWithParents = scope => {
    let current = scope;
    while (current && !seen.has(normalizeId(current.scopeId))) {
      seen.add(normalizeId(current.scopeId));
      ordered.push(current);
      current = current.parentScopeId ? findScopeById(index, current.parentScopeId) : null;
    }
  };
  addWithParents(group);
  addWithParents(subscription);
  return ordered;
}

function findScopeById(index, id) {
  const exact = index.byId.get(normalizeId(id));
  if (exact) return exact;
  const reference = String(id).match(/(?:subscriptions|resourceGroups|managementGroups)\/([^/]+)/i)?.[1];
  return reference ? index.byId.get(normalizeId(reference)) : null;
}

function findScope(index, type, aliases) {
  for (const alias of aliases.filter(Boolean)) {
    const found = index.byTypeAndId.get(`${normalizeScopeType(type)}:${normalizeId(alias)}`);
    if (found) return found;
  }
  return null;
}

function scopeAliases(scope) {
  const aliases = [scope.scopeId];
  const normalizedType = normalizeScopeType(scope.scopeType);
  const id = scope.scopeId;
  if (normalizedType === "resourcegroup") {
    const match = id.match(/resourceGroups\/([^/]+)/i);
    if (match) aliases.push(match[1]);
  }
  if (normalizedType === "subscription") {
    const match = id.match(/subscriptions\/([^/]+)/i);
    if (match) aliases.push(match[1]);
  }
  return aliases;
}

function normalizeScopeType(type = "") { return String(type).toLowerCase().replace(/[\s_-]/g, ""); }
function labelForScope(type = "scope") {
  const normalized = normalizeScopeType(type);
  if (normalized === "resourcegroup") return "Resource group mapping";
  if (normalized === "subscription") return "Subscription mapping";
  if (normalized === "managementgroup") return "Management group mapping";
  return "Approved hierarchy mapping";
}
function normalizeId(value = "") { return String(value).trim().replace(/\/$/, "").toLowerCase(); }
function resourceGroupScopeFromId(value = "") { return String(value).match(/^(.*\/resourceGroups\/[^/]+)/i)?.[1] ?? ""; }
function resourceGroupFromId(value = "") { return String(value).match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? ""; }
function subscriptionFromId(value = "") { return String(value).match(/\/subscriptions\/([^/]+)/i)?.[1] ?? ""; }

function mergeTags(candidates) {
  const tags = {};
  const sources = {};
  for (const candidate of candidates) {
    for (const [key, rawValue] of Object.entries(candidate.tags ?? {})) {
      const value = String(rawValue ?? "").trim();
      if (!value || Object.keys(tags).some(existing => existing.toLowerCase() === key.toLowerCase())) continue;
      tags[key] = value;
      sources[key.toLowerCase()] = candidate.source;
    }
  }
  return { tags, sources };
}

function getTagValue(tags, key) {
  const found = Object.entries(tags).find(([tagKey]) => tagKey.toLowerCase() === key.toLowerCase());
  return String(found?.[1] ?? "").trim();
}
function getTagSource(sources, key) { return sources[key.toLowerCase()] ?? ""; }

function normalizeAllowedValues(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter(rule => rule?.key).map(rule => [String(rule.key).trim(), (rule.values ?? []).map(String)]));
  }
  return Object.fromEntries(Object.entries(value).map(([key, values]) => [
    String(key).trim(), (Array.isArray(values) ? values : [values]).map(item => String(item).trim()).filter(Boolean)
  ]));
}
function allowedValuesFor(rules, tagKey) {
  const found = Object.entries(rules).find(([key]) => key.toLowerCase() === tagKey.toLowerCase());
  return found?.[1]?.length ? found[1] : null;
}
function includesIgnoreCase(values, candidate) { return values.some(value => value.toLowerCase() === candidate.toLowerCase()); }

function remediationFor(issues, status, tagKey, acceptedValues) {
  if (issues.length) {
    return issues.map(issue => issue.startsWith("Invalid ")
      ? `Replace the invalid value with an approved ${tagKey} value${acceptedValues ? ` (${acceptedValues.join(", ")})` : ""}.`
      : `Add the missing required tag at the resource or an approved parent scope.`).join(" ");
  }
  if (status === "Unresolved: no resource ID") return "Reconcile this charge to a resource or provide an approved subscription-level allocation mapping.";
  if (status === "Unallocated") return `Confirm the owner and add an approved ${tagKey} tag or scope mapping.`;
  if (status === "Invalid allocation tag") return `Replace the value with an approved ${tagKey} value.`;
  return "";
}
