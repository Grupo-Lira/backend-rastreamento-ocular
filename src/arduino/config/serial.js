import EventEmitter from "events";
import { ReadlineParser, SerialPort } from "serialport";

const SERIAL_PORT = "COM13"; // ajuste conforme necessário
const SERIAL_BAUD_RATE = 9600;
const ARDUINO_ENABLED = String(process.env.ARDUINO_ENABLED ?? "true").toLowerCase() === "true";

let serialPort = null;
let parser = null;
const arduinoEmitter = new EventEmitter();

function initArduino() {
  if (ARDUINO_ENABLED === false) {
    console.info("Arduino desativado via ARDUINO_ENABLED=false.");
    return;
  }

  if (serialPort) {
    console.debug("Serial já inicializada.");
    return;
  }

  try {
    serialPort = new SerialPort({
      path: SERIAL_PORT,
      baudRate: SERIAL_BAUD_RATE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Falha ao inicializar a serial: ${message}`);
    serialPort = null;
    parser = null;
    return;
  }

  parser = serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

  serialPort.on("open", () => {
    console.debug(`Serial aberto em ${SERIAL_PORT} @ ${SERIAL_BAUD_RATE}`);
  });

  serialPort.on("error", (err) => {
    console.error("Erro na serial:", err.message);
  });

  parser.on("data", (raw) => {
    const data = raw.trim();
    console.debug(`Arduino -> ${data}`);

    //TODO-VALIDAR-SE-O-TRECHO-COMENTADO-PRECISA-CONTINUAR-AQUI
    //io.emit("arduino_event", { raw: data });
    // if (data === "BUTTON_PRESSED") {
    //   io.emit("arduino_button", { message: "BUTTON_PRESSED" });
    // }
    arduinoEmitter.emit("data", data);
  });
}

function sendToArduino(message) {
  if (ARDUINO_ENABLED === false) {
    console.debug(`Arduino desativado. Mensagem ignorada: ${message}`);
    return;
  }

  if (!serialPort) {
    console.error("Serial não inicializada.");
    return;
  }

  serialPort.write(message + "\n", (err) => {
    if (err) {
      console.error("Erro ao escrever na serial:", err.message);
    } else {
      console.debug(`IoT <- ${message}`);
    }
  });
}

function closeArduino() {
  if (serialPort) {
    serialPort.close();
    serialPort = null;
    parser = null;
    console.debug("Serial encerrada.");
  }
}

export { arduinoEmitter, closeArduino, initArduino, sendToArduino };
