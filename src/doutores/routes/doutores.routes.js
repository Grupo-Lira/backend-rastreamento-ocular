import { Router } from "express";
import authMiddleware, {
  requireAdmin,
} from "../../auth/middleware/auth.middleware.js";
import {
  atualizarMeuPerfilHandler,
  buscarDoutorPorIdHandler,
  buscarMeuPerfilHandler,
  criarMeuDoutorHandler,
  deletarDoutorPorIdHandler,
  listarDoutoresHandler,
} from "../handler/doutores.handler.js";

const doutoresRoutes = Router();

doutoresRoutes.use(authMiddleware);
doutoresRoutes.get("/me", buscarMeuPerfilHandler);
doutoresRoutes.put("/me", atualizarMeuPerfilHandler);
doutoresRoutes.post("/", criarMeuDoutorHandler);

doutoresRoutes.use(requireAdmin);
doutoresRoutes.get("/", listarDoutoresHandler);
doutoresRoutes.get("/:id", buscarDoutorPorIdHandler);
doutoresRoutes.delete("/:id", deletarDoutorPorIdHandler);

export default doutoresRoutes;
