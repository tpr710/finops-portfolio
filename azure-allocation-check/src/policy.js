export function parseAllocationPolicy(tagKey, requiredText = "", allowedText = "") {
  const allocationKey = String(tagKey ?? "").trim();
  if (!allocationKey) throw new Error("Enter the allocation tag key to assess.");
  const requiredTags = [...new Set(String(requiredText).split(/[\n,]/).map(key => key.trim()).filter(Boolean))];
  const allowedValues = {};
  for (const line of String(allowedText).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Allowed value rule is invalid: “${line}”. Use TagKey=value1|value2.`);
    const key = line.slice(0, separator).trim();
    const values = line.slice(separator + 1).split("|").map(value => value.trim()).filter(Boolean);
    if (!key || !values.length) throw new Error(`Allowed value rule is incomplete: “${line}”.`);
    if (Object.keys(allowedValues).some(existing => existing.toLowerCase() === key.toLowerCase())) throw new Error(`Allowed value rule for “${key}” is duplicated.`);
    allowedValues[key] = [...new Set(values)];
  }
  return { tagKey: allocationKey, requiredTags, allowedValues };
}
