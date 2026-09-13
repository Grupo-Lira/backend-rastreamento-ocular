import { jest } from "@jest/globals";
import "../../env.config.js";

jest.unstable_mockModule("ioredis", async () => {
  const RedisMock = (await import("ioredis-mock")).default;

  return {
    default: RedisMock,
  };
});
