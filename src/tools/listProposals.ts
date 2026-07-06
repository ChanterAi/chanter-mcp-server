// chanter.list_proposals — list recent dry-run proposals with optional filters.

import { listProposals as listStore } from "../proposals/proposalStore.js";
import type { ProposalStatus, ProposalSummary } from "../proposals/proposalTypes.js";

export interface ListProposalsResult {
  count: number;
  proposals: ProposalSummary[];
  filters: {
    productId?: string;
    status?: string;
    limit: number;
  };
}

export async function handleListProposals(
  productId?: string,
  status?: string,
  limit: number = 20
): Promise<ListProposalsResult> {
  // Validate status filter
  const validStatuses: ProposalStatus[] = [
    "draft", "pending_approval", "approved", "rejected", "needs_changes", "expired",
  ];
  const statusFilter = status && validStatuses.includes(status as ProposalStatus)
    ? (status as ProposalStatus)
    : undefined;

  // Clean up expired proposals first
  const { cleanupExpiredProposals } = await import("../proposals/proposalStore.js");
  cleanupExpiredProposals();

  const proposals = listStore(
    productId?.trim().toLowerCase(),
    statusFilter,
    limit
  );

  return {
    count: proposals.length,
    proposals,
    filters: {
      productId: productId?.trim().toLowerCase(),
      status: statusFilter,
      limit,
    },
  };
}
