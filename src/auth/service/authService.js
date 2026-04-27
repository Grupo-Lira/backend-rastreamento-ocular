import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getRedis } from "../../database/redis/redisConfig.js";
import Usuarios from "../../models/Usuarios.js";

const getJwtSecret = () => process.env.JWT_SECRET;

const BLOQUEIO_PREFIXO = "auth:blocklist:";

const tokenBloqueado = (token) => `${BLOQUEIO_PREFIXO}${token}`;

const isBcryptHash = (senha) => {
  return typeof senha === "string" && /^\$2[aby]\$\d{2}\$/.test(senha);
};

const validarSenhaLogin = async (senhaInformada, usuario) => {
  const senhaTexto = String(senhaInformada);
  const senhaAtual = String(usuario.senha);
  return isBcryptHash(senhaAtual)
    ? await bcrypt.compare(senhaTexto, senhaAtual)
    : senhaTexto === senhaAtual;
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

const registerUsuario = async ({
  nome,
  telefone,
  especialidade,
  email,
  senha,
}) => {
  if (!nome || !telefone || !especialidade || !email || !senha) {
    const err = new Error(
      "Campos obrigatórios: nome, telefone, especialidade, email e senha.",
    );
    err.status = 400;
    throw err;
  }

  const existente = await Usuarios.findOne({ email }).lean();
  if (existente) {
    const err = new Error("Já existe usuário cadastrado com este email.");
    err.status = 409;
    throw err;
  }

  const senhaCriptografada = await bcrypt.hash(String(senha), 10);

  const usuario = await Usuarios.create({
    nome,
    telefone,
    especialidade,
    email,
    senha: senhaCriptografada,
    role: "DOUTOR",
  });

  const token = criarToken(usuario);
  return { token };
};

const login = async ({ email, senha }) => {
  if (!email || !senha) {
    const err = new Error("Email e senha são obrigatórios.");
    err.status = 400;
    throw err;
  }

  const usuario = await Usuarios.findOne({ email }).select("+senha");

  if (!usuario) {
    const err = new Error("Credenciais inválidas.");
    err.status = 401;
    throw err;
  }

  const senhaConfere = await validarSenhaLogin(senha, usuario);
  if (!senhaConfere) {
    const err = new Error("Senha inválida.");
    err.status = 401;
    throw err;
  }

  const token = gerarToken(usuario);
  return { token };
};

const logout = async (token) => {
  if (!token) {
    const err = new Error("Token de acesso não informado.");
    err.status = 401;
    throw err;
  }

  const payload = jwt.decode(token);
  const ttl =
    payload && typeof payload.exp === "number"
      ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) || 60
      : 60;

  await getRedis().set(tokenBloqueado(token), "1", "EX", ttl);
};

const tokenCancelado = async (token) => {
  if (!token) {
    return false;
  }

  const redis = getRedis();
  const existe = await redis.exists(tokenBloqueado(token));
  return existe === 1;
};

export { login, logout, registerUsuario, tokenCancelado };
