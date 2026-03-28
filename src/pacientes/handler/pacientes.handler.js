import {
  buscarPorNome,
  criar,
  deletar,
  editar,
  listar,
} from "../service/pacienteService.js";

const criarPacienteHandler = async (req, res) => {
  try {
    const data = await criar(req.user.id, req.body);
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const listarPacientesHandler = async (req, res) => {
  try {
    const data = await listar(req.user.id);
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarPacienteHandler = async (req, res) => {
  try {
    const data = await buscarPorNome(req.user.id, req.params.nome);
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const editarPacienteHandler = async (req, res) => {
  try {
    const data = await editar(req.user.id, req.params.nome, req.body);
    return res.status(200).json({ data });
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

