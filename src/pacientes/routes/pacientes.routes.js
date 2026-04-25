import { Router } from "express";
import authMiddleware from "../../auth/middleware/auth.middleware.js";
import {
  getPacienteHandler,
  createPacienteHandler,
  deletePacienteHandler,
  updatePacienteHandler,
  getAllPacientesHandler,
} from "../handler/pacientes.handler.js";

const pacientesRoutes = Router();

pacientesRoutes.use(authMiddleware);

pacientesRoutes.post("/", createPacienteHandler);
pacientesRoutes.get("/", getAllPacientesHandler);
pacientesRoutes.get("/:id", getPacienteHandler);
pacientesRoutes.put("/:id", updatePacienteHandler);
pacientesRoutes.delete("/:id", deletePacienteHandler);

export default pacientesRoutes;
