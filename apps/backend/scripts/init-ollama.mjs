import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const OLLAMA_HOST = "http://localhost:11434";
const MODEL = "llama3.1:8b";
const MAX_RETRIES = 30;
const RETRY_DELAY = 2000;
const AI_MODELS_DIR = "/Users/ramya-pallab/ai-models/ollama";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureDirectoryExists() {
  try {
    if (!fs.existsSync(AI_MODELS_DIR)) {
      fs.mkdirSync(AI_MODELS_DIR, { recursive: true });
      console.log(`[ollama-init] created directory: ${AI_MODELS_DIR}`);
    }
  } catch (error) {
    console.warn(
      `[ollama-init] warning: could not ensure directory exists: ${error.message}`,
    );
  }
}

async function checkOllamaReady() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_HOST}/api/tags`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForOllama() {
  console.log("[ollama-init] waiting for Ollama to be ready...");
  for (let i = 0; i < MAX_RETRIES; i++) {
    const isReady = await checkOllamaReady();
    if (isReady) {
      console.log("[ollama-init] Ollama is ready!");
      return true;
    }
    console.log(
      `[ollama-init] attempt ${i + 1}/${MAX_RETRIES} - Ollama not ready yet, retrying in ${RETRY_DELAY}ms...`,
    );
    await sleep(RETRY_DELAY);
  }
  console.error("[ollama-init] Ollama failed to become ready after retries");
  return false;
}

async function pullModel() {
  console.log(`[ollama-init] pulling model ${MODEL}...`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ name: MODEL, stream: false });

    const options = {
      hostname: "localhost",
      port: 11434,
      path: "/api/pull",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 600000, // 10 minutes timeout for model pull
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
        process.stdout.write(".");
      });
      res.on("end", () => {
        console.log("");
        if (res.statusCode === 200 || res.statusCode === 400) {
          // 400 might mean the model is already there
          console.log("[ollama-init] model pull completed");
          resolve(true);
        } else {
          reject(new Error(`Failed to pull model: ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Model pull timed out"));
    });

    req.write(postData);
    req.end();
  });
}

async function checkModelExists() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_HOST}/api/tags`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const tags = JSON.parse(data);
          const hasModel =
            tags.models?.some((m) => m.name.includes(MODEL)) ?? false;
          resolve(hasModel);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  try {
    ensureDirectoryExists();
    const ready = await waitForOllama();
    if (!ready) {
      console.error("[ollama-init] Ollama initialization failed");
      process.exit(1);
    }

    const modelExists = await checkModelExists();
    if (!modelExists) {
      console.log(`[ollama-init] model ${MODEL} not found, pulling...`);
      await pullModel();
    } else {
      console.log(`[ollama-init] model ${MODEL} already exists`);
    }

    console.log("[ollama-init] Ollama is ready with required model!");
    process.exit(0);
  } catch (error) {
    console.error("[ollama-init] error:", error);
    process.exit(1);
  }
}

main();
