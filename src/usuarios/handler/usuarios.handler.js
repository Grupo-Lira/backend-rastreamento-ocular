import updateUsuariosDto from "../../dto/request/updateUsuarios.js";
import {
  atualizarUsuarioPorId,
  deletarUsuarioPorId,
  listarUsuarios,
} from "../service/usuariosService.js";

const listarUsuariosHandler = async (_req, res) => {
  try {
    const usuarios = await listarUsuarios();
    return res.status(200).json({ data: usuarios });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const atualizarUsuarioPorIdHandler = async (req, res) => {
  try {
    const dadosDto = updateUsuariosDto(req.body);
    const usuarioAtualizado = await atualizarUsuarioPorId(
      req.params.id,
      dadosDto,
    );
    return res.status(200).json({ data: usuarioAtualizado });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletarUsuarioPorIdHandler = async (req, res) => {
  try {
    await deletarUsuarioPorId(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export {
  atualizarUsuarioPorIdHandler,
  deletarUsuarioPorIdHandler,
  listarUsuariosHandler
};

