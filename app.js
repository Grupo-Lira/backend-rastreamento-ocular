import "./env.config.js";

import connectMongo from "./src/database/mongodb/connection.js";
import { connectRedis } from "./src/database/redis/redisConfig.js";
import { httpServer } from "./src/server/server.js";
import "./src/server/socket.js";

async function initialize() {
  try {
    await connectMongo();
    await connectRedis();

    const PORT = process.env.SERVER_PORT || "4000";
    httpServer.listen(PORT, () => {
      console.info("Server Iniciado com sucesso!");
    });
  } catch (err) {
    console.error("Erro ao iniciar aplicação:", err);
    process.exit(1);
  }
}

initialize();
