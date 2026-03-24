import { Router } from "express";
import { loginHandler, registerHandler } from "../handler/auth.handler.js";

const authRoutes = Router();

authRoutes.post("/register", registerHandler);
authRoutes.post("/login", loginHandler);

export default authRoutes;
