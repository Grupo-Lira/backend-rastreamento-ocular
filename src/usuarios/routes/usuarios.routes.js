import { Router } from "express";
import authMiddleware, {
  requireAdmin,
} from "../../auth/middleware/auth.middleware.js";
import {
  atualizarUsuarioPorIdHandler,
  deletarUsuarioPorIdHandler,
  listarUsuariosHandler,
} from "../handler/usuarios.handler.js";

const usuariosRoutes = Router();

usuariosRoutes.use(authMiddleware);
usuariosRoutes.use(requireAdmin);

usuariosRoutes.get("/", listarUsuariosHandler);
usuariosRoutes.put("/:id", atualizarUsuarioPorIdHandler);
usuariosRoutes.delete("/:id", deletarUsuarioPorIdHandler);

export default usuariosRoutes;
