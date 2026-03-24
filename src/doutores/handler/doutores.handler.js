import createDoutorProfileDto from "../../dto/request/createDoutorProfile.js";
import updateDoutoresDto from "../../dto/request/updateDoutores.js";
import {
  getDoutorResponseDto,
  getDoutoresResponseDto,
} from "../../dto/response/getDoutores.js";
import {
  atualizarMeuPerfilPorUsuarioId,
  buscarDoutorPorId,
  buscarDoutorPorUsuarioId,
  criarDoutorParaMenu,
  deletarDoutorPorId,
  listarDoutores,
} from "../service/doutoresService.js";

const listarDoutoresHandler = async (_req, res) => {
  try {
    const doutores = await listarDoutores();
    return res.status(200).json({ data: getDoutoresResponseDto(doutores) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarMeuPerfilHandler = async (req, res) => {
  try {
    const doutor = await buscarDoutorPorUsuarioId(req.user.id);
    return res.status(200).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarDoutorPorIdHandler = async (req, res) => {
  try {
    const doutor = await buscarDoutorPorId(req.params.id);
    return res.status(200).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const atualizarMeuPerfilHandler = async (req, res) => {
  try {
    const dadosDto = updateDoutoresDto(req.body);
    const doutorAtualizado = await atualizarMeuPerfilPorUsuarioId(
      req.user.id,
      dadosDto,
      req.user,
    );
    return res
      .status(200)
      .json({ data: getDoutorResponseDto(doutorAtualizado) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletarDoutorPorIdHandler = async (req, res) => {
  try {
    await deletarDoutorPorId(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const criarMeuDoutorHandler = async (req, res) => {
  try {
    const dadosDto = createDoutorProfileDto(req.body);
    const doutor = await criarDoutorParaMenu(req.user.id, dadosDto);
    return res.status(201).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export {
  atualizarMeuPerfilHandler,
  buscarDoutorPorIdHandler,
  buscarMeuPerfilHandler,
  criarMeuDoutorHandler,
  deletarDoutorPorIdHandler,
  listarDoutoresHandler,
};

