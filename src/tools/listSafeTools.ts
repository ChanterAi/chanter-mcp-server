// chanter.list_safe_tools — exposed tools with permission levels.

import { EXPOSED_TOOLS } from "../registry/tools.js";
import { PERMISSIONS } from "../registry/permissions.js";

export interface ListSafeToolsResult {
  count: number;
  tools: Array<{
    name: string;
    description: string;
    permissionLevel: string;
  }>;
}

export async function handleListSafeTools(): Promise<ListSafeToolsResult> {
  const tools = EXPOSED_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    permissionLevel: PERMISSIONS[tool.name]?.level ?? "unknown",
  }));

  return { count: tools.length, tools };
}
