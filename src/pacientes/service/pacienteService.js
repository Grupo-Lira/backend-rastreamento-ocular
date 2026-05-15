import mongoose from "mongoose";
import Pacientes from "../../models/Pacientes.js";
import Usuarios from "../../models/Usuarios.js";

const validarId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID inválido.");
    err.status = 400;
    throw err;
  }
};

const getDoutor = async (usuarioId) => {
  validarId(usuarioId);

  const usuario = await Usuarios.findById(usuarioId).lean();
  if (!usuario) {
    const err = new Error("Perfil de usuário não encontrado.");
    err.status = 404;
    throw err;
  }

  return usuario;
};

const create = async (usuarioId, dados = {}) => {
  await getDoutor(usuarioId);

  if (!dados.nome) {
    const err = new Error("Campo obrigatório: nome.");
    err.status = 400;
    throw err;
  }

  if (dados.rg) {
    const existeRg = await Pacientes.findOne({
      doutor_id: usuarioId,
      rg: dados.rg,
    }).lean();

    if (existeRg) {
      const err = new Error("Já existe paciente com este RG para este doutor.");
      err.status = 409;
      throw err;
    }
  }

  const paciente = await Pacientes.create({
    doutor_id: usuarioId,
    nome: dados.nome,
    rg: dados.rg,
    motivo_avaliacao: dados.motivo_avaliacao,
    data_nascimento: dados.data_nascimento,
    data_avaliacao: dados.data_avaliacao,
    sexo: dados.sexo,
    escolaridade: dados.escolaridade,
  });

  await Usuarios.findByIdAndUpdate(usuarioId, {
    $addToSet: { pacientes_ids: paciente._id },
  });

  return paciente.toObject();
};

const getall = async (usuarioId) => {
  const doutor = await getDoutor(usuarioId);

  const pacientes = await Pacientes.find({ doutor_id: usuarioId })
    .sort({ criado_em: -1 })
    .lean();

  return pacientes;
};

const getById = async (usuarioId, id) => {
  await getDoutor(usuarioId);
  validarId(id);

  if (!id) {
    const err = new Error("ID do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOne({
    doutor_id: usuarioId,
    _id: id,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  return paciente;
};

const updateById = async (usuarioId, id, campos = {}) => {
  await getDoutor(usuarioId);
  validarId(id);

  if (!id) {
    const err = new Error("ID do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOne({
    doutor_id: usuarioId,
    _id: id,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  if (Object.keys(campos).length === 0) {
    const err = new Error(
      "Nenhum campo válido para atualização foi informado.",
    );
    err.status = 400;
    throw err;
  }

  if (campos.rg && campos.rg !== paciente.rg) {
    const existeOutroRg = await Pacientes.findOne({
      _id: { $ne: paciente._id },
      doutor_id: usuarioId,
      rg: campos.rg,
    }).lean();

    if (existeOutroRg) {
      const err = new Error("Já existe paciente com este RG para este doutor.");
      err.status = 409;
      throw err;
    }
  }

  return Pacientes.findByIdAndUpdate(paciente._id, campos, {
    new: true,
    runValidators: true,
  }).lean();
};

const deleteById = async (usuarioId, id) => {
  await getDoutor(usuarioId);
  validarId(id);

  if (!id) {
    const err = new Error("ID do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOneAndDelete({
    doutor_id: usuarioId,
    _id: id,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  await Usuarios.findByIdAndUpdate(usuarioId, {
    $pull: { pacientes_ids: paciente._id },
  });

  return paciente;
};

export { create, deleteById, getall, getById, getDoutor, updateById };;

