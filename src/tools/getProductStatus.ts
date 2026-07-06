// chanter.get_product_status — detailed status for one product.

import { CHANTER_PRODUCTS } from "../registry/products.js";
import type { ChantProduct } from "../registry/products.js";

export interface GetProductStatusResult {
  found: boolean;
  error?: string;
  product?: {
    id: string;
    displayName: string;
    lane: string;
    riskLevel: string;
    description: string;
    readiness: string;
    localPath: string | null;
    allowedReadScopes: string[];
    forbiddenActions: string[];
    futureToolIdeas: Array<{
      name: string;
      description: string;
      riskLevel: string;
      requiresApproval: boolean;
    }>;
  };
}

export async function handleGetProductStatus(
  productId: string
): Promise<GetProductStatusResult> {
  const id = productId.trim().toLowerCase();
  const product: ChantProduct | undefined = CHANTER_PRODUCTS[id];

  if (!product) {
    return {
      found: false,
      error: `Unknown product: "${productId}". Known products: ${Object.keys(CHANTER_PRODUCTS).join(", ")}`,
    };
  }

  return {
    found: true,
    product: {
      id: product.id,
      displayName: product.displayName,
      lane: product.lane,
      riskLevel: product.riskLevel,
      description: product.description,
      readiness: product.readiness,
      localPath: product.localPath,
      allowedReadScopes: product.allowedReadScopes,
      forbiddenActions: product.forbiddenActions,
      futureToolIdeas: product.futureToolIdeas.map((idea) => ({
        name: idea.name,
        description: idea.description,
        riskLevel: idea.riskLevel,
        requiresApproval: idea.requiresApproval,
      })),
    },
  };
}
