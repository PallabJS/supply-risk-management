import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTestFiles(fullPath);
      }
      return entry.name.endsWith(".integration.test.ts") ? [fullPath] : [];
    })
  );
  return files.flat();
}

const testRoot = path.resolve("test");
const testFiles = (await collectTestFiles(testRoot)).sort();

if (testFiles.length === 0) {
  console.error("No integration test files found under test/");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
