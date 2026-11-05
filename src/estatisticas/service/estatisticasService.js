import mongoose from "mongoose";
import Pacientes from "../../models/Pacientes.js";
import EstatisticasFase1 from "../../models/EstatisticasFase1.js";
import EstatisticasFase3 from "../../models/EstatisticasFase3.js";
import ExperimentosFase2 from "../../models/ExperimentosFase2.js";

const validarObjectId = (value, campo) => {
  if (!mongoose.isValidObjectId(value)) {
    const err = new Error(`${campo} inválido.`);
    err.status = 400;
    throw err;
  }
};

const buscarRegistro = async (fase, experimentoId) => {
  if (fase === 1) {
    return EstatisticasFase1.findOne({ experimento_id: experimentoId });
  }
  if (fase === 2) {
    return ExperimentosFase2.findById(experimentoId);
  }
  if (fase === 3) {
    return EstatisticasFase3.findOne({ experimento_id: experimentoId });
  }

  const err = new Error("Fase inválida.");
  err.status = 400;
  throw err;
};

export const salvarFeedbackProfissional = async ({
  doutorId,
  fase,
  experimentoId,
  feedbackProfissional,
  notaDoProfissional,
  modoTreinamento,
}) => {
  validarObjectId(doutorId, "ID do doutor");
  validarObjectId(experimentoId, "ID do experimento");

  if (modoTreinamento !== true) {
    const err = new Error(
      "O feedback profissional só existe no modo de treinamento.",
    );
    err.status = 400;
    throw err;
  }

  if (
    !Number.isInteger(notaDoProfissional) ||
    notaDoProfissional < 0 ||
    notaDoProfissional > 5
  ) {
    const err = new Error(
      "A nota do profissional deve ser um número inteiro entre 0 e 5.",
    );
    err.status = 400;
    throw err;
  }

  if (typeof feedbackProfissional !== "string") {
    const err = new Error("O feedback profissional deve ser um texto.");
    err.status = 400;
    throw err;
  }

  const registro = await buscarRegistro(fase, experimentoId);
  if (!registro) {
    const err = new Error("Estatísticas da fase não encontradas.");
    err.status = 404;
    throw err;
  }

  const pacienteId = fase === 2 ? registro.client_id : registro.usuario_id;
  const paciente = await Pacientes.findOne({
    _id: pacienteId,
    doutor_id: doutorId,
  }).lean();
  if (!paciente) {
    const err = new Error("Paciente não encontrado para este doutor.");
    err.status = 404;
    throw err;
  }

  const update = {
    feedback_profissional: feedbackProfissional.trim(),
    nota_do_profissional: notaDoProfissional,
    modo_treinamento: true,
  };

  if (fase === 1) {
    return EstatisticasFase1.findByIdAndUpdate(registro._id, update, {
      new: true,
    }).lean();
  }
  if (fase === 2) {
    return ExperimentosFase2.findByIdAndUpdate(registro._id, update, {
      new: true,
    }).lean();
  }
  return EstatisticasFase3.findByIdAndUpdate(registro._id, update, {
    new: true,
  }).lean();
};
