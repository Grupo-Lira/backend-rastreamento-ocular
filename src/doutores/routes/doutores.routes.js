import { Router } from "express";
import authMiddleware, {
  requireAdmin,
} from "../../auth/middleware/auth.middleware.js";
import {
  buscarDoutorHandler,
  buscarMeuPerfilHandler,
  criarDoutorHandler,
  deletarDoutorHandler,
  editarMeuPerfilHandler,
  listarDoutoresHandler,
} from "../handler/doutores.handler.js";

const doutoresRoutes = Router();

doutoresRoutes.use(authMiddleware);
doutoresRoutes.get("/me", buscarMeuPerfilHandler);
doutoresRoutes.put("/me", editarMeuPerfilHandler);
doutoresRoutes.post("/", criarDoutorHandler);

doutoresRoutes.use(requireAdmin);
doutoresRoutes.get("/", listarDoutoresHandler);
doutoresRoutes.get("/:id", buscarDoutorHandler);
doutoresRoutes.delete("/:id", deletarDoutorHandler);

export default doutoresRoutes;
