#!/usr/bin/env node
/**
 * Wrapper around the Tauri CLI that keeps the native build inside Windows'
 * 260-character path limit.
 *
 * whisper.cpp is compiled by CMake through MSBuild, which writes FileTracker
 * logs several directories below the cargo target directory. When the checkout
 * itself sits deep in the filesystem those paths run past MAX_PATH and the
 * build fails with `FTK1011: could not create the new file tracking log file`,
 * which reports as "the C compiler is not able to compile a simple test
 * program" and hides the real cause.
 *
 * Rather than ask anyone to move the repository, point cargo at a short target
 * directory when the checkout is deep enough for it to matter. Shallow
 * checkouts keep the conventional `src-tauri/target`.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = path.join(projectRoot, "src-tauri");

// MSBuild needs roughly 150 characters of headroom below the target directory
// for CMake's deepest scratch paths.
const SAFE_CRATE_PATH_LENGTH = 90;

const env = { ...process.env };
if (
  process.platform === "win32" &&
  !env.CARGO_TARGET_DIR &&
  crateDir.length > SAFE_CRATE_PATH_LENGTH
) {
  env.CARGO_TARGET_DIR = path.join(homedir(), ".toefl-companion-build");
  console.log(
    `[tauri] checkout is ${crateDir.length} characters deep; building to ${env.CARGO_TARGET_DIR} to stay under the Windows path limit.`,
  );
}

const cli = path.join(projectRoot, "node_modules", ".bin", "tauri");
const child = spawn(cli, process.argv.slice(2), {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
child.on("error", (error) => {
  console.error(`[tauri] could not start the Tauri CLI: ${error.message}`);
  process.exit(1);
});
