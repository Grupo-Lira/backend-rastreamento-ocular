import mongoose from "mongoose";
import Pacientes from "../../models/Pacientes.js";
import Usuarios from "../../models/Usuarios.js";

const validarObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID invalido.");
    err.status = 400;
    throw err;
  }
};

const getById = async (id) => {
  validarObjectId(id);

  const usuario = await Usuarios.findById(id).lean();
  if (!usuario) {
    const err = new Error("Usuário não encontrado.");
    err.status = 404;
    throw err;
  }

  return usuario;
};

const updateById = async (id, campos = {}) => {
  validarObjectId(id);

  if (!Object.keys(campos).length) {
    const err = new Error(
      "Nenhum campo válido para atualização foi informado.",
    );
    err.status = 400;
    throw err;
  }

  if (typeof campos.email === "string") {
    const { email } = campos;
    const existente = await Usuarios.findOne({ email }).lean();
    if (existente?._id.toString() !== id) {
      const err = new Error("Já existe usuário com este email.");
      err.status = 409;
      throw err;
    }
  }

  const usuarioAtualizado = await Usuarios.findByIdAndUpdate(id, campos, {
    new: true,
    runValidators: true,
  }).lean();

  if (!usuarioAtualizado) {
    const err = new Error("Usuário não encontrado.");
    err.status = 404;
    throw err;
  }

  return usuarioAtualizado;
};

const deleteById = async (id) => {
  validarObjectId(id);

  const removido = await Usuarios.findByIdAndDelete(id).lean();
  if (!removido) {
    const err = new Error("Usuário não encontrado.");
    err.status = 404;
    throw err;
  }

  await Pacientes.deleteMany({ doutor_id: id });
  return removido;
};

export {
  deleteById, getById,
  updateById
};

