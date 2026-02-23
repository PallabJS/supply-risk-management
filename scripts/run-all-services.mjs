import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const runWithEnvPath = fileURLToPath(new URL("./run-with-env.mjs", import.meta.url));

const services = [
  {
    name: "signal-ingestion-gateway",
    args: ["--import", "tsx", "src/adapters/signal-ingestion-gateway/index.ts"]
  },
  {
    name: "signal-ingestion-worker",
    args: ["--import", "tsx", "src/workers/signal-ingestion-worker.ts"]
  },
  {
    name: "risk-classification-llm-adapter",
    args: ["--import", "tsx", "src/adapters/risk-classification-llm-adapter/index.ts"]
  },
  {
    name: "risk-classification-worker",
    args: ["--import", "tsx", "src/workers/risk-classification-worker.ts"]
  },
  {
    name: "risk-engine-worker",
    args: ["--import", "tsx", "src/workers/risk-engine-worker.ts"]
  }
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class ServiceSupervisor {
  constructor() {
    this.children = new Map();
    this.shuttingDown = false;
  }

  startService(service) {
    const child = spawn(process.execPath, [runWithEnvPath, ...service.args], {
      cwd: path.resolve("."),
      env: process.env,
      stdio: "inherit"
    });

    this.children.set(service.name, child);
    console.log(`[services] started ${service.name} (pid=${child.pid ?? "n/a"})`);

    child.on("exit", (code, signal) => {
      this.children.delete(service.name);

      if (this.shuttingDown) {
        return;
      }

      const detail =
        signal != null
          ? `signal=${signal}`
          : `code=${typeof code === "number" ? code : "unknown"}`;
      console.error(`[services] ${service.name} exited unexpectedly (${detail})`);
      void this.shutdown(1);
    });
  }

  async startAll() {
    for (const service of services) {
      if (this.shuttingDown) {
        return;
      }
      this.startService(service);
      await sleep(100);
    }
  }

  async shutdown(exitCode = 0) {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    console.log("[services] shutting down");
    for (const child of this.children.values()) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }

    await sleep(800);
    for (const child of this.children.values()) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }

    process.exit(exitCode);
  }
}

const supervisor = new ServiceSupervisor();

process.on("SIGINT", () => {
  void supervisor.shutdown(0);
});

process.on("SIGTERM", () => {
  void supervisor.shutdown(0);
});

await supervisor.startAll();
if (!supervisor.shuttingDown) {
  console.log("[services] all services started");
}
