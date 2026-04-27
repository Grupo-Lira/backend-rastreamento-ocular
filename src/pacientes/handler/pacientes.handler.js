import createPacienteDto from "../../dto/request/createPaciente.js";
import updatePacientesDto from "../../dto/request/updatePacientes.js";
import {
  getPacienteResponseDto,
  getPacientesResponseDto,
} from "../../dto/response/getPacientes.js";
import {
  getById,
  create,
  deleteById,
  updateById,
  getall,
} from "../service/pacienteService.js";
import ExperimentosFase1 from "../../models/ExperimentosFase1.js";
import ExperimentosFase2 from "../../models/ExperimentosFase2.js";
import ExperimentosFase3 from "../../models/ExperimentosFase3.js";

const verificarFasesCompletas = async (pacienteId) => {
  try {
    const [temFase1, temFase2, temFase3] = await Promise.all([
      ExperimentosFase1.findOne({ usuario_id: pacienteId }).lean(),
      ExperimentosFase2.findOne({ usuario_id: pacienteId }).lean(),
      ExperimentosFase3.findOne({ usuario_id: pacienteId }).lean(),
    ]);

    return !!(temFase1 && temFase2 && temFase3);
  } catch {
    return false;
  }
};

const createPacienteHandler = async (req, res) => {
  try {
    if (req.body?.observacoes !== undefined) {
      const err = new Error(
        "Observações não podem ser enviadas na criação do paciente. Adicione após a conclusão das 3 fases.",
      );
      err.status = 400;
      throw err;
    }

    const dadosDto = createPacienteDto(req.body);

    await create(req.user.id, dadosDto);
    return res.status(201).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const getAllPacientesHandler = async (req, res) => {
  try {
    const pacientes = await getall(req.user.id);
    return res.status(200).json({ data: getPacientesResponseDto(pacientes) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const getPacienteHandler = async (req, res) => {
  try {
    const paciente = await getById(req.user.id, req.params.id);
    return res.status(200).json({ data: getPacienteResponseDto(paciente) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const updatePacienteHandler = async (req, res) => {
  try {
    const dadosDto = updatePacientesDto(req.body);

    if (dadosDto.observacoes !== undefined) {
      const fasesCompletas = await verificarFasesCompletas(req.params.id);
      if (!fasesCompletas) {
        const err = new Error("Observações só podem ser adicionadas após a conclusão das 3 fases.");
        err.status = 403;
        throw err;
      }
    }

    const paciente = await updateById(req.user.id, req.params.id, dadosDto);
    return res.status(200).json({ data: getPacienteResponseDto(paciente) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletePacienteHandler = async (req, res) => {
  try {
    const paciente = await deleteById(req.user.id, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export {
  getPacienteHandler,
  createPacienteHandler,
  deletePacienteHandler,
  updatePacienteHandler,
  getAllPacientesHandler
};

