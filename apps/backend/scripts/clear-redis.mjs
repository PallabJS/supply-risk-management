import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function clearRedis() {
  try {
    console.log("Clearing all Redis data...");

    const { stdout, stderr } = await execAsync("redis-cli FLUSHALL");

    if (stderr) {
      console.error("Redis error:", stderr);
      process.exit(1);
    }

    console.log("✓ All Redis data cleared successfully");
    console.log(`  Redis URL: ${REDIS_URL}`);
    console.log("  Cleared:");
    console.log(
      "    - All streams (raw-input-signals, classified-events, risk-evaluations)",
    );
    console.log("    - State stores (connector state, deduplication cache)");
    console.log("    - Leases and distributed coordination data");

    process.exit(0);
  } catch (error) {
    console.error("Error clearing Redis:", error.message);
    process.exit(1);
  }
}

clearRedis();
