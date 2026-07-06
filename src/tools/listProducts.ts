// chanter.list_products — returns product registry summary.

import { CHANTER_PRODUCTS } from "../registry/products.js";
import type { ChantProduct } from "../registry/products.js";

export interface ListProductsResult {
  count: number;
  products: Array<{
    id: string;
    displayName: string;
    lane: string;
    riskLevel: string;
    readiness: string;
    description: string;
  }>;
}

export async function handleListProducts(): Promise<ListProductsResult> {
  const products = Object.values(CHANTER_PRODUCTS).map((p: ChantProduct) => ({
    id: p.id,
    displayName: p.displayName,
    lane: p.lane,
    riskLevel: p.riskLevel,
    readiness: p.readiness,
    description: p.description,
  }));

  return {
    count: products.length,
    products,
  };
}
