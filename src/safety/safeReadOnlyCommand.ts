// Safe read-only command runner.
// ONLY executes a hardcoded allowlist of git commands.
// NEVER accepts arbitrary command strings, shell:true, or user-provided fragments.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type AllowedCommand = 
  | "git"       // only for allowlisted args

interface AllowedGitArgs {
  args: string[];
  command: "git";
}

const ALLOWED_GIT_COMMANDS: string[][] = [
  ["status", "--short"],
  ["rev-parse", "--abbrev-ref", "HEAD"],
  ["rev-parse", "--short", "HEAD"],
  ["log", "-1", "--pretty=%s"],
];

function isAllowedGitCommand(args: string[]): boolean {
  return ALLOWED_GIT_COMMANDS.some(
    (allowed) =>
      allowed.length === args.length &&
      allowed.every((a, i) => a === args[i])
  );
}

export interface SafeCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

const MAX_OUTPUT_LENGTH = 50_000; // 50KB cap
const DEFAULT_TIMEOUT_MS = 10_000; // 10s

/**
 * Run a safe, allowlisted read-only command.
 * 
 * @param cwd - Working directory for the command
 * @param gitArgs - Allowlisted git args ONLY
 */
export async function runSafeCommand(
  cwd: string,
  gitArgs: string[]
): Promise<SafeCommandResult> {
  // Security: only git with allowlisted args
  if (!isAllowedGitCommand(gitArgs)) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      error: `Rejected: git command with args [${gitArgs.join(", ")}] is not in the allowlist. Allowed: ${ALLOWED_GIT_COMMANDS.map(a => `[${a.join(", ")}]`).join(", ")}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      gitArgs,
      {
        cwd,
        timeout: DEFAULT_TIMEOUT_MS,
        windowsHide: true,       // no console window
        shell: false,            // NEVER shell:true
        encoding: "utf-8",
        maxBuffer: MAX_OUTPUT_LENGTH,
      }
    );

    const safeStdout = truncateAndSanitize(stdout);
    const safeStderr = truncateAndSanitize(stderr);

    return {
      success: true,
      stdout: safeStdout,
      stderr: safeStderr,
      exitCode: 0,
    };
  } catch (err: any) {
    // execFile throws on non-zero exit or errors
    const stdout = truncateAndSanitize(err.stdout ?? "");
    const stderr = truncateAndSanitize(err.stderr ?? "");
    const exitCode = err.code ?? null;

    return {
      success: false,
      stdout,
      stderr,
      exitCode,
      error: `Command failed with exit code ${exitCode}: ${err.message}`,
    };
  }
}

function truncateAndSanitize(output: string): string {
  if (output.length > MAX_OUTPUT_LENGTH) {
    return output.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
  }
  return output;
}

/**
 * Run multiple safe git commands in sequence for a product path.
 */
export async function runGitStatusBatch(
  cwd: string
): Promise<{
  gitAvailable: boolean;
  isRepo: boolean;
  branch: string | null;
  shortCommit: string | null;
  lastMessage: string | null;
  statusShort: string | null;
  dirty: boolean;
  changedFileCount: number;
  errors: string[];
}> {
  const results = {
    gitAvailable: false,
    isRepo: false,
    branch: null as string | null,
    shortCommit: null as string | null,
    lastMessage: null as string | null,
    statusShort: null as string | null,
    dirty: false,
    changedFileCount: 0,
    errors: [] as string[],
  };

  // Check if git is even available
  try {
    await execFileAsync("git", ["--version"], { cwd, timeout: 3000, windowsHide: true, shell: false });
    results.gitAvailable = true;
  } catch {
    results.errors.push("git executable not available");
    return results;
  }

  // Check if it's a git repo
  const revParse = await runSafeCommand(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!revParse.success) {
    results.errors.push("path is not a git repository");
    return results;
  }
  results.isRepo = true;
  results.branch = revParse.stdout.trim();

  // Short commit
  const shortCommit = await runSafeCommand(cwd, ["rev-parse", "--short", "HEAD"]);
  if (shortCommit.success) {
    results.shortCommit = shortCommit.stdout.trim();
  } else {
    results.errors.push(`short commit failed: ${shortCommit.error}`);
  }

  // Last message
  const lastMsg = await runSafeCommand(cwd, ["log", "-1", "--pretty=%s"]);
  if (lastMsg.success) {
    results.lastMessage = lastMsg.stdout.trim();
  } else {
    results.errors.push(`last message failed: ${lastMsg.error}`);
  }

  // Status
  const status = await runSafeCommand(cwd, ["status", "--short"]);
  if (status.success) {
    results.statusShort = status.stdout.trim();
    const lines = results.statusShort ? results.statusShort.split("\n").filter(l => l.trim()) : [];
    results.changedFileCount = lines.length;
    results.dirty = lines.length > 0;
  } else {
    results.errors.push(`status failed: ${status.error}`);
  }

  return results;
}
