// Product Registry – typed definitions for all CHANTER products
// exposed through this MCP server.

export type ProductLane =
  | "commercial"
  | "internal_control"
  | "infrastructure"
  | "brand";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ReadScope =
  | "product:summary"
  | "product:status"
  | "product:readiness"
  | "workspace:presence";

export interface FutureToolIdea {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface ChantProduct {
  id: string;
  displayName: string;
  lane: ProductLane;
  riskLevel: RiskLevel;
  localPath: string | null;
  description: string;
  allowedReadScopes: ReadScope[];
  forbiddenActions: string[];
  futureToolIdeas: FutureToolIdea[];
  readiness: "planned" | "in_progress" | "operational" | "paused";
}

export const CHANTER_PRODUCTS: Record<string, ChantProduct> = {
  autoposter: {
    id: "autoposter",
    displayName: "AutoPoster",
    lane: "commercial",
    riskLevel: "critical",
    localPath: "apps/chanter-auto-poster",
    description:
      "TikTok/Instagram posting and scheduling system. Multi-account and multi-channel content distribution.",
    allowedReadScopes: ["product:summary", "product:status"],
    forbiddenActions: [
      "post",
      "publish",
      "schedule_live",
      "tiktok_live_post",
      "instagram_live_post",
      "delete_scheduled",
      "modify_oauth",
    ],
    futureToolIdeas: [
      {
        name: "autoposter.get_queue",
        description: "Read-only view of the scheduled post queue.",
        riskLevel: "medium",
        requiresApproval: false,
      },
      {
        name: "autoposter.propose_campaign",
        description:
          "Propose a campaign structure. Requires human approval before any posting.",
        riskLevel: "high",
        requiresApproval: true,
      },
    ],
    readiness: "in_progress",
  },

  clean_engine: {
    id: "clean_engine",
    displayName: "Clean Engine",
    lane: "commercial",
    riskLevel: "high",
    localPath: "apps/clean-engine",
    description:
      "Image and video enhancement pipeline. File and job processing for CHANTER media products.",
    allowedReadScopes: ["product:summary", "product:status", "workspace:presence"],
    forbiddenActions: [
      "delete_file",
      "overwrite_file",
      "modify_pipeline",
      "access_secrets",
      "read_env",
    ],
    futureToolIdeas: [
      {
        name: "clean_engine.job_status",
        description: "Read-only status of enhancement jobs.",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        name: "clean_engine.propose_enhancement",
        description:
          "Propose an enhancement job. Requires human approval before processing.",
        riskLevel: "medium",
        requiresApproval: true,
      },
    ],
    readiness: "in_progress",
  },

  operator: {
    id: "operator",
    displayName: "Operator",
    lane: "internal_control",
    riskLevel: "critical",
    localPath: "apps/CHANTER Operator",
    description:
      "Internal execution console and review system. Future control plane for all CHANTER operations.",
    allowedReadScopes: ["product:summary", "product:status"],
    forbiddenActions: [
      "deploy",
      "commit",
      "push",
      "execute_arbitrary",
      "modify_production_db",
      "bypass_gate",
    ],
    futureToolIdeas: [
      {
        name: "operator.get_dashboard",
        description: "Read-only dashboard summary.",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        name: "operator.approve_action",
        description:
          "Approve a proposed action. Integration point for Operator approval gate.",
        riskLevel: "critical",
        requiresApproval: true,
      },
    ],
    readiness: "planned",
  },

  loop_governor: {
    id: "loop_governor",
    displayName: "Loop Governor",
    lane: "internal_control",
    riskLevel: "high",
    localPath: "apps/loop-governor",
    description:
      "Manual/controlled agent loop orchestration with product-aware recommendations. Audit-safe execution management.",
    allowedReadScopes: ["product:summary", "product:status"],
    forbiddenActions: [
      "autonomous_execution",
      "bypass_human_review",
      "skip_audit",
      "modify_policy",
    ],
    futureToolIdeas: [
      {
        name: "loop_governor.get_state",
        description: "Read current loop state and recommendations.",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        name: "loop_governor.propose_step",
        description:
          "Propose next orchestration step. Requires human approval.",
        riskLevel: "medium",
        requiresApproval: true,
      },
    ],
    readiness: "in_progress",
  },

  safecommit: {
    id: "safecommit",
    displayName: "SafeCommit",
    lane: "internal_control",
    riskLevel: "high",
    localPath: "apps/chanter-SafeCommit",
    description:
      "Code review, risk scanning, validation, and commit safety tool. Future approval gate before write/commit/deploy actions.",
    allowedReadScopes: ["product:summary", "product:status", "workspace:presence"],
    forbiddenActions: [
      "commit",
      "push",
      "deploy",
      "bypass_review",
      "skip_validation",
    ],
    futureToolIdeas: [
      {
        name: "safecommit.scan_diff",
        description: "Scan current git diff for risks. Read-only.",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        name: "safecommit.validate_proposal",
        description:
          "Validate a proposed change against safety rules. Required before any commit action.",
        riskLevel: "high",
        requiresApproval: true,
      },
    ],
    readiness: "operational",
  },

  chanter_site: {
    id: "chanter_site",
    displayName: "CHANTER Site",
    lane: "brand",
    riskLevel: "medium",
    localPath: "apps/chanter-premium-site",
    description:
      "CHANTER premium brand website. Public-facing brand presence.",
    allowedReadScopes: ["product:summary", "product:status", "workspace:presence"],
    forbiddenActions: [
      "deploy_production",
      "modify_dns",
      "modify_vercel",
      "post_live_content",
    ],
    futureToolIdeas: [
      {
        name: "chanter_site.get_status",
        description: "Read deployment and site status.",
        riskLevel: "low",
        requiresApproval: false,
      },
    ],
    readiness: "operational",
  },
};

/**
 * Validate all required products are present in the registry.
 */
export function validateProductRegistry(): string[] {
  const required = [
    "autoposter",
    "clean_engine",
    "operator",
    "loop_governor",
    "safecommit",
    "chanter_site",
  ];
  const missing: string[] = [];
  for (const id of required) {
    if (!CHANTER_PRODUCTS[id]) {
      missing.push(id);
    }
  }
  return missing;
}
