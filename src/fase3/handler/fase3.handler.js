import { DWELL_REQUIRED_MS } from "../../database/redis/redisHandlers.js";
import {
  ALVO,
  MOTIVO_FOCO_COMPLETO,
  MOTIVO_TEMPO_ESGOTADO
} from "../../utils/constantes.js";
import {
  atualizarEstadoExperimentoFase3Redis,
  buscarAlvoFase3Redis,
  buscarExperimentoFase3Redis,
  finalizarFase3,
  finalizarFocoAlvoFase3,
  incluirDadoHistoricoFase3Redis,
  iniciarDestaqueAlvo,
  salvarAlvosFase3Redis,
  salvarExperimentoFase3,
  salvarExperimentoFase3Redis,
} from "../service/fase3Service.js";

export function registrarFase3Handlers(socket) {
  socket.on("iniciar_fase3", async (config) => {
    console.log(`Cliente iniciou fase 3 com config:`, config);

    //TODO-VALIDAR-USUARIO-config.usuarioId
    //TODO-VALIDAR-ALVOS-config.fase1
    //TODO-BUSCAR-AS-PROPERTIES-DO-BANCO-E-SALVAR-EM-CACHE(REDIS)

    const experimento = await salvarExperimentoFase3(config.usuarioId); // ao iniciar, vai criar no mongo com campos vazios
    const expId = experimento._id.toString();

    const alvoInicial = String(config?.alvoInicialNome).toUpperCase();

    await salvarExperimentoFase3Redis(expId, alvoInicial); // faz o mesmo no redis
    await salvarAlvosFase3Redis(expId, config.fase3); // cria os alvos no redis

    socket.data.experimentoId = experimento._id.toString(); // serve pra chamar o id do experimento e do usuario com o front
    socket.data.usuarioId = config.usuarioId;

    const alvoFase3 = await iniciarDestaqueAlvo(expId);
    socket.emit("fase3_iniciada", {
      fase: 3,
      alvo: alvoFase3.nome,
    });
  });

  socket.on("gaze_data_fase3", async (data) => {
    const currDate = Date.now();

    console.debug(
      `Gaze data recebido do cliente ${socket.data.usuarioId}:`,
      data.x,
      data.y,
      `Timestamp: ${data.timestamp}`,
    );

    try {
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
            `Cliente ${socket.data.usuarioId} começou a focar no alvo ${estado.nomeAlvoAtual} pela primeira vez.`,
          );
          tipoEvento = "FOCANDO";

          estado.inicioFocoTs = currDate;
          estado.focoConsecutivo += 1; // acumula a cada olhada
          estado.ultimoFocoTs = currDate;
          estado.foraConsecutivo = 0;

          console.debug(
            `INICIANDO FOCO - Cliente ${socket.data.usuarioId} - Fase 3 - FOCO INICIADO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );
          // se a pessoa ficou 5s olhando pro alvo
        } else if (
          estado.ultimoFocoTs - estado.inicioFocoTs >=
          DWELL_REQUIRED_MS
        ) {
          console.debug(
            `FOCO COMPLETO - Cliente ${socket.data.usuarioId} - Fase 3 - FOCO FINALIZADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCO_FINALIZADO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        } else {
          console.debug(
            `FOCANDO - Cliente ${socket.data.usuarioId} - Fase 3 - FOCANDO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCANDO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        }
      } else {
        console.debug(
          `NÃO FOCOU - Cliente ${socket.data.usuarioId} - Fase 3 - FOCO INICIADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
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
        await finalizarFocoAlvoFase3(
          socket.data.experimentoId,
          estado,
          MOTIVO_FOCO_COMPLETO,
          currDate,
          socket,
        );
      }
    } catch (err) {
      console.error("Erro ao processar dados de gaze da fase 3:", err);
    }
  });

  socket.on("fase_3_tempo_excedido", async () => {
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
      await finalizarFase3(socket.data.experimentoId);
    } catch (err) {
      console.error("Erro ao limpar fase 3 no disconnect:", err);
    }
  });
}
