import {
  clearDatabase,
  connectTestMongo,
  disconnectTestMongo,
} from "./mongodb.js";

globalThis.beforeAll(async () => {
  await connectTestMongo();

  const { connectRedis } = await import("../../src/database/redis/redisConfig.js");
  await connectRedis();
});

globalThis.afterEach(async () => {
  await clearDatabase();
});

globalThis.afterAll(async () => {
  const { disconnectRedis } = await import("../../src/database/redis/redisConfig.js");
  await disconnectRedis();
  await disconnectTestMongo();
});
