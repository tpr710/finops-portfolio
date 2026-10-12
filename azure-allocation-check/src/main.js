import { parseCsv, detectColumns, detectCostProfile, normalizeAzureRows, normalizeAzureInventory, normalizeAzureScopes } from "./azureCsv.js";
import { analyzeAllocation } from "./analyze.js";
import { renderReport } from "./report.js";
import { parseAllocationPolicy } from "./policy.js";

const fileInput = document.getElementById("file-input");
const inventoryInput = document.getElementById("inventory-file");
const scopeInput = document.getElementById("scope-file");
const tagInput = document.getElementById("tag-key");
const requiredTagsInput = document.getElementById("required-tags");
const allowedValuesInput = document.getElementById("allowed-values");
const analyzeButton = document.getElementById("analyze");
const status = document.getElementById("status");
const report = document.getElementById("report");
const empty = document.getElementById("empty-state");
const dropzone = document.getElementById("dropzone");
let selectedFile = null;
let selectedInventoryFile = null;
let selectedScopeFile = null;
let selectedText = null;

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  setFile(file);
  fileInput.value = "";
});
inventoryInput.addEventListener("change", () => {
  selectedInventoryFile = setOptionalFile(inventoryInput.files?.[0], "inventory-name", "resource inventory");
  inventoryInput.value = "";
  if (selectedFile && selectedInventoryFile) setStatus("Resource inventory ready. Click Analyze export when your inputs are ready.");
});
scopeInput.addEventListener("change", () => {
  selectedScopeFile = setOptionalFile(scopeInput.files?.[0], "scope-name", "hierarchy mappings");
  scopeInput.value = "";
  if (selectedFile && selectedScopeFile) setStatus("Hierarchy mappings ready. Click Analyze export when your inputs are ready.");
});
for (const event of ["dragenter", "dragover"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add("dragover"); });
for (const event of ["dragleave", "drop"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove("dragover"); });
dropzone.addEventListener("drop", e => setFile(e.dataTransfer.files?.[0]));
analyzeButton.addEventListener("click", () => selectedFile && analyzeFile(selectedFile));
document.getElementById("sample-button").addEventListener("click", () => analyzeText(sampleCsv(), "sample-azure-cost-export.csv"));

function setFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv") || file.size > 50_000_000) {
    selectedFile = null; selectedText = null; analyzeButton.disabled = true;
    document.getElementById("file-name").textContent = "Your file is analyzed locally and is not uploaded.";
    document.getElementById("file-summary").textContent = "";
    dropzone.classList.remove("has-file");
    setStatus(file.size > 50_000_000 ? "This file exceeds the 50 MB local analysis limit." : "Please choose a CSV export file.", true);
    return;
  }
  selectedFile = file;
  selectedText = null;
  dropzone.classList.add("has-file");
  document.getElementById("file-summary").textContent = "Checking CSV headers…";
  document.getElementById("file-name").textContent = file.name;
  analyzeButton.disabled = true;
  setStatus("Checking the selected file locally…");
  readFileText(file).then(text => {
    if (selectedFile !== file) return;
    const records = parseCsv(text);
    const profile = detectCostProfile(records);
    const columns = detectColumns(records);
    selectedText = text;
    document.getElementById("file-summary").textContent = `${records.length.toLocaleString()} data rows · Cost: ${columns.cost} · ${columns.currency || "Currency not provided"} · ${profile.profile}`;
    analyzeButton.disabled = false;
    setStatus(`File ready. Set the client policy if needed, then click Analyze export.`);
  }).catch(error => {
    if (selectedFile !== file) return;
    selectedText = null;
    document.getElementById("file-summary").textContent = "File could not be prepared.";
    analyzeButton.disabled = true;
    showAnalysisError(error.message || "Could not read this CSV.");
  });
}

async function analyzeFile(file) {
  analyzeButton.disabled = true;
  setStatus("Reading export…");
  try {
    const inventoryRecords = selectedInventoryFile ? parseCsv(await readFileText(selectedInventoryFile)) : [];
    const scopeRecords = selectedScopeFile ? parseCsv(await readFileText(selectedScopeFile)) : [];
    const context = {
      inventory: inventoryRecords.length ? normalizeAzureInventory(inventoryRecords) : [],
      scopes: scopeRecords.length ? normalizeAzureScopes(scopeRecords) : []
    };
    const text = selectedText ?? await readFileText(file);
    analyzeText(text, file.name, context);
  }
  catch (error) { showAnalysisError(error.message || "Could not read this file."); }
  finally { analyzeButton.disabled = !(selectedFile && selectedText); }
}

function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The browser could not read this file."));
    reader.readAsText(file);
  });
}

function analyzeText(text, filename, context = {}) {
  try {
    const records = parseCsv(text);
    const columns = detectColumns(records);
    const profile = detectCostProfile(records);
    const rows = normalizeAzureRows(records, columns);
    const policy = parseAllocationPolicy(tagInput.value, requiredTagsInput.value, allowedValuesInput.value);
    const result = analyzeAllocation(rows, policy.tagKey, policy, { ...context, profile, filename });
    empty.hidden = true;
    report.hidden = false;
    renderReport(result, report);
    document.getElementById("file-name").textContent = filename;
    document.getElementById("file-summary").textContent = filename === "sample-azure-cost-export.csv" ? `Sample dataset · ${result.recordCount} rows · ${result.costColumn} · ${result.currency}` : document.getElementById("file-summary").textContent;
    setStatus(`Analyzed ${result.recordCount.toLocaleString()} valid records · ${profile.profile}${profile.warnings.length ? ` · ${profile.warnings.join(" ")}` : ""}${result.skippedCount ? ` · skipped ${result.skippedCount} invalid cost rows` : ""}.`);
  } catch (error) { showAnalysisError(error.message || "Could not analyze this export."); }
}

function showAnalysisError(message) {
  const safeMessage = String(message).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  empty.hidden = true;
  report.hidden = false;
  report.innerHTML = `<div class="analysis-error"><span class="error-mark" aria-hidden="true">!</span><p class="eyebrow">COULDN’T BUILD THE ALLOCATION PICTURE</p><h3>We couldn’t analyze this file.</h3><p>${safeMessage}</p><p>Use an Azure Cost Management CSV export with a supported cost column, such as <strong>CostInBillingCurrency</strong>, <strong>Cost</strong>, or <strong>PreTaxCost</strong>.</p><button class="text-button" id="try-sample">Try the sample file instead →</button></div>`;
  setStatus(message, true);
  analyzeButton.disabled = !(selectedFile && selectedText);
  document.getElementById("try-sample").addEventListener("click", () => analyzeText(sampleCsv(), "sample-azure-cost-export.csv"));
}

function setStatus(message, error = false) { status.textContent = message; status.classList.toggle("error", error); }

function setOptionalFile(file, labelId, description) {
  if (!file) return null;
  if (!file.name.toLowerCase().endsWith(".csv") || file.size > 50_000_000) {
    const message = file.size > 50_000_000 ? `The ${description} file exceeds the 50 MB limit.` : `Choose a CSV file for the ${description}.`;
    document.getElementById(labelId).textContent = "Not selected";
    setStatus(message, true);
    return null;
  }
  document.getElementById(labelId).textContent = file.name;
  return file;
}

function sampleCsv() {
  return `Date,SubscriptionName,ResourceId,ServiceName,CostInBillingCurrency,BillingCurrency,Tags\n2026-09-01,Production,/subscriptions/111/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/vm-api,Virtual Machines,428.70,EUR,"{\""\"CostCenter\""\":\""\"CC-210\""\",\""\"Environment\""\":\""\"Production\""}"\n2026-09-01,Production,/subscriptions/111/resourceGroups/rg-data/providers/Microsoft.Storage/storageAccounts/stdata,Storage,92.15,EUR,"{\""\"Environment\""\":\""\"Production\""}"\n2026-09-01,Shared,/subscriptions/222/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-hub,Virtual Network,185.40,EUR,"{\""\"CostCenter\""\":\""\"CC-100\""}"\n2026-09-01,Shared,,Bandwidth,64.25,EUR,\n2026-09-01,Development,/subscriptions/333/resourceGroups/rg-test/providers/Microsoft.Compute/virtualMachines/vm-test,Virtual Machines,-12.50,EUR,"{\""\"CostCenter\""\":\""\"CC-310\""}"`;
}
