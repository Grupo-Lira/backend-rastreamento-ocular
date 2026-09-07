import request from "supertest";
import { app } from "../src/server/server.js";

test("Checa se o servidor está funcionando corretamente /api/health", async () => {
  const response = await request(app)
    .get("/api/health");

  expect(response.status).toBe(200);

  expect(response.body).toEqual({
    status: "ok"
  });

});

