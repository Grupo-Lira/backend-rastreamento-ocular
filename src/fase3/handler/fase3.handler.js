import { DWELL_REQUIRED_MS } from "../../database/redis/redisHandlers.js";
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
  registrarTrocaAlvoFase3,
  salvarAlvosFase3Redis,
  salvarExperimentoFase3,
  salvarExperimentoFase3Redis,
} from "../service/fase3Service.js";

const ALTERNANCIA_ALVO_MS = 15000;

export function registrarFase3Handlers(socket) {
  // garante 1 único timer por cliente
  const limparTimerAlternancia = () => {
    if (socket.data.fase3Timer) {
      clearInterval(socket.data.fase3Timer);
      socket.data.fase3Timer = null;
    }
  };

  // muda o alvo quando der o tempo de 15s, ou quando o cliente pedir, e registra a troca no histórico do experimento
  const alternarAlvoFase3 = async (motivo = "TIMER") => {
    if (!socket.data.fase3Pronta || socket.data.fase3Encerrada) {
      return;
    }

    const expId = socket.data.experimentoId;
    const estado = await buscarExperimentoFase3Redis(expId);
    const indiceAtual = ALVOS_FASE3.indexOf(estado.nomeAlvoAtual);
    const alvoAnterior = estado.nomeAlvoAtual;
    const proximoIndice = (indiceAtual + 1) % ALVOS_FASE3.length;
    const proximoNomeAlvo = ALVOS_FASE3[proximoIndice];
    const currDate = Date.now();

    await registrarTrocaAlvoFase3(expId, estado, currDate);

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

    console.log(
      [
        "\n================= FASE 3 | ALTERNANCIA DE ALVO =================",
        `Cliente: ${socket.data.usuarioId} | ExpId: ${expId}`,
        `Motivo: ${motivo} | Horario: ${new Date(currDate).toISOString()}`,
        `Alvo: ${alvoAnterior} -> ${proximoNomeAlvo}`,
        "=================================================================",
      ].join("\n"),
    );
  };

  socket.on("iniciar_fase3", async (config) => {
    console.log(`Cliente iniciou fase 3 com config:`, config);

    limparTimerAlternancia();
    socket.data.fase3Pronta = false;
    socket.data.fase3Encerrada = false;

    //TODO-VALIDAR-USUARIO-config.usuarioId
    //TODO-VALIDAR-ALVOS-config.fase1
    //TODO-BUSCAR-AS-PROPERTIES-DO-BANCO-E-SALVAR-EM-CACHE(REDIS)

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
    socket.data.fase3Pronta = true;

    socket.emit("fase3_iniciada", {
      fase: 3,
      alvo: alvoFase3.nome,
    });

    socket.data.fase3Timer = setInterval(async () => {
      try {
        await alternarAlvoFase3("TIMER");
      } catch (err) {
        console.error("Erro ao alternar alvo da fase 3 por timer:", err);
      }
    }, ALTERNANCIA_ALVO_MS);
  });

  socket.on("alternar_alvo_fase3", async () => {
    try {
      await alternarAlvoFase3("CLIENTE");
    } catch (err) {
      console.error("Erro ao alternar alvo da fase 3:", err);
    }
  });

  socket.on("gaze_data_fase3", async (data) => {
    const currDate = Date.now();

    // console.debug(
    //   `Gaze data recebido do cliente ${socket.data.usuarioId}:`,
    //   data.x,
    //   data.y,
    //   `Timestamp: ${data.timestamp}`,
    // );
    console.debug(
      `Gaze data recebido do cliente ${socket.data.usuarioId}:`,
      data,
    );
    try {
      if (!socket.data.fase3Pronta || socket.data.fase3Encerrada) {
        return;
      }

      const x = data?.x ?? 0;
      const y = data?.y ?? 0;

      const estado = await buscarExperimentoFase3Redis(
        socket.data.experimentoId,
      );

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

      console.log(
        alvo.x_min,
        alvo.x_max,
        alvo.y_min,
        alvo.y_max,
        `x = ${x} | y = ${y} | Focando: ${estaFocando}`,
      );

      let tipoEvento = "INDETERMINADO";
      if (estaFocando) {
        if (estado.focoConsecutivo === 0) {
          // focoConsecutivo guarda qunatas vezes o usuario olhou pro alvo
          console.debug(
            `Cliente ${socket.data.usuarioId} começou a focar no alvo ${estado.nomeAlvoAtual} pela primeira vez.`,
          );
          tipoEvento = "FOCANDO";

          estado.inicioFocoTs = currDate;
          estado.focoConsecutivo += 1; // acumula a cada olhada
          estado.ultimoFocoTs = currDate;
          estado.foraConsecutivo = 0;

          console.debug(
            `INICIANDO FOCO - Cliente ${socket.data.usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO INICIADO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );
          // se a pessoa ficou 5s olhando pro alvo
        } else if (
          estado.ultimoFocoTs - estado.inicioFocoTs >=
          DWELL_REQUIRED_MS
        ) {
          console.debug(
            `FOCO COMPLETO - Cliente ${socket.data.usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO FINALIZADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCO_FINALIZADO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        } else {
          console.debug(
            `FOCANDO - Cliente ${socket.data.usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCANDO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCANDO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        }
      } else {
        const tempoDecorridoFocoMs =
          estado.inicioFocoTs > 0 ? currDate - estado.inicioFocoTs : 0;

        console.debug(
          `NÃO FOCOU - Cliente ${socket.data.usuarioId} - Fase 3 - Alvo: ${alvoExibido} - FOCO INICIADO TIMESTAMP: ${tempoDecorridoFocoMs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
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
        const resultadoFinalizacao = await finalizarFocoAlvoFase3(
          socket.data.experimentoId,
          estado,
          MOTIVO_FOCO_COMPLETO,
          currDate,
          socket,
        );

        if (resultadoFinalizacao?.faseConcluida) {
          socket.data.fase3Encerrada = true;
          limparTimerAlternancia();
        }
      }
    } catch (err) {
      console.error("Erro ao processar dados de gaze da fase 3:", err);
    }
  });

  socket.on("fase_3_tempo_excedido", async () => {
    if (socket.data.fase3Encerrada) {
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
