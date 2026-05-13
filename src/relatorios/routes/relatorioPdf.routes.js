import { Router } from "express";
import { gerarRelatorioPdfHandler } from "../handler/relatorioPdf.handler.js";
import authMiddleware from "../../auth/middleware/auth.middleware.js";
const router = Router();

router.get("/pdf/:id", authMiddleware, gerarRelatorioPdfHandler);

export default router;
