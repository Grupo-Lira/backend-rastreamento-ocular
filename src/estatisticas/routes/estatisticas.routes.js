import { Router } from "express";
import authMiddleware from "../../auth/middleware/auth.middleware.js";
import { salvarFeedbackProfissionalHandler } from "../handler/estatisticas.handler.js";

const estatisticasRoutes = Router();

estatisticasRoutes.use(authMiddleware);
estatisticasRoutes.post("/feedback", salvarFeedbackProfissionalHandler);

export default estatisticasRoutes;
