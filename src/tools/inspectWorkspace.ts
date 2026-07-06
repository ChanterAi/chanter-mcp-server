// chanter.inspect_workspace — high-level workspace presence check.
// SAFETY: Does NOT read secrets, scan large directories, or access .env.

import { existsSync } from "node:fs";
import { join } from "node:path";

const CHANTER_ROOT = process.env.CHANTER_ROOT ?? "C:\\Users\\IT\\OneDrive\\Desktop\\CHANTER";

const EXPECTED_PATHS: Record<string, string> = {
  autoposter: "apps/chanter-auto-poster",
  clean_engine: "apps/clean-engine",
  operator: "apps/CHANTER Operator",
  loop_governor: "apps/loop-governor",
  safecommit: "apps/SafeCommit",
  chanter_site: "apps/chanter-premium-site",
  mcp_server: "apps/Mcp Chanter Max",
};

export interface InspectWorkspaceResult {
  root: string;
  rootExists: boolean;
  apps: Record<string, { expectedPath: string; exists: boolean }>;
  summary: string;
}

export async function handleInspectWorkspace(): Promise<InspectWorkspaceResult> {
  const root = CHANTER_ROOT;
  const rootExists = existsSync(root);
  const apps: Record<string, { expectedPath: string; exists: boolean }> = {};

  for (const [name, relPath] of Object.entries(EXPECTED_PATHS)) {
    const fullPath = join(root, relPath);
    apps[name] = {
      expectedPath: relPath,
      exists: existsSync(fullPath),
    };
  }

  const present = Object.values(apps).filter((a) => a.exists).length;
  const total = Object.keys(apps).length;
  const summary = `CHANTER workspace at ${root}: ${rootExists ? "found" : "NOT FOUND"}. ${present}/${total} expected app directories present.`;

  return { root, rootExists, apps, summary };
}
