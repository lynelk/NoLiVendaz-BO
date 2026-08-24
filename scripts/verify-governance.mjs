import { existsSync, readFileSync } from "node:fs";

const requiredDocuments = [
  "docs/compliance/README.md",
  "docs/compliance/INTEGRATED_POLICY.md",
  "docs/compliance/QMS.md",
  "docs/compliance/ISMS.md",
  "docs/compliance/ITSM.md",
  "docs/compliance/BCMS.md",
  "docs/compliance/FINANCIAL_MESSAGING.md",
  "docs/compliance/SUSTAINABLE_FINANCE.md",
  "docs/compliance/AUDIT_AND_EVIDENCE.md",
  "docs/compliance/ISO_CONTROL_MATRIX.md",
  "docs/compliance/CONTROL_REGISTER.json"
];

for (const path of requiredDocuments) {
  if (!existsSync(path)) throw new Error(`Missing controlled governance document: ${path}`);
}

const register = JSON.parse(readFileSync("docs/compliance/CONTROL_REGISTER.json", "utf8"));
if (!register || !Array.isArray(register.controls) || register.controls.length === 0) {
  throw new Error("CONTROL_REGISTER.json must contain a non-empty controls array");
}

const requiredStandards = new Set([
  "ISO9001",
  "ISO27001",
  "ISO27000",
  "ISO20000-1",
  "ISO27032",
  "ISO22301",
  "ISO20022",
  "ISO8583",
  "ISO9362",
  "ISO32212"
]);
const coveredStandards = new Set();
const ids = new Set();
const allowedStatuses = new Set(["IMPLEMENTED", "PARTIAL", "FRAMEWORK", "CONDITIONAL"]);
const allowedApplicability = new Set(["REQUIRED", "CONDITIONAL", "NOT_APPLICABLE"]);

for (const control of register.controls) {
  if (!control.id || ids.has(control.id)) throw new Error(`Control id is missing or duplicated: ${control.id ?? "<empty>"}`);
  ids.add(control.id);
  if (!Array.isArray(control.standards) || control.standards.length === 0) throw new Error(`${control.id}: standards are required`);
  for (const standard of control.standards) coveredStandards.add(standard);
  if (!control.title?.trim()) throw new Error(`${control.id}: title is required`);
  if (!control.ownerRole?.trim()) throw new Error(`${control.id}: ownerRole is required`);
  if (!allowedStatuses.has(control.status)) throw new Error(`${control.id}: unsupported status ${control.status}`);
  if (!allowedApplicability.has(control.applicability)) throw new Error(`${control.id}: unsupported applicability ${control.applicability}`);
  if (!control.reviewCadence?.trim()) throw new Error(`${control.id}: reviewCadence is required`);
  if (!Array.isArray(control.evidence) || control.evidence.length === 0) throw new Error(`${control.id}: evidence references are required`);
  for (const evidence of control.evidence) {
    if (!existsSync(evidence)) throw new Error(`${control.id}: referenced evidence does not exist: ${evidence}`);
  }
}

for (const standard of requiredStandards) {
  if (!coveredStandards.has(standard)) throw new Error(`Control register does not cover required standard: ${standard}`);
}

console.log(`Governance check passed: ${register.controls.length} controls across ${coveredStandards.size} standard references.`);
