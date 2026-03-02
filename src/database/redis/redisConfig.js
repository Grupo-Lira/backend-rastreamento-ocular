import Redis from "ioredis";

let redis;

export async function connectRedis() {
  redis = new Redis({
    host: process.env.REDIS_HOSTNAME,
    username: "default",
    password: process.env.REDIS_PASSWORD,
    port: process.env.REDIS_PORT,
    lazyConnect: true,
    retryStrategy: null,
  });

  redis.on("connect", () => {
    console.log("Redis conectado com sucesso!");
  });

  redis.on("error", (err) => {
    console.error("Erro na conexão REDIS:", err);
  });

  try {
    await redis.connect();
  } catch (err) {
    console.error("Falha ao conectar no Redis:", err);
    throw err;
  }

  return redis;
}

export function getRedis() {
  if (!redis) {
    throw new Error("Redis ainda não foi inicializado!");
  }
  return redis;
}
