import EventEmitter from "events";
import { ReadlineParser, SerialPort } from "serialport";

const SERIAL_PORT = "COM4"; // ajuste conforme necessário
const SERIAL_BAUD_RATE = 9600;

let serialPort = null;
let parser = null;
const arduinoEmitter = new EventEmitter();

function initArduino() {
  if (serialPort?.isOpen) {
    console.debug("Serial já inicializada.");
    return;
  }

  serialPort = new SerialPort({
    path: SERIAL_PORT,
    baudRate: SERIAL_BAUD_RATE,
  });

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
  if (!serialPort) {
    initArduino();
  }

  if (!serialPort || typeof serialPort.write !== "function") {
    console.error("Serial não inicializada.");
    return;
  }

  const writeMessage = () =>
    serialPort.write(message + "\n", (err) => {
      if (err) {
        console.error("Erro ao escrever na serial:", err.message);
      } else {
        console.debug(`IoT <- ${message}`);
      }
    });

  if (!serialPort.isOpen) {
    console.debug("Serial ainda abrindo. Mensagem será enviada ao abrir a porta.");
    serialPort.once("open", writeMessage);
    return;
  }

  writeMessage();
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

