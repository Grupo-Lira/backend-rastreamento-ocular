import {
  DWELL_REQUIRED_MS,
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
import EstatisticasFase3 from "../../models/EstatisticasFase3.js";
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

const RESULTADO_ACERTO = "ACERTO";
const RESULTADO_COMISSAO = "COMISSAO";
const RESULTADO_OMISSAO = "OMISSAO";

const toTimestamp = (value) => {
  const ts = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(ts) ? ts : 0;
};

const calcularMediaDesvio = (valores) => {
  if (!Array.isArray(valores) || valores.length === 0) {
    return { media: 0, desvioPadrao: 0 };
  }

  const media = valores.reduce((acc, value) => acc + value, 0) / valores.length;
  const variancia =
    valores.reduce((acc, value) => acc + Math.pow(value - media, 2), 0) /
    valores.length;

  return {
    media: Number(media.toFixed(2)),
    desvioPadrao: Number(Math.sqrt(variancia).toFixed(2)),
  };
};

// resultado: objeto com informações do resultado do alvo (incluindo motivo de término e timestamps)
// historico: array de eventos de olhar registrados durante o experimento
const analisarAlvoFase3 = (resultado, historico) => {
  // início e fim do alvo
  const inicioMs = toTimestamp(resultado?.tempo_inicio_alvo);
  const fimMs = toTimestamp(resultado?.tempo_fim_alvo);

  // filtra os eventos de olhar que correspondem ao alvo atual
  const eventosDoAlvo = historico
    .filter((evento) => {
      const ts = toTimestamp(evento?.timestamp);
      return (
        String(evento?.nome_alvo ?? "").toUpperCase() ===
          String(resultado?.nome_alvo ?? "").toUpperCase() &&
        ts >= inicioMs &&
        ts <= fimMs
      );
    })
    .sort((a, b) => toTimestamp(a?.timestamp) - toTimestamp(b?.timestamp));

  let tempoTotalFocadoMs = 0;
  let focoMaximoMs = 0;
  let desvioMaximoMs = 0;
  let inicioBlocoFoco = null;
  let inicioBlocoDesvio = inicioMs;
  let estadoAtualFoco = false;
  let ultimoTs = inicioMs;

  for (const evento of eventosDoAlvo) {
    const eventoTs = toTimestamp(evento?.timestamp);

    // Se estava focando antes deste evento, acumula o tempo focado até agora
    if (estadoAtualFoco) {
      tempoTotalFocadoMs += Math.max(0, eventoTs - ultimoTs);
    }

    const estaFocando = Boolean(evento?.is_focando);

    //  desvio -> foco: inicia um bloco de foco e fecha o bloco de desvio
    if (!estadoAtualFoco && estaFocando) {
      inicioBlocoFoco = eventoTs;
      if (inicioBlocoDesvio !== null) {
        desvioMaximoMs = Math.max(desvioMaximoMs, eventoTs - inicioBlocoDesvio);
        inicioBlocoDesvio = null;
      }
    }

    // foco -> desvio: finaliza o bloco de foco e inicia um bloco de desvio
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

  // se terminou focando, soma o ultimo evento ate o fim do alvo em tempoTotalFocadoms
  if (estadoAtualFoco) {
    tempoTotalFocadoMs += Math.max(0, fimMs - ultimoTs);
    if (inicioBlocoFoco !== null) {
      focoMaximoMs = Math.max(focoMaximoMs, fimMs - inicioBlocoFoco);
    }
    // se terminou desviando, calcula o desvio até o fim do alvo
  } else if (inicioBlocoDesvio !== null) {
    desvioMaximoMs = Math.max(desvioMaximoMs, fimMs - inicioBlocoDesvio);
  }

  // calcula tempo de reação
  // busca o primeiro evento de foco
  const primeiroFoco = eventosDoAlvo.find((evento) =>
    Boolean(evento?.is_focando),
  );
  // se existir um evento de foco: tempo de reação = timestamp do primeiro foco - início do alvo
  // se não existir evento de foco: tempo de reação = null
  const tempoReacaoMs = primeiroFoco
    ? Math.max(0, toTimestamp(primeiroFoco.timestamp) - inicioMs)
    : null;

  // calcula a duração total do alvo para analisar acertos e erros
  const duracaoTotalAlvoMs = Math.max(0, fimMs - inicioMs);

  // calcula omissão ou comissão
  const tempoOmissaoMaxMs = DWELL_REQUIRED_MS;
  const focoNaoIniciado =
    tempoReacaoMs === null || tempoReacaoMs > tempoOmissaoMaxMs;
  const latenciaRetornoExcedida = desvioMaximoMs > tempoOmissaoMaxMs; // ela viu, mas demorou muito para voltar o foco para o alvo
  const concluiuFocoMinimo = focoMaximoMs >= DWELL_REQUIRED_MS;
  const houveQuebraFoco = eventosDoAlvo.length > 2; // mais de 2 eventos (foco-desvio-foco) indica que houve uma quebra de foco durante o alvo

  
  const quantidadeComissaoEventos = eventosDoAlvo.filter(
    (evento) => evento?.tipo === "DESVIO_COMISSAO",
  ).length;
  const quantidadeOmissaoEventos = eventosDoAlvo.filter(
    (evento) => evento?.tipo === "DESVIO_OMISSAO",
  ).length;

  let resultadoFinal = RESULTADO_ACERTO;
  if (focoNaoIniciado) {
    resultadoFinal = RESULTADO_OMISSAO;
  } else if (
    latenciaRetornoExcedida ||
    houveQuebraFoco ||
    !concluiuFocoMinimo ||
    resultado?.motivo_termino === MOTIVO_TROCA_ALVO
  ) {
    resultadoFinal = RESULTADO_COMISSAO;
  }

  // objeto para salvar em analise_por_alvo
  return {
    nome_alvo: resultado?.nome_alvo,
    motivo_servidor: resultado?.motivo_termino,
    resultado: resultadoFinal,
    quantidade_acerto: resultadoFinal === RESULTADO_ACERTO ? 1 : 0,
    quantidade_comissao: quantidadeComissaoEventos,
    quantidade_omissao: quantidadeOmissaoEventos,
    tempo_reacao_ms: tempoReacaoMs,
    foco_maximo_ms: focoMaximoMs,
    desvio_maximo_ms: desvioMaximoMs,
    tempo_total_focado_ms: tempoTotalFocadoMs,
    duracao_total_alvo_ms: duracaoTotalAlvoMs,
  };
};

const gerarEstatisticasFase3 = async (expId) => {
  if (!expId) return null;

  const experimento = await ExperimentosFase3.findById(expId).lean();
  if (!experimento) return null;

  const resultadosAlvos = Array.isArray(experimento.resultados_alvos)
    ? experimento.resultados_alvos
    : [];
  const historicoOlhar = Array.isArray(experimento.historico_olhar)
    ? experimento.historico_olhar
    : [];

  const analisePorAlvo = resultadosAlvos.map((resultado) =>
    analisarAlvoFase3(resultado, historicoOlhar),
  );

  const temposReacao = analisePorAlvo
    .map((item) => item.tempo_reacao_ms)
    .filter((item) => Number.isFinite(item));

  const { media: trMedio, desvioPadrao: trDesvioPadrao } =
    calcularMediaDesvio(temposReacao);

  const resumoMetricas = {
    tempo_reacao_medio_ms: trMedio,
    tempo_reacao_desvio_padrao_ms: trDesvioPadrao,
    // acertos por alvo + ocorrencias de eventos de comissao/omissao
    total_acertos: analisePorAlvo.reduce(
      (acc, item) => acc + item.quantidade_acerto,
      0,
    ),
    total_comissao: analisePorAlvo.reduce(
      (acc, item) => acc + item.quantidade_comissao,
      0,
    ),
    total_omissao: analisePorAlvo.reduce(
      (acc, item) => acc + item.quantidade_omissao,
      0,
    ),
  };

  const estatisticasPayload = {
    usuario_id: experimento.client_id,
    experimento_id: experimento._id,
    analise_por_alvo: analisePorAlvo,
    resumo_metricas: resumoMetricas,
    timestamp_analise: new Date(),
  };

  const estatisticas = await EstatisticasFase3.findOneAndUpdate(
    { experimento_id: experimento._id },
    { $set: estatisticasPayload },
    { upsert: true, returnDocument: "after" },
  ).lean();

  return estatisticas;
};

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
    let estatisticas = null;
    try {
      estatisticas = await gerarEstatisticasFase3(expId);
    } catch (err) {
      console.error("Erro ao gerar estatisticas da fase 3:", err);
    }

    socket.emit("fase_concluida", {
      fase: 3,
      metricas: estatisticas?.resumo_metricas ?? {},
    });

    await finalizarFase3(expId);
    return { faseConcluida: true };
  }

  // verifica se tem mais alvos para brilhar
  if (motivoTermino === MOTIVO_FOCO_COMPLETO) {
    const indiceAtual = ALVOS_FASE3.indexOf(estado.nomeAlvoAtual);
    const proximoNomeAlvo = ALVOS_FASE3[indiceAtual + 1];

    if (!proximoNomeAlvo) {
      let estatisticas = null;
      try {
        estatisticas = await gerarEstatisticasFase3(expId);
      } catch (err) {
        console.error("Erro ao gerar estatisticas da fase 3:", err);
      }

      socket.emit("fase_concluida", {
        fase: 3,
        metricas: estatisticas?.resumo_metricas ?? {},
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

