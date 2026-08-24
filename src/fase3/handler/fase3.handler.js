import { DWELL_REQUIRED_MS_FASE_3 } from "../../database/redis/redisHandlers.js";
import {
  ALVOS_FASE3,
  MOTIVO_FOCO_COMPLETO,
  MOTIVO_TEMPO_ESGOTADO,
} from "../../utils/constantes.js";
import {
  atualizarEstadoExperimentoFase3Redis,
  buscarAlvoFase3Redis,
  buscarExperimentoFase3Redis,
  finalizarFase3,
  finalizarFocoAlvoFase3,
  incluirDadoHistoricoFase3Redis,
  iniciarDestaqueAlvo,
  pausarFase3Redis,
  registrarFinalizacaoAlvoSemAlternancia,
  registrarTrocaAlvoFase3,
  retomarFase3Redis,
  salvarAlvosFase3Redis,
  salvarExperimentoFase3,
  salvarExperimentoFase3Redis,
} from "../service/fase3Service.js";

const ALTERNANCIA_ALVO_MS = 6000; // 6 segundos

export function registrarFase3Handlers(socket) {
  // garante 1 único timer por cliente
  const limparTimerAlternancia = () => {
    if (socket.data.fase3Timer) {
      clearTimeout(socket.data.fase3Timer);
      socket.data.fase3Timer = null;
    }
    socket.data.fase3TimerDeadlineEm = null;
    socket.data.fase3TimerDelayMs = null;
  };

  const agendarProximaAlternancia = (delay = ALTERNANCIA_ALVO_MS) => {
    limparTimerAlternancia();
    socket.data.fase3TimerDelayMs = delay;
    socket.data.fase3TimerDeadlineEm = Date.now() + delay;
    socket.data.fase3Timer = setTimeout(async () => {
      try {
        const alternou = await alternarAlvoFase3("TIMER");
        if (alternou) {
          agendarProximaAlternancia();
        }
      } catch (err) {
        console.error("Erro ao alternar alvo da fase 3 por timer:", err);
      }
    }, delay);
  };

  const pausarAlternanciaFase3 = async () => {
    if (!socket.data.experimentoId) {
      return null;
    }

    const estado = await buscarExperimentoFase3Redis(socket.data.experimentoId);

    if (!estado || estado.pausado) {
      return estado;
    }

    const agora = Date.now();
    const deadline = socket.data.fase3TimerDeadlineEm ?? agora;
    //timerRestanteMs é igual a Deadline(Data em que alvos iriam alternar, em milissegundos) - Agora(Data de Agora em Milissegundos).
    const timerRestanteMs = Math.max(0, deadline - agora);

    limparTimerAlternancia();
    await pausarFase3Redis(socket.data.experimentoId, {
      timerRestanteMs,
      pausaIniciadaEm: agora,
    });

    socket.data.fase3Pausada = true;
    socket.data.fase3TimerRestanteMs = timerRestanteMs;
    socket.data.fase3TimerDeadlineEm = null;
    socket.data.fase3TimerDelayMs = null

    return { ...estado, pausado: 1, timerRestanteMs };
  };

  const retomarAlternanciaFase3 = async () => {
    if (!socket.data.experimentoId || !socket.data.fase3Pronta) {
      return null;
    }

    const estado = await buscarExperimentoFase3Redis(socket.data.experimentoId);

    if (!estado || !estado.pausado) {
      return estado;
    }

    const timerRestanteMs =
      socket.data.fase3TimerRestanteMs ?? estado.timerRestanteMs ?? ALTERNANCIA_ALVO_MS;

    await retomarFase3Redis(socket.data.experimentoId, {
      timerRestanteMs: 0,
      pausaIniciadaEm: 0,
    });

    socket.data.fase3Pausada = false;
    socket.data.fase3TimerRestanteMs = null;

    if (timerRestanteMs > 0) {
      agendarProximaAlternancia(timerRestanteMs);
    } else {
      agendarProximaAlternancia();
    }


    return { ...estado, pausado: 0, timerRestanteMs: 0 };
  };

  // muda o alvo quando der o tempo, ou quando o cliente pedir, e registra a troca no histórico do experimento
  const alternarAlvoFase3 = async (motivo = "TIMER") => {
    if (!socket.data.fase3Pronta || socket.data.fase3Encerrada) {      return false;
    }

    const expId = socket.data.experimentoId;
    const estado = await buscarExperimentoFase3Redis(expId);

    if (!estado || estado.pausado) {
      return false;
    }
    const indiceAtual = ALVOS_FASE3.indexOf(estado.nomeAlvoAtual);
    const alvoAnterior = estado.nomeAlvoAtual;
    const proximoIndice = (indiceAtual + 1) % ALVOS_FASE3.length;
    const proximoNomeAlvo = ALVOS_FASE3[proximoIndice];
    const currDate = Date.now();

    // se alvo foi finalizado (acerto), grava o resultado com motivo de FOCO_COMPLETO
    if (estado.finalizado) {
      await registrarFinalizacaoAlvoSemAlternancia(
        expId,
        estado,
        MOTIVO_FOCO_COMPLETO,
        currDate,
      );
    } else {
      await registrarTrocaAlvoFase3(expId, estado, currDate);
    }

    estado.nomeAlvoAtual = proximoNomeAlvo;
    estado.focoConsecutivo = 0;
    estado.foraConsecutivo = 0;
    estado.inicioFocoTs = 0;
    estado.ultimoFocoTs = 0;
    estado.timestampInicio = currDate;
    estado.finalizado = 0;

    await atualizarEstadoExperimentoFase3Redis(expId, estado);

    const proximoAlvo = await buscarAlvoFase3Redis(expId, proximoNomeAlvo);
    socket.data.fase3AlvoAtual = proximoAlvo?.nome ?? proximoNomeAlvo;
    socket.emit("brilhar_alvo_fase3", {
      fase: 3,
      alvo: proximoAlvo?.nome ?? proximoNomeAlvo,
    });

    return true;
  };

  socket.on("iniciar_fase3", async (config) => {
    console.log(`Cliente iniciou fase 3 com config:`, config);

    limparTimerAlternancia();
    socket.data.fase3Pronta = false;
    socket.data.fase3Encerrada = false;
    socket.data.fase3Pausada = false;
    socket.data.fase3TimerRestanteMs = null;

    const experimento = await salvarExperimentoFase3(config.usuarioId); // ao iniciar, vai criar no mongo com campos vazios
    const expId = experimento._id.toString();

    const alvoInicial = String(config?.alvoInicialNome).toUpperCase();

    // define o contexto do socket para evitar usar experimento antigo
    socket.data.experimentoId = expId;
    socket.data.usuarioId = config.usuarioId;

    console.log(`Experimento de fase 3 ${config.fase3}}. Iniciando alvos...`);
    await salvarExperimentoFase3Redis(expId, alvoInicial); // faz o mesmo no redis
    await salvarAlvosFase3Redis(expId, config.fase3); // cria os alvos no redis

    const alvoFase3 = await iniciarDestaqueAlvo(expId);
    socket.data.fase3AlvoAtual = alvoFase3?.nome ?? alvoInicial;
    socket.data.fase3Pronta = true;

    socket.emit("fase3_iniciada", {
      fase: 3,
      alvo: alvoFase3.nome,
    });

    // agenda alternância relativa ao início do alvo atual
    agendarProximaAlternancia();
  });

  socket.on("fase_3_pause", async () => {
    try {
      await pausarAlternanciaFase3();
    } catch (err) {
      console.error("Erro ao pausar fase 3:", err);
    }
  });

  socket.on("fase_3_resume", async () => {
    try {
      await retomarAlternanciaFase3();
    } catch (err) {
      console.error("Erro ao retomar fase 3:", err);
    }
  });

  socket.on("alternar_alvo_fase3", async () => {
    try {
      const alternou = await alternarAlvoFase3("CLIENTE");
      if (alternou) {
        // ao alternar manualmente reinicia período de 15s
        agendarProximaAlternancia();
      }
    } catch (err) {
      console.error("Erro ao alternar alvo da fase 3:", err);
    }
  });

  socket.on("gaze_data_fase3", async (data) => {
    const currDate = Date.now();

    console.debug(
      `Gaze data recebido do cliente ${socket.data.usuarioId}:`,
      data,
    );
    const usuarioId = socket.data.usuarioId;

    try {
      if (!socket.data.fase3Pronta || socket.data.fase3Encerrada) {
        return;
      }

      if (!socket.data.experimentoId) {
        return;
      }

      const estadoInicial = await buscarExperimentoFase3Redis(
        socket.data.experimentoId,
      );

      if (estadoInicial?.pausado) {
        return;
      }

      const x = data?.x ?? 0;
      const y = data?.y ?? 0;

      const estado = estadoInicial;

      if (
        estado === null ||
        socket.data.experimentoId === undefined ||
        !estado.nomeAlvoAtual
      ) {
        return;
      }

      // busca o alvo atual que tá brilhando pra comparar com os dados de olhar
      const nomeAlvoAtivo = estado.nomeAlvoAtual;
      const alvo = await buscarAlvoFase3Redis(
        socket.data.experimentoId,
        nomeAlvoAtivo,
      );
      if (!alvo) return;

      const alvoExibido = alvo?.nome;
      console.log(`alvo exibido: ${alvoExibido} | x: ${x} | y: ${y}`);

      const larguraTela = Number.isFinite(Number(data?.larguraTela))
        ? Number(data?.larguraTela)
        : undefined;

      const estaFocando =
        x >= alvo.x_min &&
        x <= alvo.x_max &&
        y >= alvo.y_min &&
        y <= alvo.y_max;

      let tipoEvento = "INDETERMINADO";
      if (estaFocando) {
        if (estado.focoConsecutivo === 0) {
          // focoConsecutivo guarda qunatas vezes o usuario olhou pro alvo
          console.debug(
            `Cliente ${usuarioId} começou a focar no alvo ${estado.nomeAlvoAtual} pela primeira vez.`,
          );
          tipoEvento = "FOCANDO";

          estado.inicioFocoTs = currDate;
          estado.focoConsecutivo += 1; // acumula a cada olhada
          estado.ultimoFocoTs = currDate;
          estado.foraConsecutivo = 0;

          console.debug(
            `INICIANDO FOCO - Cliente ${usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO INICIADO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS_FASE_3}ms`,
          );
          // se a pessoa ficou 5s olhando pro alvo
        } else if (
          estado.ultimoFocoTs - estado.inicioFocoTs >=
          DWELL_REQUIRED_MS_FASE_3
        ) {
          console.debug(
            `FOCO COMPLETO - Cliente ${usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO FINALIZADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS_FASE_3}ms`,
          );

          tipoEvento = "FOCO_FINALIZADO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        } else {
          console.debug(
            `FOCANDO - Cliente ${usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCANDO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS_FASE_3}ms`,
          );

          tipoEvento = "FOCANDO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        }
      } else {
        const tempoDecorridoFocoMs =
          estado.inicioFocoTs > 0 ? currDate - estado.inicioFocoTs : 0;

        console.debug(
          `NÃO FOCOU - Cliente ${usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO INICIADO TIMESTAMP: ${tempoDecorridoFocoMs}ms - Mínimo: ${DWELL_REQUIRED_MS_FASE_3}ms`,
        );

        if (estado.inicioFocoTs > 0) {
          // parou de olhar antes de 5s
          tipoEvento = "DESVIO_COMISSAO";

          estado.inicioFocoTs = 0;
          estado.focoConsecutivo = 0;
          estado.foraConsecutivo += 1; // acumula a cada olhada q for comissao
        } else if (estado.foraConsecutivo === 4) {
          // nao viu o alvo
          tipoEvento = "DESVIO_OMISSAO";
          estado.foraConsecutivo += 1; // acumula a cada olhada de omissao
        } else {
          tipoEvento = "DESFOCANDO";
          estado.foraConsecutivo += 1;
        }
      }

      await incluirDadoHistoricoFase3Redis(
        socket.data.experimentoId,
        alvo,
        currDate,
        estaFocando,
        { x, y },
        tipoEvento,
        larguraTela,
      );

      await atualizarEstadoExperimentoFase3Redis(
        socket.data.experimentoId,
        estado,
      );

      if (tipoEvento === "FOCO_FINALIZADO") {
        // marca que alvo foi acertado; a gravação ocorre quando o alvo terminar (timer)
        estado.finalizado = 1;
        estado.resultadoAlvo = "ACERTO";
        await atualizarEstadoExperimentoFase3Redis(
          socket.data.experimentoId,
          estado,
        );
      }
    } catch (err) {
      console.error("Erro ao processar dados de gaze da fase 3:", err);
    }
  });

  //Fase 3 só acaba por tempo "excedido", ou seja, o contador chegou ao fim (0).
  socket.on("fase_3_tempo_excedido", async () => {
    if (
      socket.data.fase3Encerrada ||
      !socket.data.experimentoId) {
      return;
    }

    socket.data.fase3Encerrada = true;
    limparTimerAlternancia();
    const currDate = Date.now();

    const estado = await buscarExperimentoFase3Redis(socket.data.experimentoId);

    await finalizarFocoAlvoFase3(
      socket.data.experimentoId,
      estado,
      MOTIVO_TEMPO_ESGOTADO,
      currDate,
      socket,
    );

    socket.disconnect();
  });

  socket.on("disconnect", async () => {
    try {
      limparTimerAlternancia();
      await finalizarFase3(socket.data.experimentoId);
    } catch (err) {
      console.error("Erro ao limpar fase 3 no disconnect:", err);
    }
  });
}
