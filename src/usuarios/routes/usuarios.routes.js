import { Router } from "express";
import authMiddleware from "../../auth/middleware/auth.middleware.js";
import {
  getProfileHandler,
  updateProfileHandler,
  deleteProfileHandler,
} from "../handler/usuarios.handler.js";

const usuariosRoutes = Router();

usuariosRoutes.use(authMiddleware);

usuariosRoutes.get("/", getProfileHandler);
usuariosRoutes.put("/", updateProfileHandler);
usuariosRoutes.delete("/", deleteProfileHandler);

export default usuariosRoutes;
