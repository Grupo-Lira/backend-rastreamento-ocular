import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usuarios from "../../models/Usuarios.js";

const getJwtSecret = () => process.env.JWT_SECRET;

const isBcryptHash = (senha) => {
  return typeof senha === "string" && /^\$2[aby]\$\d{2}\$/.test(senha);
};

const validarSenhaLogin = async (senhaInformada, usuario) => {
  const senhaAtual = String(usuario.senha || "");

  if (isBcryptHash(senhaAtual)) {
    const confere = await bcrypt.compare(String(senhaInformada), senhaAtual);
    return { confere, senhaMigrada: false };
  }

  const confere = String(senhaInformada) === senhaAtual;
  if (!confere) {
    return { confere: false, senhaMigrada: false };
  }

  const novaSenhaHash = await bcrypt.hash(String(senhaInformada), 10);
  await Usuarios.findByIdAndUpdate(usuario._id, { senha: novaSenhaHash });
  return { confere: true, senhaMigrada: true };
};

const gerarToken = (usuario) =>
  jwt.sign(
    {
      sub: usuario._id.toString(),
      email: usuario.email,
      role: usuario.role,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRACAO },
  );

const registrarDoutor = async ({ email, senha }) => {
  if (!email || !senha) {
    const err = new Error(
      "Campos obrigatorios: email e senha.",
    );
    err.status = 400;
    throw err;
  }

  const emailNormalizado = String(email).toLowerCase().trim();
  const existente = await Usuarios.findOne({ email: emailNormalizado }).lean();
  if (existente) {
    const err = new Error("Ja existe usuario cadastrado com este email.");
    err.status = 409;
    throw err;
  }

  const senhaHash = await bcrypt.hash(String(senha), 10);

  const usuario = await Usuarios.create({
    email: emailNormalizado,
    senha: senhaHash,
    role: "DOUTOR",
  });

  const token = gerarToken(usuario);
  return { token, usuario: usuario.toJSON() };
};

const loginDoutor = async ({ email, senha }) => {
  if (!email || !senha) {
    const err = new Error("Email e senha são obrigatórios.");
    err.status = 400;
    throw err;
  }

  const emailNormalizado = String(email).toLowerCase().trim();
  const usuario = await Usuarios.findOne({ email: emailNormalizado }).select(
    "+senha",
  );

  if (!usuario) {
    const err = new Error("Credenciais inválidas.");
    err.status = 401;
    throw err;
  }

  const { confere: senhaConfere } = await validarSenhaLogin(senha, usuario);
  if (!senhaConfere) {
    const err = new Error("Credenciais inválidas.");
    err.status = 401;
    throw err;
  }

  await Usuarios.findByIdAndUpdate(usuario._id, { ultimo_login_em: new Date() });

  const token = gerarToken(usuario);
  return { token, usuario: usuario.toJSON() };
};

export { loginDoutor, registrarDoutor };

