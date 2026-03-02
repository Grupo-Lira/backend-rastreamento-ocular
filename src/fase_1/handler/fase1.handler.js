import { DWELL_REQUIRED_MS } from "../../database/redis/redisHandlers.js";
import {
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
} from "../service/fase1Service.js";

import {
  MOTIVO_FOCO_COMPLETO,
  MOTIVO_TEMPO_ESGOTADO,
} from "../../utils/constantes.js";

export function registrarFase1Handlers(socket) {
  socket.on("iniciar_fase1", async (config) => {
    console.log(`Cliente iniciou fase 1 com config:`, config);

    //TODO-VALIDAR-USUARIO-config.usuarioId
    //TODO-VALIDAR-ALVOS-config.fase1
    //TODO-BUSCAR-AS-PROPERTIES-DO-BANCO-E-SALVAR-EM-CACHE(REDIS)

    const experimento = await salvarExperimentoFase1(config.usuarioId);
    await salvarExperimentoFase1Redis(experimento._id, 1);
    await salvarAlvosFase1Redis(experimento._id, config.fase1);

    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = config.usuarioId;

    const alvoFase1 = await iniciarDestaqueEstrela(experimento._id.toString());
    socket.emit("fase1_iniciada", {
      fase: 1,
      alvo: alvoFase1,
    });
  });

  socket.on("gaze_data_fase1", async (data) => {
    const currDate = Date.now();

    console.debug(
      `Gaze data recebido do cliente ${socket.data.usuarioId}:`,
      data.x,
      data.y,
      `Timestamp: ${data.timestamp}`,
    );
    const usuarioId = socket.data.usuarioId;

    try {
      const x = data?.x ?? 0;
      const y = data?.y ?? 0;

      const estado = await buscarExperimentoFase1Redis(
        socket.data.experimentoId,
      );

      if (
        estado === null ||
        socket.data.experimentoId === undefined ||
        estado.alvoAtual === undefined ||
        isNaN(estado.alvoAtual)
      ) {
        return;
      }

      const alvo = await buscarAlvoFase1Redis(
        socket.data.experimentoId,
        estado.alvoAtual,
      );
      //TODO-ADICIONAR-VALIDADOR PARA O ALVO RECEBIDO

      const estaFocando =
        x >= alvo.x_min &&
        x <= alvo.x_max &&
        y >= alvo.y_min &&
        y <= alvo.y_max;

      let tipoEvento = "INDETERMINADO";
      if (estaFocando) {
        if (estado.focoConsecutivo === 0) {
          console.debug(
            `Cliente ${usuarioId} começou a focar no alvo ${estado.alvoAtual} pela primeira vez.`,
          );
          tipoEvento = "FOCANDO";

          estado.inicioFocoTs = currDate;
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
          estado.foraConsecutivo = 0;

          console.debug(
            `INICIANDO FOCO - Cliente ${usuarioId} - Fase 1 - FOCO INICIADO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );
        } else if (
          estado.ultimoFocoTs - estado.inicioFocoTs >=
          DWELL_REQUIRED_MS
        ) {
          console.debug(
            `FOCO COMPLETO - Cliente ${usuarioId} - Fase 1 - FOCO FINALIZADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCO_FINALIZADO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        } else {
          console.debug(
            `FOCANDO - Cliente ${usuarioId} - Fase 1 - FOCando TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCANDO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        }

        await atualizarEstadoExperimentoFase1Redis(
          socket.data.experimentoId,
          estado,
        );
      } else {
        console.debug(
          `NÃO FOCOU - Cliente ${usuarioId} - Fase 1 - FOCO INICIADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
        );

        if (estado.inicioFocoTs !== null) {
          tipoEvento = "DESVIO_COMISSAO";

          estado.inicioFocoTs = null;
          estado.focoConsecutivo = 0;
          estado.foraConsecutivo += 1;
        } else if (estado.foraConsecutivo === 4) {
          tipoEvento = "DESVIO_OMISSAO";
          estado.foraConsecutivo += 1;
        } else {
          tipoEvento = "DESFOCANDO";
          estado.foraConsecutivo += 1;
        }
      }

      await incluirDadoHistoricoFase1Redis(
        socket.data.experimentoId,
        alvo.id,
        currDate,
        estaFocando,
        { x, y },
        tipoEvento,
      );

      await atualizarEstadoExperimentoFase1Redis(
        socket.data.experimentoId,
        estado,
      );

      if (tipoEvento === "FOCO_FINALIZADO") {
        await finalizarFocoAlvo(
          socket.data.experimentoId,
          estado,
          MOTIVO_FOCO_COMPLETO,
          currDate,
          socket,
        );
      }

      return;
    } catch (err) {
      console.error("Erro ao processar dados de gaze da fase 1:", err);
    }
  });

  socket.on("fase_1_tempo_excedido", async (data) => {
    const currDate = Date.now();

    const estado = await buscarExperimentoFase1Redis(socket.data.experimentoId);
    await finalizarFocoAlvo(
      socket.data.experimentoId,
      estado,
      MOTIVO_TEMPO_ESGOTADO,
      currDate,
      socket,
    );

    socket.disconnect();
  });

  socket.on("disconnect", async () => {
    await finalizarFase1(socket.data.experimentoId);
  });
}
