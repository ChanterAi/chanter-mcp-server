// Central registry of forbidden actions.
// Any MCP tool call matching these patterns is rejected.

export interface ForbiddenActionPattern {
  pattern: RegExp;
  category: string;
  description: string;
}

export const FORBIDDEN_ACTION_PATTERNS: ForbiddenActionPattern[] = [
  {
    pattern: /\bdeploy\b/i,
    category: "deployment",
    description: "Deployment actions are forbidden in this checkpoint.",
  },
  {
    pattern: /\bpost\b/i,
    category: "posting",
    description: "Posting/publishing actions are forbidden.",
  },
  {
    pattern: /\bpublish\b/i,
    category: "posting",
    description: "Publishing actions are forbidden.",
  },
  {
    pattern: /\bdelete\b/i,
    category: "destructive",
    description: "Delete actions are forbidden.",
  },
  {
    pattern: /\bcommit\b/i,
    category: "vcs",
    description: "Commit actions are forbidden.",
  },
  {
    pattern: /\bpush\b/i,
    category: "vcs",
    description: "Push actions are forbidden.",
  },
  {
    pattern: /\btoken_?access\b/i,
    category: "auth",
    description: "Token access is forbidden.",
  },
  {
    pattern: /\bsecret_?access\b/i,
    category: "auth",
    description: "Secret access is forbidden.",
  },
  {
    pattern: /\bexec\b/i,
    category: "execution",
    description: "Arbitrary command execution is forbidden.",
  },
  {
    pattern: /\bcommand\b/i,
    category: "execution",
    description: "Arbitrary command execution is forbidden.",
  },
  {
    pattern: /\bmodify.*production.*db\b/i,
    category: "database",
    description: "Production database modification is forbidden.",
  },
  {
    pattern: /\boa?uth\b.*\b(?:change|modify|update|set)\b/i,
    category: "auth",
    description: "OAuth setting modification is forbidden.",
  },
  {
    pattern: /\btiktok.*live.*post\b/i,
    category: "posting",
    description: "TikTok live posting is forbidden.",
  },
  {
    pattern: /\bvercel.*(?:deploy|production|change)\b/i,
    category: "deployment",
    description: "Vercel production changes are forbidden.",
  },
  {
    pattern: /\brender.*(?:deploy|production)\b/i,
    category: "deployment",
    description: "Render production changes are forbidden.",
  },
];

/**
 * Check a tool name and input against forbidden action patterns.
 * Returns the first match found, or null if safe.
 */
export function detectForbiddenAction(
  toolName: string,
  inputSummary: string
): ForbiddenActionPattern | null {
  const combined = `${toolName} ${inputSummary}`;
  for (const pattern of FORBIDDEN_ACTION_PATTERNS) {
    if (pattern.pattern.test(combined)) {
      return pattern;
    }
  }
  return null;
}
