import mongoose from "mongoose";
import Doutores from "../../models/Doutores.js";
import Pacientes from "../../models/Pacientes.js";

const validarId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("ID inválido.");
    err.status = 400;
    throw err;
  }
};

const getDoutor = async (usuarioId) => {
  validarId(usuarioId);

  const doutor = await Doutores.findOne({ usuario_id: usuarioId }).lean();
  if (!doutor) {
    const err = new Error("Perfil de doutor não encontrado.");
    err.status = 404;
    throw err;
  }

  return doutor;
};

const criar = async (usuarioId, dados = {}) => {
  const doutor = await getDoutor(usuarioId);

  if (!dados.nome) {
    const err = new Error("Campo obrigatório: nome.");
    err.status = 400;
    throw err;
  }

  const existe = await Pacientes.findOne({
    doutor_id: doutor._id,
    nome: dados.nome,
  }).lean();

  if (existe) {
    const err = new Error("Já existe paciente com este nome para este doutor.");
    err.status = 409;
    throw err;
  }

  const paciente = await Pacientes.create({
    doutor_id: doutor._id,
    nome: dados.nome,
    data_nascimento: dados.data_nascimento,
    sexo: dados.sexo,
    escolaridade: dados.escolaridade,
    observacoes: dados.observacoes,
  });

  await Doutores.findByIdAndUpdate(doutor._id, {
    $addToSet: { pacientes_ids: paciente._id },
  });

  return paciente.toObject();
};

const listar = async (usuarioId) => {
  const doutor = await getDoutor(usuarioId);

  return Pacientes.find({ doutor_id: doutor._id })
    .sort({ criado_em: -1 })
    .lean();
};

const buscarPorNome = async (usuarioId, nome) => {
  const doutor = await getDoutor(usuarioId);

  if (!nome) {
    const err = new Error("Nome do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOne({
    doutor_id: doutor._id,
    nome,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  return paciente;
};

const editar = async (usuarioId, nome, dados = {}) => {
  const doutor = await getDoutor(usuarioId);

  if (!nome) {
    const err = new Error("Nome do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOne({
    doutor_id: doutor._id,
    nome,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  const permitidos = [
    "nome",
    "data_nascimento",
    "sexo",
    "escolaridade",
    "observacoes",
  ];

  const atualizacao = Object.fromEntries(
    Object.entries(dados).filter(([chave, valor]) => {
      return permitidos.includes(chave) && valor !== undefined;
    }),
  );

  if (Object.keys(atualizacao).length === 0) {
    const err = new Error(
      "Nenhum campo válido para atualização foi informado.",
    );
    err.status = 400;
    throw err;
  }

  if (atualizacao.nome && atualizacao.nome !== paciente.nome) {
    const existeOutro = await Pacientes.findOne({
      _id: { $ne: paciente._id },
      doutor_id: doutor._id,
      nome: atualizacao.nome,
    }).lean();

    if (existeOutro) {
      const err = new Error(
        "Já existe paciente com este nome para este doutor.",
      );
      err.status = 409;
      throw err;
    }
  }

  return Pacientes.findByIdAndUpdate(paciente._id, atualizacao, {
    new: true,
    runValidators: true,
  }).lean();
};

const deletar = async (usuarioId, nome) => {
  const doutor = await getDoutor(usuarioId);

  if (!nome) {
    const err = new Error("Nome do paciente é obrigatório.");
    err.status = 400;
    throw err;
  }

  const paciente = await Pacientes.findOneAndDelete({
    doutor_id: doutor._id,
    nome,
  }).lean();

  if (!paciente) {
    const err = new Error("Paciente não encontrado.");
    err.status = 404;
    throw err;
  }

  await Doutores.findByIdAndUpdate(doutor._id, {
    $pull: { pacientes_ids: paciente._id },
  });

  return paciente;
};

export { buscarPorNome, criar, deletar, editar, listar };

