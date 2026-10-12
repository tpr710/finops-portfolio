export function parseCsv(text) {
  if (typeof text !== "string") throw new Error("The selected file could not be read as text.");
  if (text.length > 50_000_000) throw new Error("This CSV is larger than the 50 MB local analysis limit.");
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell.length) throw new Error(`Unexpected quote in CSV row ${rows.length + 1}.`);
      quoted = true;
    }
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const nonempty = rows.filter(r => r.some(v => v.trim() !== ""));
  if (nonempty.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
  const headers = nonempty[0].map(h => h.trim().replace(/^\uFEFF/, ""));
  if (headers.length > 500) throw new Error("The CSV has more than 500 columns; reduce the export fields and try again.");
  if (headers.some(header => !header)) throw new Error("The CSV contains an empty column name.");
  if (new Set(headers.map(header => header.toLowerCase())).size !== headers.length) throw new Error("The CSV contains duplicate column names that differ only by capitalization.");
  if (nonempty.length > 500_001) throw new Error("This CSV has more than 500,000 rows; split the export and analyze each period separately.");
  if (headers.some(header => header.length > 500)) throw new Error("A CSV column name exceeds the 500-character limit.");
  return nonempty.slice(1).map((values, index) => {
    if (values.length > headers.length) throw new Error(`CSV row ${index + 2} has more fields than the header.`);
    if (values.some(value => value.length > 100_000)) throw new Error(`CSV row ${index + 2} contains a field over the 100,000-character limit.`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i];
    if (char === '"' && firstLine[i + 1] === '"' && quoted) i += 1;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && Object.hasOwn(counts, char)) counts[char] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ",";
}

const aliases = {
  cost: ["CostInBillingCurrency", "Cost", "PreTaxCost", "EffectiveCost", "BilledCost", "CostInUSD"],
  currency: ["BillingCurrency", "BillingCurrencyCode", "Currency"],
  resourceId: ["ResourceId", "ResourceID", "InstanceId", "ResourceUri", "id"],
  date: ["Date", "UsageDate", "ChargePeriodStart"],
  subscriptionId: ["SubscriptionId", "subscriptionId"],
  subscriptionName: ["SubscriptionName", "subscriptionName"],
  resourceGroup: ["ResourceGroup", "ResourceGroupName", "resourceGroup"],
  resourceName: ["ResourceName", "Name", "name"],
  service: ["ServiceName", "ConsumedService", "Service"]
};

function findKey(record, candidates) {
  const keys = Object.keys(record);
  for (const candidate of candidates) {
    const found = keys.find(key => key.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function parseTags(record) {
  const tags = {};
  for (const [key, value] of Object.entries(record)) {
    const match = key.match(/^(?:tags?\s*[:.]\s*|tag\s*\[)(.+?)(?:\])?$/i);
    if (match && String(value).trim()) tags[match[1].trim()] = String(value).trim();
  }
  const tagsKey = findKey(record, ["Tags", "Tag"]);
  if (tagsKey && String(record[tagsKey]).trim()) {
    try {
      const parsed = JSON.parse(record[tagsKey]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(tags, parsed);
    } catch { /* Keep any flattened tag fields when the source isn't JSON. */ }
  }
  return tags;
}

function baseColumns(record) {
  return Object.fromEntries(Object.entries(aliases).map(([name, options]) => [name, findKey(record, options)]));
}

function fieldValue(record, key) { return key ? String(record[key] ?? "").trim() : ""; }

export function detectColumns(records) { return baseColumns(records[0] ?? {}); }

export function detectCostProfile(records) {
  const columns = detectColumns(records);
  if (!columns.cost) throw new Error("Could not find a supported cost column. Expected CostInBillingCurrency, PreTaxCost, Cost, EffectiveCost, or BilledCost.");
  const name = columns.cost.toLowerCase();
  const profile = name === "costinbillingcurrency" ? "Azure Cost Details · billing currency" :
    name === "pretaxcost" ? "Azure usage details · pre-tax cost" :
    name === "effectivecost" ? "Azure amortized/effective cost · confirm export type" :
    name === "billedcost" ? "Azure billed cost · confirm export type" :
    name === "costinusd" ? "Azure cost in USD · converted currency" : "Generic cost column · semantics require confirmation";
  const warnings = [];
  if (name === "effectivecost" || name === "billedcost" || name === "cost") warnings.push("Confirm whether this is actual, amortized, or billed cost before comparing totals.");
  if (name === "costinusd") warnings.push("Values are in USD; do not compare to billing-currency totals without conversion context.");
  return { costColumn: columns.cost, profile, warnings };
}

export function normalizeAzureRows(records, columns = detectColumns(records)) {
  const costKey = columns.cost;
  if (!costKey) throw new Error("Could not find a cost column. Expected CostInBillingCurrency, PreTaxCost, Cost, or EffectiveCost.");
  return records.map((raw, index) => {
    const cost = parseCostNumber(fieldValue(raw, costKey));
    return {
      source: "azure-cost-export",
      sourceRow: index + 2,
      costColumn: columns.cost,
      cost: Number.isFinite(cost) ? cost : null,
      currency: fieldValue(raw, columns.currency) || (/^costinusd$/i.test(columns.cost) ? "USD" : ""),
      resourceId: fieldValue(raw, columns.resourceId),
      date: fieldValue(raw, columns.date),
      subscriptionId: fieldValue(raw, columns.subscriptionId),
      subscription: fieldValue(raw, columns.subscriptionName) || fieldValue(raw, columns.subscriptionId),
      resourceGroup: fieldValue(raw, columns.resourceGroup),
      resourceName: fieldValue(raw, columns.resourceName),
      service: fieldValue(raw, columns.service),
      tags: parseTags(raw),
      raw
    };
  });
}

function parseCostNumber(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, ""));
  if (/^-?(?:\d{1,3}(\.\d{3})+|\d+),\d+$/.test(raw)) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+,\d+$/.test(raw)) return Number(raw.replace(",", "."));
  return Number.isFinite(Number(raw)) ? Number(raw) : null;
}

export function normalizeAzureInventory(records) {
  if (!records.length) return [];
  const columns = baseColumns(records[0]);
  if (!columns.resourceId) throw new Error("The inventory CSV needs an Azure resource ID column, usually ResourceId or id.");
  return records.map(raw => ({
    resourceId: fieldValue(raw, columns.resourceId),
    subscriptionId: fieldValue(raw, columns.subscriptionId),
    subscription: fieldValue(raw, columns.subscriptionName) || fieldValue(raw, columns.subscriptionId),
    resourceGroup: fieldValue(raw, columns.resourceGroup),
    resourceName: fieldValue(raw, columns.resourceName),
    tags: parseTags(raw)
  })).filter(resource => resource.resourceId);
}

export function normalizeAzureScopes(records) {
  if (!records.length) return [];
  const first = records[0];
  const scopeIdKey = findKey(first, ["ScopeId", "ScopeID", "id", "Id"]);
  if (!scopeIdKey) throw new Error("The hierarchy CSV needs a ScopeId column.");
  const typeKey = findKey(first, ["ScopeType", "Type"]);
  const parentKey = findKey(first, ["ParentScopeId", "ParentId"]);
  const tagKey = findKey(first, ["TagKey", "AllocationTag"]);
  const valueKey = findKey(first, ["TagValue", "AllocationValue"]);
  return records.map(raw => {
    const scopeId = fieldValue(raw, scopeIdKey);
    const scopeType = fieldValue(raw, typeKey) || inferScopeType(scopeId);
    const tags = parseTags(raw);
    if (tagKey && valueKey && fieldValue(raw, tagKey)) tags[fieldValue(raw, tagKey)] = fieldValue(raw, valueKey);
    return { scopeId, scopeType, parentScopeId: fieldValue(raw, parentKey), tags };
  }).filter(scope => scope.scopeId);
}

function inferScopeType(id) {
  const normalized = id.toLowerCase();
  if (normalized.includes("/resourcegroups/")) return "resourceGroup";
  if (normalized.includes("/subscriptions/")) return "subscription";
  if (normalized.includes("/managementgroups/")) return "managementGroup";
  return "scope";
}
