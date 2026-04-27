import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoutes from "../auth/routes/auth.routes.js";
import { setupSwagger } from "../docs/swagger.js";
import pacientesRoutes from "../pacientes/routes/pacientes.routes.js";
import relatoriosRoutes from "../relatorios/routes/relatorios.routes.js";
import usuariosRoutes from "../usuarios/routes/usuarios.routes.js";

const app = express();
const httpServer = createServer(app);

app.use(express.json());

setupSwagger(app);

app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/pacientes", pacientesRoutes);
app.use("/api/relatorios", relatoriosRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

export { app, httpServer };

