import createDoutorProfileDto from "../../dto/request/createDoutorProfile.js";
import updateDoutoresDto from "../../dto/request/updateDoutores.js";
import {
  getDoutorResponseDto,
  getDoutoresResponseDto,
} from "../../dto/response/getDoutores.js";
import {
  buscarMeuPerfil,
  buscarPorId,
  criar,
  deletar,
  editarMeuPerfil,
  listar,
} from "../service/doutoresService.js";

const listarDoutoresHandler = async (_req, res) => {
  try {
    const doutores = await listar();
    return res.status(200).json({ data: getDoutoresResponseDto(doutores) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const criarDoutorHandler = async (req, res) => {
  try {
    const dadosDto = createDoutorProfileDto(req.body);
    const doutor = await criar(req.user.id, dadosDto);
    return res.status(201).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarMeuPerfilHandler = async (req, res) => {
  try {
    const doutor = await buscarMeuPerfil(req.user.id);
    return res.status(200).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const buscarDoutorHandler = async (req, res) => {
  try {
    const doutor = await buscarPorId(req.params.id);
    return res.status(200).json({ data: getDoutorResponseDto(doutor) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const editarMeuPerfilHandler = async (req, res) => {
  try {
    const dadosDto = updateDoutoresDto(req.body);
    const doutorAtualizado = await editarMeuPerfil(
      req.user.id,
      dadosDto,
    );
    return res
      .status(200)
      .json({ data: getDoutorResponseDto(doutorAtualizado) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const deletarDoutorHandler = async (req, res) => {
  try {
    await deletar(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};



export {
  buscarDoutorHandler,
  buscarMeuPerfilHandler,
  criarDoutorHandler,
  deletarDoutorHandler,
  editarMeuPerfilHandler,
  listarDoutoresHandler,
};
