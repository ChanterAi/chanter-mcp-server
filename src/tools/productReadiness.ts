// chanter.product_readiness â€” product readiness with registry, git, and validation data.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CHANTER_PRODUCTS } from "../registry/products.js";
import { runGitStatusBatch } from "../safety/safeReadOnlyCommand.js";
import { handleTestSummary } from "./testSummary.js";

const CHANTER_ROOT = process.env.CHANTER_ROOT ?? "C:\\Users\\IT\\OneDrive\\Desktop\\CHANTER";

export interface ProductReadinessResult {
  productId: string;
  displayName: string;
  lane: string;
  riskLevel: string;
  pathExists: boolean;
  gitStatusAvailable: boolean;
  dirtyState: boolean;
  validationScriptsAvailable: boolean;
  readinessScore: number;
  blockers: string[];
  recommendedNextAction: string;
  details: {
    path: string;
    branch: string | null;
    shortCommit: string | null;
    validationCommands: {
      test: boolean;
      build: boolean;
      typecheck: boolean;
      lint: boolean;
    };
    errors: string[];
  };
}

export async function handleProductReadiness(
  productId: string
): Promise<ProductReadinessResult> {
  const id = productId.trim().toLowerCase();
  const product = CHANTER_PRODUCTS[id];

  if (!product) {
    return {
      productId: id,
      displayName: `Unknown: ${productId}`,
      lane: "unknown",
      riskLevel: "unknown",
      pathExists: false,
      gitStatusAvailable: false,
      dirtyState: false,
      validationScriptsAvailable: false,
      readinessScore: 0,
      blockers: [`Unknown product: "${productId}"`],
      recommendedNextAction: "Verify product ID. Known products: " + Object.keys(CHANTER_PRODUCTS).join(", "),
      details: {
        path: "",
        branch: null,
        shortCommit: null,
        validationCommands: { test: false, build: false, typecheck: false, lint: false },
        errors: [`Unknown product: "${productId}"`],
      },
    };
  }

  const productPath = product.localPath
    ? join(CHANTER_ROOT, product.localPath)
    : CHANTER_ROOT;

  const pathExists = existsSync(productPath);
  let score = 0;
  const blockers: string[] = [];
  const errors: string[] = [];

  // +20: Product registered
  score += 20;

  // +20: Path exists
  let gitStatusAvailable = false;
  let dirtyState = false;
  let branch: string | null = null;
  let shortCommit: string | null = null;

  if (pathExists) {
    score += 20;

    // +20: Git status available
    const gitResult = await runGitStatusBatch(productPath);
    gitStatusAvailable = gitResult.isRepo;
    if (gitStatusAvailable) {
      score += 20;
      dirtyState = gitResult.dirty;
      branch = gitResult.branch;
      shortCommit = gitResult.shortCommit;

      // +20: Clean working tree
      if (!dirtyState) {
        score += 20;
      } else {
        errors.push(`Working tree is dirty (${gitResult.changedFileCount} changed files)`);

        // If critical risk + dirty: add blocker
        if (product.riskLevel === "critical") {
          blockers.push(
            `CRITICAL product "${product.displayName}" has a dirty working tree (${gitResult.changedFileCount} changed files). Review changes before proceeding.`
          );
        }
      }
    } else {
      errors.push("Path is not a git repository or git is unavailable");
    }
  } else {
    // Path missing â€” cap score at 30
    errors.push(`Product path does not exist: ${productPath}`);
    if (score > 30) score = 30;
  }

  // +20: Validation scripts available
  let validationScriptsAvailable = false;
  let validationCommands = { test: false, build: false, typecheck: false, lint: false };

  if (pathExists) {
    const testResult = await handleTestSummary(product.id);
    validationScriptsAvailable =
      testResult.validationCommandsAvailable.test ||
      testResult.validationCommandsAvailable.build ||
      testResult.validationCommandsAvailable.typecheck;
    
    validationCommands = {
      test: testResult.validationCommandsAvailable.test,
      build: testResult.validationCommandsAvailable.build,
      typecheck: testResult.validationCommandsAvailable.typecheck,
      lint: testResult.validationCommandsAvailable.lint,
    };

    if (validationScriptsAvailable) {
      score += 20;
    } else {
      errors.push("No validation scripts (test, build, or typecheck) found in package.json");
    }

    // Push test summary errors
    errors.push(...testResult.errors);
  }

  // Determine recommended next action
  let recommendedNextAction: string;
  if (!pathExists) {
    recommendedNextAction = `Create or restore the product directory at ${productPath}.`;
  } else if (!gitStatusAvailable) {
    recommendedNextAction = `Initialize git in ${productPath} or verify git is installed.`;
  } else if (dirtyState) {
    if (product.riskLevel === "critical") {
      recommendedNextAction = `BLOCKED: Review and resolve dirty working tree before any action on ${product.displayName}.`;
    } else {
      recommendedNextAction = `Review changed files and commit or stash changes. Then re-run readiness.`;
    }
  } else if (!validationScriptsAvailable) {
    recommendedNextAction = `Add test, build, or typecheck scripts to package.json. Alternatively, implement a product-specific readiness adapter.`;
  } else {
    recommendedNextAction = `Product ${product.displayName} is ready for inspection. Run tests with the project's test command to verify.`;
  }

  // Safety: ensure score never exceeds 100
  if (score > 100) score = 100;

  return {
    productId: product.id,
    displayName: product.displayName,
    lane: product.lane,
    riskLevel: product.riskLevel,
    pathExists,
    gitStatusAvailable,
    dirtyState,
    validationScriptsAvailable,
    readinessScore: score,
    blockers,
    recommendedNextAction,
    details: {
      path: productPath,
      branch,
      shortCommit,
      validationCommands,
      errors,
    },
  };
}
