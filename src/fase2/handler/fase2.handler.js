import { arduinoEmitter, sendToArduino } from "../../arduino/config/serial.js";
import {
    getPlanetaNumero,
    iniciar_fase2,
    salvarExperimentoFase2,
} from "../service/fase2Service.js";

export function registrarFase2Handlers(socket) {
  const resolverUsuarioId = (valorPreferencial) => {
    return (
      valorPreferencial ||
      socket.data?.usuarioId ||
      socket.handshake?.auth?.usuarioId ||
      socket.handshake?.auth?.userId ||
      socket.handshake?.auth?.client_id ||
      socket.handshake?.query?.usuarioId ||
      socket.handshake?.query?.userId ||
      socket.handshake?.query?.client_id ||
      socket.id
    );
  };

  const garantirExperimentoFase2 = async (usuarioIdFallback) => {
    if (socket.data.experimentoId) {
      return socket.data.experimentoId;
    }

    const usuarioId = resolverUsuarioId(usuarioIdFallback);
    if (!usuarioId) {
      return null;
    }

    const experimento = await salvarExperimentoFase2(usuarioId);
    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = usuarioId;

    await iniciar_fase2(socket.data.experimentoId);
    console.debug(
      `Experimento da fase 2 criado automaticamente para socket ${socket.id}.`,
    );

    return socket.data.experimentoId;
  };

  socket.on("iniciar_fase2", async (config) => {
    console.log(`Cliente iniciou fase 2 com config:`, config);
    //TODO-VALIDAR-ALVOS-config.fase2
    //TODO-VALIDAR-USUARIO-config.usuarioId

    //TODO-SALVAR no banco
    const usuarioId = resolverUsuarioId(config?.usuarioId);
    const experimento = await salvarExperimentoFase2(usuarioId);
    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = usuarioId;

    await iniciar_fase2(socket.data.experimentoId);
  });

  socket.on("aguardando_iot", async (payload) => {
    const usuarioId = resolverUsuarioId(
      payload?.usuarioId || payload?.userId || payload?.client_id,
    );
    const expId = await garantirExperimentoFase2(usuarioId);
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
  const arduinoListener = async (data) => {
    if (data === "BUTTON_PRESSED") {
      //TODO-VALIDAR-SE-O-TRECHO-COMENTADO-PRECISA-CONTINUAR-AQUI
      //io.emit("arduino_button", { message: "BUTTON_PRESSED" });
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
          const expId = await garantirExperimentoFase2();
          if (!expId) {
            console.error(
              `Evento de planeta recebido sem experimento da fase 2 iniciado para socket ${socket.id}.`,
            );
            return;
          }
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
