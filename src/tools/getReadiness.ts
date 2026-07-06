// chanter.get_readiness — readiness checklist for the MCP server.

import { CHANTER_PRODUCTS } from "../registry/products.js";
import { EXPOSED_TOOLS } from "../registry/tools.js";
import { validateReadOnly } from "../registry/permissions.js";

export interface GetReadinessResult {
  server: {
    name: string;
    version: string;
    checkpoint: string;
    status: "operational" | "degraded" | "not_ready";
  };
  products: Array<{
    id: string;
    displayName: string;
    readiness: string;
  }>;
  exposedTools: number;
  safetyStatus: {
    allToolsReadOnly: boolean;
    violations: string[];
  };
  auditEnabled: boolean;
  limitation: string;
  nextCheckpoint: string;
}

export async function handleGetReadiness(): Promise<GetReadinessResult> {
  const safetyViolations = validateReadOnly();

  const products = Object.values(CHANTER_PRODUCTS).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    readiness: p.readiness,
  }));

  return {
    server: {
      name: "CHANTER MCP Server – Max Edition",
      version: "0.1.0",
      checkpoint: "1 – Read-Only Foundation",
      status: safetyViolations.length > 0 ? "degraded" : "operational",
    },
    products,
    exposedTools: EXPOSED_TOOLS.length,
    safetyStatus: {
      allToolsReadOnly: safetyViolations.length === 0,
      violations: safetyViolations,
    },
    auditEnabled: true,
    limitation:
      "All tools are read-only. No write, commit, deploy, post, publish, or delete actions are exposed.",
    nextCheckpoint:
      "Add read-only git status summaries, test result summaries, and product readiness summaries (P1).",
  };
}
