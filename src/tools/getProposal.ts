// chanter.get_proposal — read one proposal by proposalId.

import { loadProposal } from "../proposals/proposalStore.js";
import type { DryRunProposal } from "../proposals/proposalTypes.js";

export interface GetProposalResult {
  found: boolean;
  error?: string;
  proposal?: DryRunProposal;
}

export async function handleGetProposal(
  proposalId: string
): Promise<GetProposalResult> {
  const id = proposalId.trim();
  if (!id) {
    return { found: false, error: "proposalId is required." };
  }

  try {
    const proposal = loadProposal(id);
    if (!proposal) {
      return {
        found: false,
        error: `Proposal not found: "${id}". It may have been cleaned up or the ID is incorrect.`,
      };
    }

    return { found: true, proposal };
  } catch (err: unknown) {
    return {
      found: false,
      error: `Error loading proposal: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
