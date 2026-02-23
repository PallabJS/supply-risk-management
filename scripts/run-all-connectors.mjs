#!/usr/bin/env node

/**
 * Script to run all enabled connectors as separate child processes.
 * Each connector runs in its own process with independent lifecycle management.
 *
 * Usage:
 *   node scripts/run-all-connectors.mjs
 *   CONNECTORS_CONFIG_PATH=connectors.json node scripts/run-all-connectors.mjs
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/**
 * Load connector names from registry.
 */
async function loadEnabledConnectorNames() {
  const configPath =
    process.env.CONNECTORS_CONFIG_PATH ||
    path.join(projectRoot, "connectors.json");

  try {
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    const connectors = config.connectors || [];
    return connectors
      .filter((c) => c.enabled !== false)
      .map((c) => c.name)
      .filter((name) => name);
  } catch (error) {
    console.error(`Failed to load connector config from ${configPath}:`, error);
    process.exitCode = 1;
    process.exit(1);
  }
}

/**
 * Run a single connector as a child process.
 */
function runConnector(connectorName) {
  return new Promise((resolve) => {
    const args = [
      "--import",
      "tsx",
      "src/workers/universal-connector-worker.ts",
      connectorName,
    ];

    const process = spawn("node", ["scripts/run-with-env.mjs", ...args], {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CONNECTORS_CONFIG_PATH:
          process.env.CONNECTORS_CONFIG_PATH ||
          path.join(projectRoot, "connectors.json"),
      },
    });

    const handleStop = () => {
      console.log(`[connectors:all] Stopping ${connectorName}...`);
      process.kill("SIGTERM");
    };

    process.on("exit", (code) => {
      if (code !== 0) {
        console.warn(
          `[connectors:all] Connector ${connectorName} exited with code ${code}`,
        );
      }
      resolve();
    });

    process.on("error", (error) => {
      console.error(
        `[connectors:all] Failed to start ${connectorName}:`,
        error,
      );
      resolve();
    });

    // Handle process signals to relay to child
    const relaySignal = (signal) => {
      process.kill(signal);
    };

    globalThis._connectorHandlers = globalThis._connectorHandlers || {};
    globalThis._connectorHandlers[connectorName] = { process, handleStop };
  });
}

/**
 * Main run loop.
 */
async function main() {
  console.log("[connectors:all] Loading enabled connectors...");
  const connectorNames = await loadEnabledConnectorNames();

  if (connectorNames.length === 0) {
    console.warn(
      "[connectors:all] No enabled connectors found. Check connectors.json or ENABLED_CONNECTORS env var.",
    );
    process.exitCode = 0;
    return;
  }

  console.log(
    `[connectors:all] Starting ${connectorNames.length} connector(s):`,
    connectorNames.join(", "),
  );

  // Track all running processes
  const processes = [];

  // Start all connectors concurrently
  for (const connectorName of connectorNames) {
    const promise = runConnector(connectorName);
    processes.push(promise);
  }

  // Handle shutdown signals
  const handleShutdown = (signal) => {
    console.log(
      `\n[connectors:all] Received ${signal}, stopping all connectors...`,
    );

    // Stop all child processes
    if (globalThis._connectorHandlers) {
      for (const { process: childProcess } of Object.values(
        globalThis._connectorHandlers,
      )) {
        if (childProcess && !childProcess.killed) {
          childProcess.kill("SIGTERM");
        }
      }
    }

    // Wait a bit then exit
    setTimeout(() => {
      console.log("[connectors:all] Shutting down");
      process.exit(0);
    }, 5000);
  };

  process.on("SIGINT", () => {
    handleShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    handleShutdown("SIGTERM");
  });

  // Wait for all processes
  await Promise.all(processes);
  console.log("[connectors:all] All connectors stopped");
}

main().catch((error) => {
  console.error("[connectors:all] Fatal error:", error);
  process.exitCode = 1;
});
