import jwt from "jsonwebtoken";
import { tokenCancelado } from "../service/authService.js";

const getJwtSecret = () => process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso não informado." });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (await tokenCancelado(token)) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }

    req.token = token;
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
};

export default authMiddleware;
