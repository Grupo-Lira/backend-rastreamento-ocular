import { arduinoEmitter, sendToArduino } from "../../arduino/config/serial.js";
import {
  getPlanetaNumero,
  iniciar_fase2,
  salvarExperimentoFase2,
} from "../service/fase2Service.js";

export function registrarFase2Handlers(socket) {
  socket.on("iniciar_fase2", async (config) => {
    console.log(`Cliente iniciou fase 2 com config:`, config);
    //TODO-VALIDAR-ALVOS-config.fase2
    //TODO-VALIDAR-USUARIO-config.usuarioId

    //TODO-SALVAR no banco
    const experimento = await salvarExperimentoFase2(config.usuarioId);
    socket.data.experimentoId = experimento._id.toString();
    socket.data.usuarioId = config.usuarioId;

    await iniciar_fase2(socket.data.experimentoId);
  });

  socket.on("aguardando_iot", () => {
    console.debug(
      `Front-end renderizou a pergunta dos planetas e está aguardando o IoT. Ligando LED.`,
    );

    // comando pro arduino ascender o led
    sendToArduino("LED_SELECAO_ON");
  });

  //INTERAÇÃO COM EVENTOS DO ARDUINO
  const arduinoListener = (data) => {
    if (data === "BUTTON_PRESSED") {
      //TODO-VALIDAR-SE-O-TRECHO-COMENTADO-PRECISA-CONTINUAR-AQUI
      //io.emit("arduino_button", { message: "BUTTON_PRESSED" });
    } else if (data.startsWith("PLANETA_")) {
      const planetaNumero = parseInt(data.replace("PLANETA_", ""));
      if (Number.isInteger(planetaNumero)) {
        console.debug(`Arduino -> ${planetaNumero}`);
        getPlanetaNumero(socket, planetaNumero, socket.data.experimentoId);
        // socket.emit("planeta_recebido", { numero: planetaNumero });
      }
    }
  };
  arduinoEmitter.on("data", arduinoListener);

  socket.on("disconnect", () => {
    arduinoEmitter.off("data", arduinoListener);
  });
}
