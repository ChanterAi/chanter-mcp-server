// chanter.git_status — safe read-only git status summary for a product.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CHANTER_PRODUCTS } from "../registry/products.js";
import { runGitStatusBatch } from "../safety/safeReadOnlyCommand.js";

const CHANTER_ROOT = process.env.CHANTER_ROOT ?? "C:\\Users\\IT\\OneDrive\\Desktop\\CHANTER";

export interface GitStatusResult {
  productId: string;
  displayName: string;
  path: string;
  pathExists: boolean;
  gitAvailable: boolean;
  isRepo: boolean;
  branch: string | null;
  shortCommit: string | null;
  lastMessage: string | null;
  dirty: boolean;
  changedFileCount: number;
  files: string[] | null;
  errors: string[];
}

export async function handleGitStatus(
  productId?: string,
  includeFiles: boolean = false,
  maxFiles: number = 25
): Promise<GitStatusResult> {
  // If no productId specified, use CHANTER_ROOT
  if (!productId) {
    const result = await runGitStatusBatch(CHANTER_ROOT);
    let files: string[] | null = null;
    if (includeFiles && result.statusShort) {
      files = result.statusShort
        .split("\n")
        .filter(l => l.trim())
        .slice(0, maxFiles);
    }

    return {
      productId: "chanter_root",
      displayName: "CHANTER Workspace Root",
      path: CHANTER_ROOT,
      pathExists: existsSync(CHANTER_ROOT),
      gitAvailable: result.gitAvailable,
      isRepo: result.isRepo,
      branch: result.branch,
      shortCommit: result.shortCommit,
      lastMessage: result.lastMessage,
      dirty: result.dirty,
      changedFileCount: result.changedFileCount,
      files,
      errors: result.errors,
    };
  }

  // Look up product
  const id = productId.trim().toLowerCase();
  const product = CHANTER_PRODUCTS[id];

  if (!product) {
    return {
      productId: id,
      displayName: `Unknown: ${productId}`,
      path: "",
      pathExists: false,
      gitAvailable: false,
      isRepo: false,
      branch: null,
      shortCommit: null,
      lastMessage: null,
      dirty: false,
      changedFileCount: 0,
      files: null,
      errors: [`Unknown product: "${productId}". Known products: ${Object.keys(CHANTER_PRODUCTS).join(", ")}`],
    };
  }

  const productPath = product.localPath
    ? join(CHANTER_ROOT, product.localPath)
    : CHANTER_ROOT;
  const pathExists = existsSync(productPath);

  if (!pathExists) {
    return {
      productId: product.id,
      displayName: product.displayName,
      path: productPath,
      pathExists: false,
      gitAvailable: false,
      isRepo: false,
      branch: null,
      shortCommit: null,
      lastMessage: null,
      dirty: false,
      changedFileCount: 0,
      files: null,
      errors: [`Product path does not exist: ${productPath}`],
    };
  }

  const result = await runGitStatusBatch(productPath);

  let files: string[] | null = null;
  if (includeFiles && result.statusShort) {
    files = result.statusShort
      .split("\n")
      .filter(l => l.trim())
      .slice(0, maxFiles);
  }

  return {
    productId: product.id,
    displayName: product.displayName,
    path: productPath,
    pathExists,
    gitAvailable: result.gitAvailable,
    isRepo: result.isRepo,
    branch: result.branch,
    shortCommit: result.shortCommit,
    lastMessage: result.lastMessage,
    dirty: result.dirty,
    changedFileCount: result.changedFileCount,
    files,
    errors: result.errors,
  };
}
