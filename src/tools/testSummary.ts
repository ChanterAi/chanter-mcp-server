// chanter.test_summary — safe test/build command metadata for a product.
// Does NOT execute scripts. Only inspects package.json/config files.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHANTER_PRODUCTS } from "../registry/products.js";
import { redactSensitiveValues } from "../safety/redaction.js";

const CHANTER_ROOT = process.env.CHANTER_ROOT ?? "C:\\Users\\IT\\OneDrive\\Desktop\\CHANTER";

export interface TestSummaryResult {
  productId: string;
  displayName: string;
  path: string;
  pathExists: boolean;
  packageJsonFound: boolean;
  availableScripts: Record<string, string>;
  validationCommandsAvailable: {
    test: boolean;
    build: boolean;
    typecheck: boolean;
    lint: boolean;
    dev: boolean;
  };
  errors: string[];
}

type RunMode = "metadata_only" | "latest_known";

export async function handleTestSummary(
  productId: string,
  runMode: RunMode = "metadata_only"
): Promise<TestSummaryResult> {
  const id = productId.trim().toLowerCase();
  const product = CHANTER_PRODUCTS[id];

  if (!product) {
    return {
      productId: id,
      displayName: `Unknown: ${productId}`,
      path: "",
      pathExists: false,
      packageJsonFound: false,
      availableScripts: {},
      validationCommandsAvailable: {
        test: false,
        build: false,
        typecheck: false,
        lint: false,
        dev: false,
      },
      errors: [`Unknown product: "${productId}"`],
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
      packageJsonFound: false,
      availableScripts: {},
      validationCommandsAvailable: {
        test: false,
        build: false,
        typecheck: false,
        lint: false,
        dev: false,
      },
      errors: [`Product path does not exist: ${productPath}`],
    };
  }

  // Inspect package.json — NEVER read .env or secrets
  const errors: string[] = [];
  let packageJsonFound = false;
  const availableScripts: Record<string, string> = {};

  const pkgPath = join(productPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);

      if (pkg.scripts && typeof pkg.scripts === "object") {
        packageJsonFound = true;
        for (const [name, cmd] of Object.entries(pkg.scripts) as [string, string][]) {
          // Redact sensitive-looking script values
          availableScripts[name] = redactSensitiveValues(cmd);
        }
      } else {
        errors.push("package.json found but no scripts field");
      }
    } catch (err: unknown) {
      errors.push(`Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    errors.push("No package.json found in product path");
  }

  const validationCommandsAvailable = {
    test: "test" in availableScripts,
    build: "build" in availableScripts,
    typecheck: "typecheck" in availableScripts,
    lint: "lint" in availableScripts,
    dev: "dev" in availableScripts,
  };

  // runMode "latest_known" is a placeholder for future cached output readers
  // In Checkpoint P1, we do NOT execute scripts
  if (runMode === "latest_known") {
    errors.push("runMode 'latest_known' is not yet supported — no test results are cached. Returning metadata_only.");
  }

  return {
    productId: product.id,
    displayName: product.displayName,
    path: productPath,
    pathExists,
    packageJsonFound,
    availableScripts,
    validationCommandsAvailable,
    errors,
  };
}
