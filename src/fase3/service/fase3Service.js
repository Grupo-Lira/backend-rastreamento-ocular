import {
  clearAlvosFase3,
  clearEstadoExperimentoFase3,
  clearEstadoExperimentoHistoricoFase3,
  getAlvoFase3ByNome,
  getEstadoExperimentoFase3ByExpId,
  getEstadoExperimentoHistoricoFase3,
  salvarAlvoFase3,
  salvarEstadoExperimentoFase3,
  salvarEstadoExperimentoHistoricoFase3,
  updateEstadoExperimentoFase3,
} from "../../database/redis/redisHandlers.js";
import ExperimentosFase3 from "../../models/ExperimentosFase3.js";
import {
  ALVO,
  ALVOS_FASE3,
  EXPERIMENTO_STATUS_EM_EXECUCAO,
  LARGURA_TELA_PADRAO,
  MOTIVO_FOCO_COMPLETO,
  MOTIVO_TEMPO_ESGOTADO,
  MOTIVO_TROCA_ALVO,
} from "../../utils/constantes.js";

const iniciarDestaqueAlvo = async (expId) => {
  const estado = await buscarExperimentoFase3Redis(expId);

  const nomeAlvoAtual = estado?.nomeAlvoAtual;
  const alvoAtual = await buscarAlvoFase3Redis(expId, nomeAlvoAtual);

  return alvoAtual;
};

const finalizarFocoAlvoFase3 = async (
  expId,
  estado,
  motivoTermino,
  currDate,
  socket,
) => {
  const historicoOlhar = await getEstadoExperimentoHistoricoFase3(expId);

  await ExperimentosFase3.findByIdAndUpdate(
    expId,
    {
      $push: {
        resultados_alvos: {
          nome_alvo: estado.nomeAlvoAtual,
          motivo_termino: motivoTermino,
          tempo_inicio_alvo: estado.timestampInicio,
          tempo_fim_alvo: currDate,
        },
        historico_olhar: { $each: historicoOlhar },
      },
    },
    { returnDocument: "after" },
  );

  await clearEstadoExperimentoHistoricoFase3(expId);

  socket.emit("alvo_fase3_concluido", {
    fase: 3,
    alvo: estado.nomeAlvoAtual,
    motivo_termino: motivoTermino,
  });

  if (motivoTermino === MOTIVO_TEMPO_ESGOTADO) {
    socket.emit("fase_concluida", {
      fase: 3,
    });

    await finalizarFase3(expId);
    return { faseConcluida: true };
  }

  // verifica se tem mais alvos para brilhar
  if (motivoTermino === MOTIVO_FOCO_COMPLETO) {
    const indiceAtual = ALVOS_FASE3.indexOf(estado.nomeAlvoAtual);
    const proximoNomeAlvo = ALVOS_FASE3[indiceAtual + 1];

    if (!proximoNomeAlvo) {
      socket.emit("fase_concluida", {
        fase: 3,
      });

      await finalizarFase3(expId);
      return { faseConcluida: true };
    }

    estado.nomeAlvoAtual = proximoNomeAlvo;
    estado.focoConsecutivo = 0;
    estado.foraConsecutivo = 0;
    estado.inicioFocoTs = 0;
    estado.ultimoFocoTs = 0;
    estado.timestampInicio = currDate;

    await atualizarEstadoExperimentoFase3Redis(expId, estado);

    const proximoAlvo = await buscarAlvoFase3Redis(expId, proximoNomeAlvo);
    socket.emit("brilhar_alvo_fase3", {
      fase: 3,
      alvo: proximoAlvo?.nome ?? proximoNomeAlvo,
    });

    return {
      faseConcluida: false,
      alvoAtual: proximoAlvo?.nome ?? proximoNomeAlvo,
    };
  }
};

const registrarTrocaAlvoFase3 = async (expId, estado, currDate) => {
  const historicoOlhar = await getEstadoExperimentoHistoricoFase3(expId);

  await ExperimentosFase3.findByIdAndUpdate(
    expId,
    {
      $push: {
        resultados_alvos: {
          nome_alvo: estado.nomeAlvoAtual,
          motivo_termino: MOTIVO_TROCA_ALVO,
          tempo_inicio_alvo: estado.timestampInicio,
          tempo_fim_alvo: currDate,
        },
        historico_olhar: { $each: historicoOlhar },
      },
    },
    { returnDocument: "after" },
  );

  await clearEstadoExperimentoHistoricoFase3(expId);
};

const finalizarFase3 = async (expId) => {
  if (!expId) return;

  await Promise.all([
    clearAlvosFase3(expId),
    clearEstadoExperimentoFase3(expId),
    clearEstadoExperimentoHistoricoFase3(expId),
  ]);
};

const salvarExperimentoFase3 = async (usuarioId) => {
  try {
    const experimentoFase3 = await ExperimentosFase3.create({
      client_id: usuarioId,
      fase: 3,
      status: EXPERIMENTO_STATUS_EM_EXECUCAO,
      data_hora: new Date(),
      historico_olhar: [],
      resultados_alvos: [],
    });

    return experimentoFase3;
  } catch (err) {
    console.error("Erro ao salvar experimento fase 3:", err);
    throw err;
  }
};

const salvarExperimentoFase3Redis = async (
  expId,
  nomeAlvoInicial = ALVO.ESTRELA,
) => {
  await salvarEstadoExperimentoFase3(expId, nomeAlvoInicial);
};

const buscarExperimentoFase3Redis = async (experimentoFase3Id) => {
  const estadoExperimentoFase3 =
    await getEstadoExperimentoFase3ByExpId(experimentoFase3Id);
  return estadoExperimentoFase3;
};

const atualizarEstadoExperimentoFase3Redis = async (expId, newEstado) => {
  await updateEstadoExperimentoFase3(expId, newEstado);
};

const salvarAlvosFase3Redis = async (expId, alvos) => {
  if (!Array.isArray(alvos) || alvos.length === 0) {
    throw new Error("Lista de alvos da fase 3 inválida.");
  }

  // Enriquecer alvos com nome baseado na ordem esperada da fase 3
  const alvosEnriquecidos = alvos.map((alvo, index) => ({
    ...alvo,
    nome: ALVOS_FASE3[index] || ALVO.ESTRELA,
  }));

  await salvarAlvoFase3(expId, alvosEnriquecidos);
};

const buscarAlvoFase3Redis = async (expId, nomeAlvo) => {
  const alvo = await getAlvoFase3ByNome(expId, nomeAlvo);
  return alvo;
};

const getLadoTela = (x, larguraTela = LARGURA_TELA_PADRAO) => {
  const metadeTela = larguraTela / 2;
  return x < metadeTela ? "ESQUERDO" : "DIREITO";
};

const incluirDadoHistoricoFase3Redis = async (
  expId,
  alvo,
  currDate,
  isFocando,
  olharCoord,
  tipoEvento,
  larguraTela,
) => {
  const currentDadoOlhar = {
    is_focando: isFocando,
    timestamp: currDate,
    nome_alvo: alvo.nome,
    olhar_coord: olharCoord,
    tipo: tipoEvento,
    lado_tela: getLadoTela(olharCoord.x, larguraTela),
  };

  await salvarEstadoExperimentoHistoricoFase3(expId, currentDadoOlhar);
};

export {
  atualizarEstadoExperimentoFase3Redis,
  buscarAlvoFase3Redis,
  buscarExperimentoFase3Redis,
  finalizarFase3,
  finalizarFocoAlvoFase3,
  incluirDadoHistoricoFase3Redis,
  iniciarDestaqueAlvo,
  registrarTrocaAlvoFase3,
  salvarAlvosFase3Redis,
  salvarExperimentoFase3,
  salvarExperimentoFase3Redis
};

