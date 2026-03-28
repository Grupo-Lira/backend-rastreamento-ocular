import updateUsuariosDto from "../../dto/request/updateUsuarios.js";
import {
  getUsuarioResponseDto,
  getUsuariosResponseDto,
} from "../../dto/response/getUsuarios.js";
import {
  atualizarPorId,
  deletarPorId,
  listar,
} from "../service/usuariosService.js";

const listarUsuariosHandler = async (_req, res) => {
  try {
    const usuarios = await listar();
    return res.status(200).json({ data: getUsuariosResponseDto(usuarios) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const atualizarUsuarioPorIdHandler = async (req, res) => {
  try {
    const dadosDto = updateUsuariosDto(req.body);
    const usuarioAtualizado = await atualizarPorId(
      req.params.id,
      dadosDto,
    );
    return res.status(200).json({ data: getUsuarioResponseDto(usuarioAtualizado) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletarUsuarioPorIdHandler = async (req, res) => {
  try {
    await deletarPorId(req.params.id);
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

