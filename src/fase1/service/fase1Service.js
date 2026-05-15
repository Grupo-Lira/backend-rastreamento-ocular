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
    (Array.isArray(alvosConfigurados) ? alvosConfigurados.length : resultadosAlvos.length);
  const totalAlvosExibidos = new Set(
    resultadosAlvos.map((resultado) => Number(resultado.alvo_indice)),
  ).size;

  const resultadosPorIndice = new Map(
    resultadosAlvos.map((resultado) => [Number(resultado.alvo_indice), resultado]),
  );

  const analisePorAlvo = Array.from({ length: totalAlvosEsperados }, (_, index) => {
    const alvoIndice = index + 1;
    const resultado = resultadosPorIndice.get(alvoIndice);

    if (!resultado) {
      return criarAnaliseOmissaoFase1(alvoIndice);
    }

    return analisarAlvoFase1(resultado, historicoOlhar);
  });

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

  socket.emit("alvo_fase1_concluido", {
    fase: 1,
    alvo: estado.alvoAtual,
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

//TODO-IMPLEMENTAR-CALCULO-DE-ESTATISCAS-E-METRICAS-DO-EXPERIMENTO-DA-FASE-1-APOS-A-CONCLUSAO-DA-FASE-1
// // calcula a média e o desvio padrão de um array de números (tempos em que o usuário iniciou o foco no alvo)
// const calcular_desvio_padrao = (tempos) => {
//   if (tempos.length === 0) return { media: 0, desvioPadrao: 0 };
//   const soma = tempos.reduce((acc, val) => acc + val, 0);
//   const media = soma / tempos.length;
//   const variancia =
//     tempos.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) /
//     tempos.length;
//   const desvioPadrao = Math.sqrt(variancia);

//   return {
//     media: parseFloat(media.toFixed(2)),
//     desvioPadrao: parseFloat(desvioPadrao.toFixed(2)),
//   };
// };

// //função chamada após a finalização da fase 1 para calcular as métricas TDC e enviar ao front
// const analisar_metricas = async (
//   client_id,
//   historico_olhar,
//   resultados_alvos,
// ) => {
//   console.debug(
//     `\n--- INICIANDO ANÁLISE POSTERIOR DA FASE 1 (${client_id}) ---`,
//   );

//   // objeto principal para armazenar os resultados detalhados e o resumo estatístico
//   const resultados_participante = {
//     client_id: client_id,
//     analise_por_alvo: [],
//     resumo_metricas: {},
//   };

//   for (const alvo of resultados_alvos) {
//     const alvo_indice = alvo.alvo_indice;

//     // filtra e ordena cronologicamente os eventos de olhar (estado 1=foco, 0=desvio) para o alvo atual
//     const eventos_olhar_alvo = historico_olhar
//       .filter((e) => e.alvo_indice === alvo_indice)
//       .sort((a, b) => a.timestamp - b.timestamp);

//     let tempo_total_foco = 0;
//     let foco_maximo = 0;
//     let inicio_foco = null;
//     let desvio_maximo = 0;
//     let inicio_desvio = null;
//     const tempo_final = alvo.tempo_fim_alvo;

//     // cálculo de foco e desvio máximo/total
//     // percorre o histórico para calcular a duração dos blocos contínuos de foco e desvio
//     for (let i = 0; i < eventos_olhar_alvo.length; i++) {
//       const evento = eventos_olhar_alvo[i];

//       if (evento.estado === 1) {
//         if (inicio_foco === null) inicio_foco = evento.timestamp;

//         // se estava desviado, calcula o tempo que ficou em desvio (fim do desvio)
//         if (inicio_desvio !== null) {
//           const duracao_desvio = evento.timestamp - inicio_desvio;
//           if (duracao_desvio > desvio_maximo) desvio_maximo = duracao_desvio;
//           inicio_desvio = null;
//         }
//       } else if (evento.estado === 0) {
//         if (inicio_desvio === null) inicio_desvio = evento.timestamp;

//         // se estava focado, calcula o tempo que ficou focado (fim do foco)
//         if (inicio_foco !== null) {
//           const duracao_bloco = evento.timestamp - inicio_foco;
//           tempo_total_foco += duracao_bloco;
//           if (duracao_bloco > foco_maximo) foco_maximo = duracao_bloco;
//           inicio_foco = null;
//         }
//       }
//     }

//     // trata o estado final, calculando a duração do último bloco até o fim do alvo
//     // o loop anterior só registra o tempo na transição de estados, não no término do alvo
//     if (inicio_foco !== null) {
//       // o alvo terminou no estado de foco
//       const duracao_bloco = tempo_final - inicio_foco;
//       tempo_total_foco += duracao_bloco;
//       if (duracao_bloco > foco_maximo) foco_maximo = duracao_bloco;
//     } else if (inicio_desvio !== null) {
//       // o alvo terminou no estado de desvio
//       const duracao_desvio = tempo_final - inicio_desvio;
//       // atualiza apenas o desvio máximo
//       if (duracao_desvio > desvio_maximo) desvio_maximo = duracao_desvio;
//     }

//     // cálculo: tempo de reação (tr)
//     // diferença entre o primeiro foco e o início do alvo
//     const primeiro_foco = eventos_olhar_alvo.find((e) => e.estado === 1);
//     const tempo_reacao = primeiro_foco
//       ? primeiro_foco.timestamp - alvo.tempo_inicio_alvo
//       : "n/a";

//     // verifica se o foco contínuo máximo atingiu o critério de sucesso
//     const concluiu_duracao_minima = foco_maximo >= tempo_sucesso_min;

//     // classificação: omissão > comissão > acerto
//     let resultado_final;
//     const duracao_total_alvo = tempo_final - alvo.tempo_inicio_alvo;

//     // regras de omissão (foco nunca iniciado ou latência/desvio muito longos)
//     // foco nao iniciado: verifica se demorou demais para focar (tempo de reacao)
//     const foco_nao_iniciado =
//       tempo_reacao === "n/a" ||
//       (typeof tempo_reacao === "number" && tempo_reacao > tempo_omissao_max);

//     // tempo max. desviado: verifica se demorou demais para voltar ao foco
//     const latencia_retorno_excedida = desvio_maximo > tempo_omissao_max;

//     // critério para comissão: houve quebra de foco (mais de dois eventos = inicio, quebra, retorno, etc)
//     const houve_quebra_foco = eventos_olhar_alvo.length > 2;

//     // a. prioridade máxima: omissão (se demorou muito no inicio ou no retorno)
//     if (foco_nao_iniciado || latencia_retorno_excedida) {
//       resultado_final = "OMISSÃO";
//       // b. próxima prioridade: comissão (se nao foi omissao, mas houve quebras de foco)
//     } else if (houve_quebra_foco) {
//       resultado_final = "COMISSÃO";
//       // c. última prioridade: acerto (se nao e omissao nem comissao)
//     } else {
//       resultado_final = "ACERTO";
//     }

//     // log de análise por alvo
//     // deixar apenas para fase de integração por conta dos testes, pra versão final: tirar
//     console.debug(
//       `[ANÁLISE ALVO ${alvo_indice + 1}] motivo término bruto: ${
//         alvo.motivo_termino
//       }.`,
//     );
//     console.debug(
//       `  > tr: ${tempo_reacao}ms, foco máximo: ${foco_maximo}ms, desvio máximo: ${desvio_maximo}ms, duração total: ${duracao_total_alvo}ms`,
//     );
//     console.debug(
//       `  > classificação final: ${resultado_final}. concluiu duração mínima: ${concluiu_duracao_minima}. (critério: tempo_sucesso_min=${tempo_sucesso_min}ms, tempo_omissao_max=${tempo_omissao_max}ms)`,
//     );

//     // armazena o detalhe do alvo
//     resultados_participante.analise_por_alvo.push({
//       alvo_indice: alvo_indice,
//       motivo_servidor: alvo.motivo_termino,
//       resultado: resultado_final,
//       concluiu_duracao_minima: concluiu_duracao_minima,
//       tempo_reacao_ms: tempo_reacao,
//       foco_maximo_ms: foco_maximo,
//       desvio_maximo_ms: desvio_maximo,
//       tempo_total_focado_ms: tempo_total_foco,
//       duracao_total_alvo_ms: duracao_total_alvo,
//     });
//   }

//   // cálculo estatístico e resumo das métricas
//   // filtra os tempos de reação válidos para o cálculo da média
//   const tempos_reacao = resultados_participante.analise_por_alvo
//     .map((r) => r.tempo_reacao_ms)
//     .filter((tr) => typeof tr === "number");

//   // calcula média e desvio padrão usando a função auxiliar
//   const { media: tr_medio, desvioPadrao: tr_desvio_padrao } =
//     calcular_desvio_padrao(tempos_reacao);

//   // cálculo de acertos: total de alvos que atingiram o critério de foco mínimo
//   const total_acertos = resultados_participante.analise_por_alvo.filter(
//     (r) => r.concluiu_duracao_minima === true,
//   ).length;

//   // contagem de omissão/comissão
//   const total_comissao = resultados_participante.analise_por_alvo.filter(
//     (r) => r.resultado === "COMISSÃO",
//   ).length;
//   const total_omissao = resultados_participante.analise_por_alvo.filter(
//     (r) => r.resultado === "OMISSÃO",
//   ).length;

//   const resumo = {
//     tempo_reacao_medio_ms: tr_medio,
//     tempo_reacao_desvio_padrao_ms: tr_desvio_padrao,
//     total_acertos: total_acertos,
//     total_comissao: total_comissao,
//     total_omissao: total_omissao,
//   };
//   resultados_participante.resumo_metricas = resumo;

//   // log de resumo: tirar depois da integração
//   console.debug(`\n--- resumo de métricas da fase 1 ---`);
//   console.debug(`total acertos: ${total_acertos}`);
//   console.debug(`total comissão: ${total_comissao}`);
//   console.debug(`total omissão: ${total_omissao}`);
//   console.debug(`tr médio: ${tr_medio}ms (dp: ${tr_desvio_padrao}ms)`);
//   console.debug(`------------------------\n`);

//   try {
//     // busca ou cria (upsert) um documento de análise para este client_id e salva o resultado completo
//     await ResultadoAnalise.findOneAndUpdate(
//       { client_id: client_id },
//       { $set: resultados_participante },
//       { upsert: true, new: true },
//     );
//     console.debug(
//       `Análise resumida da fase 1 salva/atualizada para ${client_id}`,
//     );
//   } catch (saveError) {
//     console.error(`Erro ao salvar a análise para ${client_id}:`, saveError);
//   }

//   return {
//     client_id: client_id,
//     tempo_reacao_medio_ms: tr_medio,
//     total_acertos: total_acertos,
//     total_comissao: total_comissao,
//     total_omissao: total_omissao,
//   };
// };

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
  salvarExperimentoFase1Redis,
};
