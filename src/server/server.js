import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

export { httpServer, app };
