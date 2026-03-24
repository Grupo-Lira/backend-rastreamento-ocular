import mongoose from "mongoose";
import Doutores from "../../models/Doutores.js";
import Usuarios from "../../models/Usuarios.js";

const CAMPOS_USUARIO_ATUALIZAVEIS = ["email"];

const validarObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID invalido.");
    err.status = 400;
    throw err;
  }
};

const normalizarEmail = (email) => String(email).toLowerCase().trim();

const listarUsuarios = async () => {
  return Usuarios.find().sort({ criado_em: -1 }).lean();
};

const atualizarUsuarioPorId = async (id, dadosAtualizacao = {}) => {
  validarObjectId(id);

  const campos = Object.fromEntries(
    Object.entries(dadosAtualizacao).filter(([chave]) =>
      CAMPOS_USUARIO_ATUALIZAVEIS.includes(chave),
    ),
  );

  if (typeof campos.email === "string") {
    campos.email = normalizarEmail(campos.email);

    const existente = await Usuarios.findOne({ email: campos.email }).lean();
    if (existente && existente._id.toString() !== id) {
      const err = new Error("Ja existe usuario com este email.");
      err.status = 409;
      throw err;
    }
  }

  if (Object.keys(campos).length === 0) {
    const err = new Error(
      "Nenhum campo valido para atualizacao foi informado.",
    );
    err.status = 400;
    throw err;
  }

  const usuarioAtualizado = await Usuarios.findByIdAndUpdate(id, campos, {
    new: true,
    runValidators: true,
  }).lean();

  if (!usuarioAtualizado) {
    const err = new Error("Usuario nao encontrado.");
    err.status = 404;
    throw err;
  }

  return usuarioAtualizado;
};

const deletarUsuarioPorId = async (id) => {
  validarObjectId(id);

  const removido = await Usuarios.findByIdAndDelete(id).lean();
  if (!removido) {
    const err = new Error("Usuario nao encontrado.");
    err.status = 404;
    throw err;
  }

  await Doutores.findOneAndDelete({ usuario_id: id }).lean();
  return removido;
};

export { atualizarUsuarioPorId, deletarUsuarioPorId, listarUsuarios };

