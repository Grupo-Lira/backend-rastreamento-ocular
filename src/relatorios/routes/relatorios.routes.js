import { Router } from "express";

import authMiddleware from "../../auth/middleware/auth.middleware.js";
import { gerarDadosRelatorioPacienteHandler } from "../handler/relatorios.handler.js";

const relatoriosRoutes = Router();

relatoriosRoutes.use(authMiddleware);

relatoriosRoutes.get("/:id", gerarDadosRelatorioPacienteHandler);

export default relatoriosRoutes;
