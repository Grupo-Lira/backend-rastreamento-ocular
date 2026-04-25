import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
	loginHandler,
	logoutHandler,
	registerHandler,
} from "../handler/auth.handler.js";

const authRoutes = Router();

authRoutes.post("/register", registerHandler);
authRoutes.post("/login", loginHandler);
authRoutes.post("/logout", authMiddleware, logoutHandler);

export default authRoutes;
