import request from "supertest";
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";

let app, server, io;

beforeAll(() => {
  app = express();
  app.get("/ping", (req, res) => res.status(200).send("pong"));

  server = createServer(app);
  io = new Server(server);
});

afterAll(async () => {
  await io.close();
  await server.close();
});

test("GET /ping retorna 200 e 'pong'", async () => {
  const res = await request(app).get("/ping");
  expect(res.statusCode).toBe(200);
  expect(res.text).toBe("pong");
});

test("Socket.io inicializa corretamente", () => {
  expect(io).toBeDefined();
});
