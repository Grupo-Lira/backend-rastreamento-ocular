import { arduinoEmitter, sendToArduino } from "../../arduino/config/serial.js";
import { CONTROLE_ARDUINO, CONTROLE_MOUSE } from "../../utils/constantes.js";
import {
  getPlanetaNumero,
  iniciar_conexao_arduino_fase2,
  salvarExperimentoFase2,
} from "../service/fase2Service.js";

function registrarFase2ControleMouseHandlers(socket) {
  socket.on("aguardando_mouse", async () => {
    const usuarioId = socket.data?.usuarioId;
    const expId = socket.data.experimentoId;
    if (!expId) {
      console.error(
        `Não foi possível iniciar a fase 2 no aguardando_mouse para socket ${socket.id}: usuarioId ausente.`,
      );
      return;
    }

    console.debug(
      `Front-end renderizou a pergunta dos planetas e está aguardando o usuário selecionar planetas com o click do mouse.`,
    );
  });

  socket.on("click_planeta_selecionado", async (data) => {
    const planetaNumero = data?.planetaId;
    if (typeof planetaNumero !== "number") {
      console.error(
        `PlanetaId inválido recebido do front-end para socket ${socket.id}:`,
        planetaNumero,
      );
      return;
    }
    const expId = socket.data.experimentoId;
    if (!expId) {
      console.error(
        `Não foi possível processar a seleção de planeta no planeta_selecionado para socket ${socket.id}: experimentoId ausente.`,
      );
      return;
    }

    await getPlanetaNumero(socket, planetaNumero, expId);
  });
}

export function registrarFase2Handlers(socket) {

  const garantirExperimentoFase2 = async (usuarioIdFallback) => {
    if (socket.data.experimentoId) {
      return socket.data.experimentoId;
    }

    const usuarioId = socket.data?.usuarioId || usuarioIdFallback;
    if (!usuarioId) {
      return null;
    }

    const experimento = await salvarExperimentoFase2(usuarioId);
    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = usuarioId;

    await iniciar_conexao_arduino_fase2(socket.data.experimentoId);
    console.debug(
      `Experimento da fase 2 criado automaticamente para socket ${socket.id}.`,
    );

    return socket.data.experimentoId;
  };

  socket.on("iniciar_fase2", async (config) => {
    console.log(`Cliente iniciou fase 2 com config:`, config);

    const usuarioId = config?.usuarioId;
    const experimento = await salvarExperimentoFase2(usuarioId, config?.controleJogo || CONTROLE_MOUSE);
    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = usuarioId;
    if (config?.controleJogo) {
      socket.data.controleJogo = config.controleJogo;
      switch (config.controleJogo) {
        case CONTROLE_ARDUINO:
          console.debug(`Modo de jogo 1 selecionado para socket ${socket.id}.`);
          await iniciar_conexao_arduino_fase2(socket.data.experimentoId);
          break;
        case CONTROLE_MOUSE:
          console.debug(`Modo de jogo 2 selecionado para socket ${socket.id}.`);
          registrarFase2ControleMouseHandlers(socket);
          break;
        default:
          console.error(`Modo de jogo inválido selecionado para socket ${socket.id}: ${config.controleJogo}. Controle default será ${CONTROLE_MOUSE}`,
          );
          break;
      }

    }
  });

  socket.on("aguardando_iot", async () => {
    const usuarioId = socket.data?.usuarioId;
    const expId = socket.data?.experimentoId;
    if (!expId) {
      console.error(
        `Não foi possível iniciar a fase 2 no aguardando_iot para socket ${socket.id}: usuarioId ausente.`,
      );
      return;
    }

    console.debug(
      `Front-end renderizou a pergunta dos planetas e está aguardando o IoT. Ligando LED.`,
    );

    // comando pro arduino ascender o led
    sendToArduino("LED_SELECAO_ON");
  });

  //INTERAÇÃO COM EVENTOS DO ARDUINO
  const arduinoListener = (data) => {
    if (data === "BUTTON_PRESSED") {
    } else {
      const planetaMatch = data.match(/PLANETA_(\d+)/);
      if (!planetaMatch) {
        console.debug(`Arduino evento ignorado: ${data}`);
        return;
      }

      const planetaNumero = parseInt(planetaMatch[1], 10);
      if (Number.isInteger(planetaNumero)) {
        console.debug(`Arduino -> ${planetaNumero}`);
        if (!socket.data.experimentoId) {
          console.error(
            `Evento de planeta recebido sem experimento da fase 2 iniciado para socket ${socket.id}.`,
          );
          return;
        }

        await getPlanetaNumero(socket, planetaNumero, socket.data.experimentoId);
      }
    }
  };
  arduinoEmitter.on("data", arduinoListener);

  socket.on("disconnect", () => {
    arduinoEmitter.off("data", arduinoListener);
  });
}
