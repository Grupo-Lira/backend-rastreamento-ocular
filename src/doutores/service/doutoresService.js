import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Doutores from "../../models/Doutores.js";
import Usuarios from "../../models/Usuarios.js";

const CAMPOS_DOUTOR_ATUALIZAVEIS = ["nome", "telefone", "especialidade"];

const mapearErroDuplicidadeDoutor = (err) => {
  if (!err || err.code !== 11000) {
    return err;
  }

  const chaves = Object.keys(err.keyPattern || {});
  const chave = chaves[0] || Object.keys(err.keyValue || {})[0];

  if (chave === "usuario_id") {
    const conflito = new Error("Voce ja tem um perfil de doutor criado.");
    conflito.status = 409;
    return conflito;
  }

  if (chave === "email") {
    const conflito = new Error(
      "Conflito em indice legado de email na colecao de doutores. Reinicie a API para aplicar a limpeza automatica de indice.",
    );
    conflito.status = 409;
    return conflito;
  }

  const conflito = new Error("Conflito ao criar perfil de doutor.");
  conflito.status = 409;
  return conflito;
};

const validarObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID inválido.");
    err.status = 400;
    throw err;
  }
};

const normalizarEmail = (email) => String(email).toLowerCase().trim();

const anexarEmailAoDoutor = async (doutor) => {
  if (!doutor) {
    return doutor;
  }

  if (!doutor.usuario_id) {
    return doutor;
  }

  const usuario = await Usuarios.findById(doutor.usuario_id).lean();
  if (!usuario) {
    return doutor;
  }

  return {
    ...doutor,
    email: usuario.email,
  };
};

const anexarEmailNaLista = async (doutores = []) => {
  const usuariosIds = doutores
    .map((doutor) => doutor.usuario_id?.toString())
    .filter(Boolean);

  if (usuariosIds.length === 0) {
    return doutores;
  }

  const usuarios = await Usuarios.find({ _id: { $in: usuariosIds } }).lean();
  const emailPorUsuarioId = new Map(
    usuarios.map((usuario) => [usuario._id.toString(), usuario.email]),
  );

  return doutores.map((doutor) => ({
    ...doutor,
    email: emailPorUsuarioId.get(doutor.usuario_id?.toString()),
  }));
};

const validarPermissaoAtualizacao = (usuarioLogado, doutorAlvo) => {
  if (!usuarioLogado?.id) {
    const err = new Error("Usuario nao autenticado.");
    err.status = 401;
    throw err;
  }

  if (usuarioLogado.role === "ADMIN") {
    return;
  }

  const usuarioAlvoId = doutorAlvo.usuario_id?.toString();
  if (usuarioAlvoId && usuarioAlvoId === usuarioLogado.id) {
    return;
  }

  const err = new Error("Voce so pode atualizar seu proprio perfil.");
  err.status = 403;
  throw err;
};

const listarDoutores = async () => {
  const doutores = await Doutores.find().sort({ criado_em: -1 }).lean();
  return anexarEmailNaLista(doutores);
};

const buscarDoutorPorId = async (id) => {
  validarObjectId(id);

  const doutor = await Doutores.findById(id).lean();
  if (!doutor) {
    const err = new Error("Doutor nao encontrado.");
    err.status = 404;
    throw err;
  }

  return anexarEmailAoDoutor(doutor);
};

const buscarDoutorPorUsuarioId = async (usuarioId) => {
  validarObjectId(usuarioId);

  const doutor = await Doutores.findOne({ usuario_id: usuarioId }).lean();
  if (!doutor) {
    const err = new Error("Perfil de doutor nao encontrado.");
    err.status = 404;
    throw err;
  }

  return anexarEmailAoDoutor(doutor);
};

const registrarDoutor = async ({
  nome,
  email,
  senha,
  telefone,
  especialidade,
}) => {
  if (!nome || !email || !senha || !telefone || !especialidade) {
    const err = new Error(
      "Campos obrigatorios: nome, email, senha, telefone e especialidade.",
    );
    err.status = 400;
    throw err;
  }

  const emailNormalizado = normalizarEmail(email);
  const existente = await Usuarios.findOne({ email: emailNormalizado }).lean();
  if (existente) {
    const err = new Error("Ja existe usuario com este email.");
    err.status = 409;
    throw err;
  }

  const senhaHash = await bcrypt.hash(String(senha), 10);

  const usuario = await Usuarios.create({
    email: emailNormalizado,
    senha: senhaHash,
    role: "DOUTOR",
    status: "ATIVO",
  });

  try {
    const doutor = await Doutores.create({
      usuario_id: usuario._id,
      nome,
      telefone,
      especialidade,
      pacientes_ids: [],
    });

    return anexarEmailAoDoutor(doutor.toObject());
  } catch (err) {
    await Usuarios.findByIdAndDelete(usuario._id);
    throw err;
  }
};

const atualizarDoutorPorId = async (
  id,
  dadosAtualizacao = {},
  usuarioLogado = {},
) => {
  validarObjectId(id);

  const doutorAlvo = await Doutores.findById(id).lean();
  if (!doutorAlvo) {
    const err = new Error("Doutor nao encontrado.");
    err.status = 404;
    throw err;
  }

  validarPermissaoAtualizacao(usuarioLogado, doutorAlvo);

  const email =
    typeof dadosAtualizacao.email === "string"
      ? normalizarEmail(dadosAtualizacao.email)
      : undefined;

  const campos = Object.fromEntries(
    Object.entries(dadosAtualizacao).filter(([chave]) =>
      CAMPOS_DOUTOR_ATUALIZAVEIS.includes(chave),
    ),
  );

  if (Object.keys(campos).length === 0 && !email) {
    const err = new Error(
      "Nenhum campo valido para atualizacao foi informado.",
    );
    err.status = 400;
    throw err;
  }

  if (email) {
    const existente = await Usuarios.findOne({ email }).lean();
    if (
      existente &&
      existente._id.toString() !== doutorAlvo.usuario_id?.toString()
    ) {
      const err = new Error("Ja existe usuario com este email.");
      err.status = 409;
      throw err;
    }

    if (doutorAlvo.usuario_id) {
      await Usuarios.findByIdAndUpdate(doutorAlvo.usuario_id, { email });
    }
  }

  if (Object.keys(campos).length > 0) {
    await Doutores.findByIdAndUpdate(id, campos, {
      runValidators: true,
    });
  }

  return buscarDoutorPorId(id);
};

const atualizarMeuPerfilPorUsuarioId = async (
  usuarioId,
  dadosAtualizacao = {},
  usuarioLogado = {},
) => {
  const doutor = await buscarDoutorPorUsuarioId(usuarioId);
  return atualizarDoutorPorId(
    doutor._id.toString(),
    dadosAtualizacao,
    usuarioLogado,
  );
};

const deletarDoutorPorId = async (id) => {
  validarObjectId(id);

  const removido = await Doutores.findByIdAndDelete(id).lean();
  if (!removido) {
    const err = new Error("Doutor nao encontrado.");
    err.status = 404;
    throw err;
  }

  return removido;
};

const criarDoutorParaMenu = async (
  usuarioId,
  { nome, telefone, especialidade },
) => {
  if (!nome || !telefone || !especialidade) {
    const err = new Error(
      "Campos obrigatorios: nome, telefone e especialidade.",
    );
    err.status = 400;
    throw err;
  }

  validarObjectId(usuarioId);

  const doutorExistente = await Doutores.findOne({
    usuario_id: usuarioId,
  }).lean();
  if (doutorExistente) {
    const err = new Error("Voce ja tem um perfil de doutor criado.");
    err.status = 409;
    throw err;
  }

  let doutor;
  try {
    doutor = await Doutores.create({
      usuario_id: usuarioId,
      nome,
      telefone,
      especialidade,
      pacientes_ids: [],
    });
  } catch (err) {
    throw mapearErroDuplicidadeDoutor(err);
  }

  return anexarEmailAoDoutor(doutor.toObject());
};

export {
  atualizarDoutorPorId,
  atualizarMeuPerfilPorUsuarioId,
  buscarDoutorPorId,
  buscarDoutorPorUsuarioId,
  criarDoutorParaMenu,
  deletarDoutorPorId,
  listarDoutores,
  registrarDoutor
};

