import { loadRiskClassificationLlmAdapterConfig } from "./config.js";
import { createRiskClassificationLlmAdapterServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadRiskClassificationLlmAdapterConfig();
  const server = createRiskClassificationLlmAdapterServer(config);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[llm-adapter] received ${signal}, shutting down`);
    try {
      await server.stop();
      process.exitCode = 0;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
