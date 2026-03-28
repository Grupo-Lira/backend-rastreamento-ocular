import { Router } from "express";
import authMiddleware from "../../auth/middleware/auth.middleware.js";
import {
  buscarPacienteHandler,
  criarPacienteHandler,
  deletarPacienteHandler,
  editarPacienteHandler,
  listarPacientesHandler,
} from "../handler/pacientes.handler.js";

const pacientesRoutes = Router();

pacientesRoutes.use(authMiddleware);

pacientesRoutes.post("/", criarPacienteHandler);
pacientesRoutes.get("/", listarPacientesHandler);
pacientesRoutes.get("/:nome", buscarPacienteHandler);
pacientesRoutes.put("/:nome", editarPacienteHandler);
pacientesRoutes.delete("/:nome", deletarPacienteHandler);

export default pacientesRoutes;
