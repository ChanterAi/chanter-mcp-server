const fs = require("fs");
const base = process.argv[2];

let tools = fs.readFileSync(base + "/src/registry/tools.ts", "utf8");
const toolsInsert = `

  // === P3B: SafeCommit Review Bridge ===
  {
    name: "chanter.get_safecommit_requirements",
    description: "Get SafeCommit review requirements for a proposal. Determines if review is required based on product, action, keywords, and gates. Returns validation checklist and blockers. Metadata only.",
    permissionLevel: "read_internal",
    parameters: [
      { name: "proposalId", description: "The proposal ID.", type: "string", required: true },
    ],
  },
  {
    name: "chanter.attach_safecommit_review",
    description: "Attach a SafeCommit-style review to a proposal. Includes verdict, risk level, validation checks, and blockers. Does NOT commit, push, or execute. Metadata only.",
    permissionLevel: "write_proposed",
    parameters: [
      { name: "proposalId", description: "The proposal ID.", type: "string", required: true },
      { name: "reviewer", description: "Name of the SafeCommit reviewer.", type: "string", required: true },
      { name: "verdict", description: "Verdict: safe_to_review, needs_changes, blocked, or unsafe.", type: "string", required: true },
      { name: "riskLevel", description: "Risk level: low, medium, high, or critical.", type: "string", required: true },
      { name: "notes", description: "Optional review notes.", type: "string", required: false },
      { name: "validationChecks", description: "Optional array of validation check results.", type: "string", required: false },
      { name: "blockers", description: "Optional array of review blockers.", type: "string", required: false },
    ],
  },
  {
    name: "chanter.get_proposal_evidence_bundle",
    description: "Return a complete evidence bundle for a proposal: product, risk, operator reviews, SafeCommit reviews, human reviews, snapshots. Summaries only. No file contents, diffs, or secrets.",
    permissionLevel: "read_internal",
    parameters: [
      { name: "proposalId", description: "The proposal ID.", type: "string", required: true },
    ],
  },`;

tools = tools.replace("];", toolsInsert + "\n];");
fs.writeFileSync(base + "/src/registry/tools.ts", tools, "utf8");

let perm = fs.readFileSync(base + "/src/registry/permissions.ts", "utf8");
const permInsert = `
  "chanter.get_safecommit_requirements": { toolName: "chanter.get_safecommit_requirements", level: "read_internal", description: "Get SafeCommit review requirements for a proposal.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: true, requiresOperatorGate: false },
  "chanter.attach_safecommit_review": { toolName: "chanter.attach_safecommit_review", level: "write_proposed", description: "Attach SafeCommit review metadata to a proposal.", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: true, requiresOperatorGate: false },
  "chanter.get_proposal_evidence_bundle": { toolName: "chanter.get_proposal_evidence_bundle", level: "read_internal", description: "Get complete evidence bundle for a proposal.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },`;

const lastEntry = '"chanter.attach_operator_review"';
perm = perm.replace(lastEntry, permInsert.trim() + "\n  " + lastEntry);
fs.writeFileSync(base + "/src/registry/permissions.ts", perm, "utf8");

console.log("done");
