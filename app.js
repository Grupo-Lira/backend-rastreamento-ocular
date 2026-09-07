import "./env.config.js";

import connectMongo from "./src/database/mongodb/connection.js";
import { connectRedis } from "./src/database/redis/redisConfig.js";
import { httpServer } from "./src/server/server.js";
import "./src/server/socket.js";

const INITIAL_RETRY_DELAY_MS = 3000;
const MAX_STARTUP_RETRIES = 10;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(connectFn, label) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt += 1) {
    try {
      await connectFn();
      return;
    } catch (err) {
      lastError = err;
      console.warn(
        `${label} indisponível na tentativa ${attempt}/${MAX_STARTUP_RETRIES}. Tentando novamente em ${INITIAL_RETRY_DELAY_MS}ms...`,
      );

      if (attempt < MAX_STARTUP_RETRIES) {
        await wait(INITIAL_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export async function initialize() {
  try {
    await connectWithRetry(connectMongo, "MongoDB");
    await connectWithRetry(connectRedis, "Redis");

    const PORT = process.env.SERVER_PORT || "4000";
    httpServer.listen(PORT, () => {
      console.info("Server Iniciado com sucesso!");
      console.info("Documentação disponível em: http://localhost:" + PORT + "/api/docs");
    });
  } catch (err) {
    console.error("Erro ao iniciar aplicação:", err);
    process.exit(1);
  }
}

initialize();
