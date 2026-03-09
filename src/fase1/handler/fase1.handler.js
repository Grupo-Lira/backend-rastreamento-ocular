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

// chama todos os handlers criados em redisHandler e fase1Service
export function registrarFase1Handlers(socket) {
  socket.on("iniciar_fase1", async (config) => {
    console.log(`Cliente iniciou fase 1 com config:`, config);

    //TODO-VALIDAR-USUARIO-config.usuarioId
    //TODO-VALIDAR-ALVOS-config.fase1
    //TODO-BUSCAR-AS-PROPERTIES-DO-BANCO-E-SALVAR-EM-CACHE(REDIS)

    const experimento = await salvarExperimentoFase1(config.usuarioId); // ao iniciar, vai criar no mongo com campos vazios
    await salvarExperimentoFase1Redis(experimento._id, 1); // faz o mesmo no redis 
    await salvarAlvosFase1Redis(experimento._id, config.fase1); // cria o alvo no redis 

    socket.data.experimentoId = experimento._id.toString(); // serve pra chamar o id do experimento e do usuario com o front 
    socket.data.usuarioId = config.usuarioId;

    // ve o estado do experimento, ve a questao dos alvos e inicia a fase com a estrela brilhando, se ainda tiver alvo 
    const alvoFase1 = await iniciarDestaqueEstrela(experimento._id.toString());
    socket.emit("fase1_iniciada", {
      fase: 1,
      alvo: alvoFase1,
    });
  });

  // socket para recebimento dos dados do olhar e construção dos dados no mongo 
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


      const estado = await buscarExperimentoFase1Redis(socket.data.experimentoId,); // ve como está o estado do experimento 

      if (
        estado === null ||
        socket.data.experimentoId === undefined ||
        estado.alvoAtual === undefined ||
        isNaN(estado.alvoAtual) // ou nao for numero, para de processar os dados de olhar
      ) {
        return;
      }

      // busca o alvo atual
      const alvo = await buscarAlvoFase1Redis( socket.data.experimentoId, estado.alvoAtual,);
      //TODO-ADICIONAR-VALIDADOR PARA O ALVO RECEBIDO

      const estaFocando =
        x >= alvo.x_min &&
        x <= alvo.x_max &&
        y >= alvo.y_min &&
        y <= alvo.y_max;

      
      let tipoEvento = "INDETERMINADO"; 
      if (estaFocando) {
        if (estado.focoConsecutivo === 0) { // focoConsecutivo guarda qunatas vezes o usuario olhou pro alvo 
          console.debug(
            `Cliente ${usuarioId} começou a focar no alvo ${estado.alvoAtual} pela primeira vez.`,
          );
          tipoEvento = "FOCANDO";

          estado.inicioFocoTs = currDate;
          estado.focoConsecutivo += 1; // acumula a cada olhada 
          estado.ultimoFocoTs = currDate;
          estado.foraConsecutivo = 0;

          console.debug(
            `INICIANDO FOCO - Cliente ${usuarioId} - Fase 1 - FOCO INICIADO TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );
          // se a pessoa ficou 5s olhando pro alvo
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
            `FOCANDO - Cliente ${usuarioId} - Fase 1 - FOCANDO  TIMESTAMP: ${estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
          );

          tipoEvento = "FOCANDO";
          estado.focoConsecutivo += 1;
          estado.ultimoFocoTs = currDate;
        }
      } else {
        console.debug(
          `NÃO FOCOU - Cliente ${usuarioId} - Fase 1 - FOCO INICIADO TIMESTAMP: ${currDate - estado.inicioFocoTs}ms - Mínimo: ${DWELL_REQUIRED_MS}ms`,
        );

        if (estado.inicioFocoTs > 0) { // parou de olhar antes de 5s
          tipoEvento = "DESVIO_COMISSAO";

          estado.inicioFocoTs = 0;
          estado.focoConsecutivo = 0;
          estado.foraConsecutivo += 1; // acumula a cada olhada q for comissao 
        } else if (estado.foraConsecutivo === 4) { // nao viu o alvo  
          tipoEvento = "DESVIO_OMISSAO";
          estado.foraConsecutivo += 1; // acumula a cada olhada de omissao 
        } else {
          tipoEvento = "DESFOCANDO";
          estado.foraConsecutivo += 1;
        }
      }

      // quando acabar o alvo, salva o historico dele, pra quando acabar os alvos, salvar o historico deles no mongo
      await incluirDadoHistoricoFase1Redis(
        socket.data.experimentoId,
        alvo.id,
        currDate,
        estaFocando,
        { x, y },
        tipoEvento,
      );

      // ativado a cada mudanca de olhada, para atualizar o estado do experimento no redis, e quando tiver foco completo, finalizar o alvo e passar pro proximo
      await atualizarEstadoExperimentoFase1Redis( 
        socket.data.experimentoId,
        estado,
      );

      // finaliza o alvo e manda pro historico do mongo, e se tiver mais alvo, inicia o proximo
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

  // socket para receber a mensagem de tempo excedido, finalizar o alvo atual e desconectar o cliente, para evitar que ele continue enviando dados de olhar depois do tempo acabar
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
