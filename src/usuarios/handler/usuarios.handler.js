import updateUsuariosDto from "../../dto/request/updateUsuarios.js";
import { getUsuarioResponseDto } from "../../dto/response/getUsuarios.js";
import {
  getById,
  updateById,
  deleteById,
} from "../service/usuariosService.js";

const getProfileHandler = async (req, res) => {
  try {
    const usuario = await getById(req.user.id);
    return res.status(200).json({ data: getUsuarioResponseDto(usuario) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const updateProfileHandler = async (req, res) => {
  try {
    const dadosDto = updateUsuariosDto(req.body);
    const usuario = await updateById(req.user.id, dadosDto);
    return res.status(200).json({ data: getUsuarioResponseDto(usuario) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deleteProfileHandler = async (req, res) => {
  try {
    await deleteById(req.user.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export {
  getProfileHandler,
  updateProfileHandler,
  deleteProfileHandler,
};

