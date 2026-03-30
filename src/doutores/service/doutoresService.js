import mongoose from "mongoose";
import Doutores from "../../models/Doutores.js";
import Usuarios from "../../models/Usuarios.js";

const validarObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID inválido.");
    err.status = 400;
    throw err;
  }
};

const normalizarEmail = (email) => String(email).toLowerCase().trim();

// O email fica na coleção de usuários, não em doutores, então serve para anexar o email do usuário ao objeto do doutor
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

const criar = async (
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
    const err = new Error("Você já tem um perfil de doutor criado.");
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
    if (err?.code === 11000) {
      err = new Error("Você já tem um perfil de doutor criado.");
      err.status = 409;
    }

    throw err;
  }

  return anexarEmailAoDoutor(doutor.toObject());
};

const listar = async () => {
  const doutores = await Doutores.find().sort({ criado_em: -1 }).lean();
  return anexarEmailNaLista(doutores);
};

const buscarPorId = async (id) => {
  validarObjectId(id);

  const doutor = await Doutores.findById(id).lean();
  if (!doutor) {
    const err = new Error("Doutor não encontrado.");
    err.status = 404;
    throw err;
  }

  return anexarEmailAoDoutor(doutor);
};

const buscarMeuPerfil = async (usuarioId) => {
  validarObjectId(usuarioId);

  const doutor = await Doutores.findOne({ usuario_id: usuarioId }).lean();
  if (!doutor) {
    const err = new Error("Perfil de doutor não encontrado.");
    err.status = 404;
    throw err;
  }

  return anexarEmailAoDoutor(doutor);
};

const editarMeuPerfil = async (
  usuarioId,
  dadosAtualizacao = {},
) => {
  validarObjectId(usuarioId);

  const doutor = await Doutores.findOne({ usuario_id: usuarioId }).lean();
  if (!doutor) {
    const err = new Error("Perfil de doutor não encontrado.");
    err.status = 404;
    throw err;
  }

  const email =
    typeof dadosAtualizacao.email === "string"
      ? normalizarEmail(dadosAtualizacao.email)
      : undefined;

  const campos =
    dadosAtualizacao &&
    typeof dadosAtualizacao === "object" &&
    !Array.isArray(dadosAtualizacao)
      ? { ...dadosAtualizacao }
      : {};

  if (Object.keys(campos).length === 0 && !email) {
    const err = new Error(
      "Nenhum campo válido para atualização foi informado.",
    );
    err.status = 400;
    throw err;
  }

  if (email) {
    const existente = await Usuarios.findOne({ email }).lean();
    if (
      existente &&
      existente._id.toString() !== doutor.usuario_id?.toString()
    ) {
      const err = new Error("Já existe usuário com este email.");
      err.status = 409;
      throw err;
    }

    if (doutor.usuario_id) {
      await Usuarios.findByIdAndUpdate(doutor.usuario_id, { email });
    }
  }

  if (Object.keys(campos).length > 0) {
    await Doutores.findByIdAndUpdate(doutor._id, campos, {
      runValidators: true,
    });
  }

  return buscarPorId(doutor._id.toString());
};

const deletar = async (id) => {
  validarObjectId(id);

  const removido = await Doutores.findByIdAndDelete(id).lean();
  if (!removido) {
    const err = new Error("Doutor não encontrado.");
    err.status = 404;
    throw err;
  }

  return removido;
};

export {
  buscarMeuPerfil,
  buscarPorId,
  criar,
  deletar,
  editarMeuPerfil,
  listar,
};

