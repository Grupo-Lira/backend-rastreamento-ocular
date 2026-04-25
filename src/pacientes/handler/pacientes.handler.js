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

const createPacienteHandler = async (req, res) => {
  try {
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

