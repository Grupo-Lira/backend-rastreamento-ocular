import mongoose from "mongoose";
import {
  DWELL_REQUIRED_MS,
  clearAlvosFase1,
  clearEstadoExperimentoFase1,
  clearEstadoExperimentoHistoricoFase1,
  getAlvoFase1,
  getAlvoFase1ByIndice,
  getEstadoExperimentoFase1ByExpId,
  getEstadoExperimentoHistoricoFase1,
  salvarAlvoFase1,
  salvarEstadoExperimentoFase1,
  salvarEstadoExperimentoHistoricoFase1,
  updateEstadoExperimentoFase1,
} from "../../database/redis/redisHandlers.js";
import EstatisticasFase1 from "../../models/EstatisticasFase1.js";
import ExperimentosFase1 from "../../models/ExperimentosFase1.js";
import { MOTIVO_TEMPO_ESGOTADO } from "../../utils/constantes.js";

import { EXPERIMENTO_STATUS_EM_EXECUCAO } from "../../utils/constantes.js";

const toTimestamp = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const calcularMediaDesvio = (valores) => {
  if (!Array.isArray(valores) || valores.length === 0) {
    return { media: 0, desvioPadrao: 0 };
  }

  const media = valores.reduce((acc, valor) => acc + valor, 0) / valores.length;
  const variancia =
    valores.reduce((acc, valor) => acc + Math.pow(valor - media, 2), 0) /
    valores.length;

  return {
    media: Number(media.toFixed(2)),
    desvioPadrao: Number(Math.sqrt(variancia).toFixed(2)),
  };
};

const analisarAlvoFase1 = (resultado, historico) => {
  const inicioMs = toTimestamp(resultado?.tempo_inicio_alvo);
  const fimMs = toTimestamp(resultado?.tempo_fim_alvo);

  const eventosDoAlvo = historico
    .filter((evento) => {
      const ts = toTimestamp(evento?.timestamp);
      return (
        Number(evento?.alvo_indice) === Number(resultado?.alvo_indice) &&
        ts >= inicioMs &&
        ts <= fimMs
      );
    })
    .sort((a, b) => toTimestamp(a?.timestamp) - toTimestamp(b?.timestamp));

  const primeiroFoco = eventosDoAlvo.find((evento) =>
    Boolean(evento?.is_focando),
  );
  const tempoReacaoMs = primeiroFoco
    ? Math.max(0, toTimestamp(primeiroFoco.timestamp) - inicioMs)
    : null;

  let focoMaximoMs = 0;
  let desvioMaximoMs = 0;
  let tempoTotalFocadoMs = 0;
  let inicioBlocoFoco = null;
  let inicioBlocoDesvio = inicioMs;
  let estadoAtualFoco = false;
  let ultimoTs = inicioMs;

  for (const evento of eventosDoAlvo) {
    const eventoTs = toTimestamp(evento?.timestamp);

    if (estadoAtualFoco) {
      tempoTotalFocadoMs += Math.max(0, eventoTs - ultimoTs);
    }

    const estaFocando = Boolean(evento?.is_focando);

    if (!estadoAtualFoco && estaFocando) {
      inicioBlocoFoco = eventoTs;
      if (inicioBlocoDesvio !== null) {
        desvioMaximoMs = Math.max(desvioMaximoMs, eventoTs - inicioBlocoDesvio);
        inicioBlocoDesvio = null;
      }
    }

    if (estadoAtualFoco && !estaFocando) {
      if (inicioBlocoFoco !== null) {
        focoMaximoMs = Math.max(focoMaximoMs, eventoTs - inicioBlocoFoco);
      }
      inicioBlocoFoco = null;
      inicioBlocoDesvio = eventoTs;
    }

    estadoAtualFoco = estaFocando;
    ultimoTs = eventoTs;
  }

  if (estadoAtualFoco) {
    tempoTotalFocadoMs += Math.max(0, fimMs - ultimoTs);
    if (inicioBlocoFoco !== null) {
      focoMaximoMs = Math.max(focoMaximoMs, fimMs - inicioBlocoFoco);
    }
  } else if (inicioBlocoDesvio !== null) {
    desvioMaximoMs = Math.max(desvioMaximoMs, fimMs - inicioBlocoDesvio);
  }

  const houveQuebraFoco = eventosDoAlvo.length > 2;
  const concluiuDuracaoMinima = focoMaximoMs >= DWELL_REQUIRED_MS;

  let resultadoFinal = "ACERTO";
  // OMISSÃO: nunca focou (não encontrou primeiro foco)
  if (!primeiroFoco) {
    resultadoFinal = "OMISSAO";
  }
  // COMISSÃO: focou mas não manteve por 5 segundos (DWELL_REQUIRED_MS)
  else if (focoMaximoMs < DWELL_REQUIRED_MS) {
    resultadoFinal = "COMISSAO";
  }
  // ACERTO: focou e manteve por 5+ segundos
  else {
    resultadoFinal = "ACERTO";
  }

  return {
    alvo_indice: resultado?.alvo_indice,
    motivo_servidor: resultado?.motivo_termino,
    resultado: resultadoFinal,
    tempo_reacao_ms: tempoReacaoMs,
    foco_maximo_ms: focoMaximoMs,
    desvio_maximo_ms: desvioMaximoMs,
    tempo_total_focado_ms: tempoTotalFocadoMs,
    duracao_total_alvo_ms: Math.max(0, fimMs - inicioMs),
    concluiu_duracao_minima: concluiuDuracaoMinima,
  };
};

const criarAnaliseOmissaoFase1 = (alvoIndice) => ({
  alvo_indice: alvoIndice,
  motivo_servidor: "NAO_EXIBIDO",
  resultado: "OMISSAO",
  tempo_reacao_ms: null,
  foco_maximo_ms: 0,
  desvio_maximo_ms: 0,
  tempo_total_focado_ms: 0,
  duracao_total_alvo_ms: 0,
  concluiu_duracao_minima: false,
});

const gerarEstatisticasFase1 = async (expId) => {
  if (!expId) return null;

  const experimento = await ExperimentosFase1.findById(expId).lean();
  if (!experimento) return null;

  const resultadosAlvos = Array.isArray(experimento.resultados_alvos)
    ? experimento.resultados_alvos
    : [];
  const historicoOlhar = Array.isArray(experimento.historico_olhar)
    ? experimento.historico_olhar
    : [];
  const alvosConfigurados = await getAlvoFase1(expId);
  const totalAlvosEsperados =
    Number(experimento.total_alvos) ||
    (Array.isArray(alvosConfigurados)
      ? alvosConfigurados.length
      : resultadosAlvos.length);
  const totalAlvosExibidos = new Set(
    resultadosAlvos.map((resultado) => Number(resultado.alvo_indice)),
  ).size;

  const resultadosPorIndice = new Map(
    resultadosAlvos.map((resultado) => [
      Number(resultado.alvo_indice),
      resultado,
    ]),
  );

  const analisePorAlvo = Array.from(
    { length: totalAlvosEsperados },
    (_, index) => {
      const alvoIndice = index + 1;
      const resultado = resultadosPorIndice.get(alvoIndice);

      if (!resultado) {
        return criarAnaliseOmissaoFase1(alvoIndice);
      }

      return analisarAlvoFase1(resultado, historicoOlhar);
    },
  );

  const temposReacao = analisePorAlvo
    .map((item) => item.tempo_reacao_ms)
    .filter((item) => Number.isFinite(item));

  const { media: trMedio, desvioPadrao: trDesvioPadrao } =
    calcularMediaDesvio(temposReacao);

  const resumoMetricas = {
    tempo_reacao_medio_ms: trMedio,
    tempo_reacao_desvio_padrao_ms: trDesvioPadrao,
    total_alvos: totalAlvosEsperados,
    total_alvos_exibidos: totalAlvosExibidos,
    total_acertos: analisePorAlvo.filter((item) => item.resultado === "ACERTO")
      .length,
    total_comissao: analisePorAlvo.filter(
      (item) => item.resultado === "COMISSAO",
    ).length,
    total_omissao: Math.max(0, totalAlvosEsperados - totalAlvosExibidos),
  };

  const estatisticasPayload = {
    usuario_id: new mongoose.Types.ObjectId(String(experimento.client_id)),
    experimento_id: experimento._id,
    analise_por_alvo: analisePorAlvo,
    resumo_metricas: resumoMetricas,
    timestamp_analise: new Date(),
  };

  return EstatisticasFase1.findOneAndUpdate(
    { experimento_id: experimento._id },
    { $set: estatisticasPayload },
    { upsert: true, returnDocument: "after" },
  ).lean();
};

// funções chamadas pelo handler para interagir com o mongo e o redis, e realizar as ações necessárias para o fluxo da fase 1

const iniciarDestaqueEstrela = async (expId) => {
  const estado = await buscarExperimentoFase1Redis(expId);

  const alvoAtual = await buscarAlvoFase1Redis(expId, estado.alvoAtual);

  return alvoAtual;
};

const finalizarFocoAlvo = async (
  expId,
  estado,
  motivoTermino,
  currDate,
  socket,
) => {
  const historicoOlhar = await getEstadoExperimentoHistoricoFase1(expId); // pega o histórico do olhar do redis para salvar no mongo junto com o resultado do alvo

  console.debug(
    `Finalizando foco do alvo ${estado.alvoAtual} para experimento ${expId}. Motivo: ${motivoTermino}. Histórico de olhar:`,
    historicoOlhar,
  );

  // atualiza o mongo com o resultado do alvo e o histórico do olhar, para depois limpar o histórico do olhar do redis
  await ExperimentosFase1.findByIdAndUpdate(
    expId,
    {
      $push: {
        resultados_alvos: {
          alvo_indice: estado.alvoAtual,
          motivo_termino: motivoTermino,
          tempo_inicio_alvo: estado.timestampInicio,
          tempo_fim_alvo: currDate,
        },
        historico_olhar: { $each: historicoOlhar },
      },
    },
    { returnDocument: "after" },
  );

  await clearEstadoExperimentoHistoricoFase1(expId); // limpa o histórico do olhar do redis para o próximo alvo

  // buscar o objeto do alvo atual para enviar ao front (mesmo formato de `brilhar_estrela`)
  let alvoObj = null;
  try {
    alvoObj = await getAlvoFase1ByIndice(expId, estado.alvoAtual);
  } catch (err) {
    console.debug("Erro ao buscar alvo para emitir alvo_fase1_concluido:", err);
  }

  socket.emit("alvo_fase1_concluido", {
    fase: 1,
    alvo: alvoObj ?? estado.alvoAtual,
    motivo_termino: motivoTermino,
  });

  const alvos = await getAlvoFase1(expId);
  if (
    estado.alvoAtual + 1 > alvos.length ||
    motivoTermino === MOTIVO_TEMPO_ESGOTADO
  ) {
    //TODO-ADICIONAR METRICAS
    let estatisticas = null;
    try {
      estatisticas = await gerarEstatisticasFase1(expId);
    } catch (err) {
      console.error("Erro ao gerar estatisticas da fase 1:", err);
    }

    const payloadFaseConcluida = {
      fase: 1,
      metricas: estatisticas?.resumo_metricas ?? {},
    };

    socket.emit("fase_concluida", payloadFaseConcluida);
    await finalizarFase1(expId, currDate, motivoTermino);

    return;
    // se o motivo de término não for tempo esgotado, mas sim foco completo, inicia o próximo alvo
  } else if (motivoTermino !== MOTIVO_TEMPO_ESGOTADO) {
    estado.alvoAtual += 1;
    estado.focoConsecutivo = 0;
    estado.foraConsecutivo = 0;
    estado.inicioFocoTs = 0;
    estado.ultimoFocoTs = 0;
    estado.timestampInicio = currDate;
    await atualizarEstadoExperimentoFase1Redis(expId, estado);
    const novoAlvo = await iniciarDestaqueEstrela(expId);

    socket.emit("brilhar_estrela", {
      fase: 1,
      alvo: novoAlvo,
    });
  }
};

const finalizarFase1 = async (expId) => {
  await Promise.all([
    clearAlvosFase1(expId),
    clearEstadoExperimentoFase1(expId),
    clearEstadoExperimentoHistoricoFase1(expId),
  ]);
};

//mongoDB
const salvarExperimentoFase1 = async (usuarioId, totalAlvos = 0) => {
  try {
    const experimentoFase1 = await ExperimentosFase1.create({
      client_id: usuarioId,
      fase: 1,
      status: EXPERIMENTO_STATUS_EM_EXECUCAO,
      data_hora: new Date(),
      total_alvos: Number(totalAlvos) || 0,
      historico_olhar: [],
      resultados_alvos: [],
    });

    return experimentoFase1;
  } catch (err) {
    console.error("Erro ao salvar experimento:", err);
    throw err;
  }
};

//REDIS
const salvarExperimentoFase1Redis = async (expId, alvoIndice = 1) => {
  await salvarEstadoExperimentoFase1(expId, alvoIndice);
};

const buscarExperimentoFase1Redis = async (experimentoFase1Id) => {
  const estadoExperimentoFase1 =
    await getEstadoExperimentoFase1ByExpId(experimentoFase1Id);
  return estadoExperimentoFase1;
};

const atualizarEstadoExperimentoFase1Redis = async (expId, newEstado) => {
  await updateEstadoExperimentoFase1(expId, newEstado);
};

const salvarAlvosFase1Redis = async (expId, alvos) => {
  await salvarAlvoFase1(expId, alvos);
};

const buscarAlvoFase1Redis = async (expId, alvoAtualIndice) => {
  const alvo = await getAlvoFase1ByIndice(expId, alvoAtualIndice);
  return alvo;
};

const incluirDadoHistoricoFase1Redis = async (
  expId,
  alvoId,
  currDate,
  isFocando,
  olharCoord,
  tipoEvento,
) => {
  const currentDadoOlhar = {
    is_focando: isFocando,
    timestamp: currDate,
    alvo_indice: alvoId,
    olhar_coord: olharCoord,
    tipo: tipoEvento,
  };

  await salvarEstadoExperimentoHistoricoFase1(expId, currentDadoOlhar);
};

export {
  atualizarEstadoExperimentoFase1Redis,
  buscarAlvoFase1Redis,
  buscarExperimentoFase1Redis,
  finalizarFase1,
  finalizarFocoAlvo,
  incluirDadoHistoricoFase1Redis,
  iniciarDestaqueEstrela,
  salvarAlvosFase1Redis,
  salvarExperimentoFase1,
  salvarExperimentoFase1Redis
};
