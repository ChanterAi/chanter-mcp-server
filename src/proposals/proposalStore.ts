// Proposal store â€” file-based persistence for dry-run proposals.
// Stores proposals as individual JSON files in .mcp-proposals/.
// Path-safe. Prevents traversal. Never writes outside .mcp-proposals/ or .mcp-audit/.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import type {
  DryRunProposal,
  ProposalSummary,
  ProposalStatus,
} from "./proposalTypes.js";

const PROPOSALS_DIR = join(import.meta.dirname!, "..", "..", ".mcp-proposals");
const MAX_PROPOSALS = 1000;
const MAX_FILE_SIZE = 100_000; // 100KB

function ensureProposalsDir(): void {
  if (!existsSync(PROPOSALS_DIR)) {
    mkdirSync(PROPOSALS_DIR, { recursive: true });
  }
}

/**
 * Validate that a proposal ID is safe (no path traversal).
 */
function isValidProposalId(proposalId: string): boolean {
  // Only allow alphanumeric, hyphens, underscores â€” no path separators, dots, etc.
  return /^[a-zA-Z0-9\-_]+$/.test(proposalId) && proposalId.length > 0 && proposalId.length <= 100;
}

function proposalPath(proposalId: string): string {
  if (!isValidProposalId(proposalId)) {
    throw new Error(`Invalid proposalId: "${proposalId}". Only alphanumeric, hyphens, and underscores allowed.`);
  }
  const filePath = normalize(join(PROPOSALS_DIR, `${proposalId}.json`));
  // Defense-in-depth: ensure resolved path stays within PROPOSALS_DIR
  if (!filePath.startsWith(resolve(PROPOSALS_DIR) + sep)) {
    throw new Error("Path traversal blocked: proposal path escapes storage directory.");
  }
  return filePath;
}

/**
 * Save a proposal to disk.
 */
export function saveProposal(proposal: DryRunProposal): void {
  ensureProposalsDir();

  // Check max count
  const existing = listProposalFiles();
  if (existing.length >= MAX_PROPOSALS && !existing.includes(`${proposal.proposalId}.json`)) {
    throw new Error(`Proposal limit reached (${MAX_PROPOSALS}). Clean up old proposals first.`);
  }

  const filePath = proposalPath(proposal.proposalId);
  const json = JSON.stringify(proposal, null, 2);
  if (json.length > MAX_FILE_SIZE) {
    throw new Error(`Proposal exceeds maximum file size (${MAX_FILE_SIZE} bytes).`);
  }
  writeFileSync(filePath, json, "utf-8");
}

/**
 * Load a proposal by ID.
 */
export function loadProposal(proposalId: string): DryRunProposal | null {
  ensureProposalsDir();
  try {
    const filePath = proposalPath(proposalId);
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as DryRunProposal;
  } catch {
    return null;
  }
}

/**
 * List proposal files.
 */
function listProposalFiles(): string[] {
  ensureProposalsDir();
  try {
    return readdirSync(PROPOSALS_DIR).filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/**
 * List proposals with optional filters.
 */
export function listProposals(
  productId?: string,
  status?: ProposalStatus,
  limit: number = 20
): ProposalSummary[] {
  const capped = Math.min(Math.max(limit, 1), 50);
  const files = listProposalFiles();
  const summaries: ProposalSummary[] = [];

  for (const file of files) {
    const id = file.replace(".json", "");
    const proposal = loadProposal(id);
    if (!proposal) continue;

    // Filter by productId
    if (productId && proposal.productId !== productId.toLowerCase()) continue;

    // Filter by status
    if (status && proposal.status !== status) continue;

    const latestReview = proposal.reviewHistory.length > 0
      ? proposal.reviewHistory[proposal.reviewHistory.length - 1]
      : null;

    summaries.push({
      proposalId: proposal.proposalId,
      productId: proposal.productId,
      productDisplayName: proposal.productDisplayName,
      actionType: proposal.actionType,
      riskLevel: proposal.riskLevel,
      status: proposal.status,
      executionStatus: proposal.executionStatus,
      createdAt: proposal.createdAt,
      objective: proposal.objective.slice(0, 200),
      reviewerNote: latestReview?.notes?.slice(0, 200),
    });

    if (summaries.length >= capped) break;
  }

  return summaries;
}

/**
 * Delete expired proposals.
 */
export function cleanupExpiredProposals(): number {
  const now = new Date();
  const files = listProposalFiles();
  let removed = 0;

  for (const file of files) {
    const id = file.replace(".json", "");
    const proposal = loadProposal(id);
    if (!proposal) continue;

    if (new Date(proposal.expiresAt) < now) {
      try {
        const filePath = proposalPath(proposal.proposalId);
        unlinkSync(filePath);
        removed++;
      } catch {
        // skip if file already gone
      }
    }
  }

  return removed;
}

