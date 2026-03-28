import createPacienteDto from "../../dto/request/createPaciente.js";
import updatePacientesDto from "../../dto/request/updatePacientes.js";
import {
  getPacienteResponseDto,
  getPacientesResponseDto,
} from "../../dto/response/getPacientes.js";
import {
  buscarPorNome,
  criar,
  deletar,
  editar,
  listar,
} from "../service/pacienteService.js";

const criarPacienteHandler = async (req, res) => {
  try {
    const dadosDto = createPacienteDto(req.body);
    const paciente = await criar(req.user.id, dadosDto);
    return res.status(201).json({ data: getPacienteResponseDto(paciente) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const listarPacientesHandler = async (req, res) => {
  try {
    const pacientes = await listar(req.user.id);
    return res.status(200).json({ data: getPacientesResponseDto(pacientes) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarPacienteHandler = async (req, res) => {
  try {
    const paciente = await buscarPorNome(req.user.id, req.params.nome);
    return res.status(200).json({ data: getPacienteResponseDto(paciente) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const editarPacienteHandler = async (req, res) => {
  try {
    const dadosDto = updatePacientesDto(req.body);
    const paciente = await editar(req.user.id, req.params.nome, dadosDto);
    return res.status(200).json({ data: getPacienteResponseDto(paciente) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletarPacienteHandler = async (req, res) => {
  try {
    await deletar(req.user.id, req.params.nome);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export {
  buscarPacienteHandler,
  criarPacienteHandler,
  deletarPacienteHandler,
  editarPacienteHandler,
  listarPacientesHandler
};

