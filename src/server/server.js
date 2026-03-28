import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoutes from "../auth/routes/auth.routes.js";
import { setupSwagger } from "../docs/swagger.js";
import doutoresRoutes from "../doutores/routes/doutores.routes.js";
import pacientesRoutes from "../pacientes/routes/pacientes.routes.js";
import usuariosRoutes from "../usuarios/routes/usuarios.routes.js";

const app = express();
const httpServer = createServer(app);

app.use(express.json());

setupSwagger(app);

app.use("/api/auth", authRoutes);
app.use("/api/doutores", doutoresRoutes);
app.use("/api/pacientes", pacientesRoutes);
app.use("/api/usuarios", usuariosRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

export { app, httpServer };

