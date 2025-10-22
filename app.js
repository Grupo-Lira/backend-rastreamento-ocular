// server-integrado.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { SerialPort, ReadlineParser } from "serialport"; // mantenha conforme sua versão do pacote

// --- CONFIGURAÇÕES GLOBAIS HTTP/WS ---
const port = 4000;
const host = "localhost";

const tempo_minimo_foco = 5000;
const tempo_maximo_alvo = 10000;

const estados_clientes = new Map();

// --- CONFIGURAÇÕES SERIAL / ARDUINO ---
const SERIAL_PORT = "COM13"; // ajuste conforme necessário
const SERIAL_BAUD_RATE = 9600;

const serialPort = new SerialPort({
  path: SERIAL_PORT,
  baudRate: SERIAL_BAUD_RATE,
});

const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

serialPort.on("open", () => {
  console.log(`Serial aberto em ${SERIAL_PORT} @ ${SERIAL_BAUD_RATE}`);
});

parser.on("data", (raw) => {
  const data = raw.trim();
  console.log(`Arduino -> ${data}`);

  io.emit("arduino_event", { raw: data });
  if (data === "BUTTON_PRESSED") {
    io.emit("arduino_button", { message: "BUTTON_PRESSED" });
  }
});

// --- FUNÇÕES AUXILIARES ---
const calcular_desvio_padrao = (tempos) => {
  if (tempos.length === 0) return { media: 0, desvioPadrao: 0 };
  const soma = tempos.reduce((acc, val) => acc + val, 0);
  const media = soma / tempos.length;
  const variancia = tempos.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / tempos.length;
  const desvioPadrao = Math.sqrt(variancia);
  return { media: parseFloat(media.toFixed(2)), desvioPadrao: parseFloat(desvioPadrao.toFixed(2)) };
};

// --- SERVIDOR EXPRESS + SOCKET.IO ---
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`novo cliente conectado. id: ${socket.id}`);

  const estado_inicial = {
    fase_atual: 0,
    config_alvos: [],
    foco_iniciado_timestamp: null,
    foco_concluido_nesta_fase: false,
    tempo_inicio_fase: null,
    timer_fase: null,
    indice_alvo_atual: 0,
    tempo_primeiro_foco: null,
    tempos_primeiro_foco_registrados: [],
    erros_omissao: 0,
    erros_desvio_foco: 0,
  };
  estados_clientes.set(socket.id, estado_inicial);

  // --- FASE 1 ---
  const iniciar_fase1 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;
    const config_fase1 = estado.config_alvos;
    const alvo_atual = config_fase1[estado.indice_alvo_atual];

    if (!alvo_atual) {
      estado.fase_atual = 3;
      socket.emit("experimento_concluido", {
        mensagem: "Fase 1 (Atenção Sustentada) concluída. Experimento finalizado.",
        total_alvos: config_fase1.length,
        total_erros_omissao: estado.erros_omissao,
        total_erros_desvio_foco: estado.erros_desvio_foco,
        metricas: calcular_desvio_padrao(estado.tempos_primeiro_foco_registrados),
      });
      return;
    }

    if (estado.timer_fase) clearTimeout(estado.timer_fase);
    estado.foco_iniciado_timestamp = null;
    estado.foco_concluido_nesta_fase = false;
    estado.tempo_inicio_fase = Date.now();
    estado.tempo_primeiro_foco = null;

    estado.timer_fase = setTimeout(() => {
      estado.erros_omissao++;
      console.log(`omissão no alvo ${estado.indice_alvo_atual + 1}. cliente: ${socket.id}`);
      finalizar_alvo_fase1(false);
    }, tempo_maximo_alvo);

    socket.emit("fase_iniciada", {
      fase: 1,
      alvo: alvo_atual,
      mensagem: `fase 1 (sustentada). alvo ${estado.indice_alvo_atual + 1} de ${config_fase1.length}. foque por ${tempo_minimo_foco / 1000}s.`,
    });
    console.log(`>>> alvo ${estado.indice_alvo_atual + 1} iniciado. cliente: ${socket.id}`);
  };

  const finalizar_alvo_fase1 = (termino_por_sucesso = false) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 1) return;
    if (estado.timer_fase) clearTimeout(estado.timer_fase);

    if (estado.tempo_primeiro_foco !== null) {
      estado.tempos_primeiro_foco_registrados.push(estado.tempo_primeiro_foco);
    }

    const metricas_variabilidade = calcular_desvio_padrao(estado.tempos_primeiro_foco_registrados);

    socket.emit("fase_atual_finalizada", {
      fase: 1,
      alvo_concluido: estado.indice_alvo_atual + 1,
      sucesso: termino_por_sucesso,
      tempo_primeiro_foco: estado.tempo_primeiro_foco,
      media_tempo_foco_acumulada: metricas_variabilidade.media,
      total_erros_omissao: estado.erros_omissao,
      total_erros_desvio_foco: estado.erros_desvio_foco,
    });

    estado.indice_alvo_atual++;
    iniciar_fase1();
  };

  socket.on("iniciar_experimento_com_config", (config) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 0) return;
    if (!Array.isArray(config) || config.length === 0) return;
    estado.config_alvos = config;
    estado.fase_atual = 1;
    console.log(`Configurações recebidas, iniciando fase 1. Total de alvos: ${config.length}. cliente: ${socket.id}`);
    iniciar_fase1();
  });

  socket.on("gaze_data", (data) => {
    try {
      const { x, y } = data;
      const estado = estados_clientes.get(socket.id);
      if (!estado || estado.fase_atual === 3 || estado.foco_concluido_nesta_fase) return;

      const { foco_iniciado_timestamp } = estado;
      let alvo_da_fase = null;
      if (estado.fase_atual === 1) alvo_da_fase = estado.config_alvos[estado.indice_alvo_atual];
      if (!alvo_da_fase) return;

      const esta_focando_na_area =
        x >= alvo_da_fase.x_min && x <= alvo_da_fase.x_max &&
        y >= alvo_da_fase.y_min && y <= alvo_da_fase.y_max;

      if (esta_focando_na_area) {
        if (estado.fase_atual === 1) {
          if (estado.tempo_primeiro_foco === null) {
            estado.tempo_primeiro_foco = Date.now() - estado.tempo_inicio_fase;
            console.log(`⏱️ tempo de reação registrado: ${estado.tempo_primeiro_foco}ms. cliente: ${socket.id}`);
          }
          if (foco_iniciado_timestamp === null) {
            estado.foco_iniciado_timestamp = Date.now();
            socket.emit("gaze_status", { status: "foco_iniciado", mensagem: "foco iniciado na área alvo." });
          }
          const tempo_de_foco = Date.now() - estado.foco_iniciado_timestamp;
          if (tempo_de_foco >= tempo_minimo_foco) {
            estado.foco_concluido_nesta_fase = true;
            console.log(`✅ foco mantido por ${tempo_minimo_foco / 1000}s. cliente: ${socket.id}`);
            socket.emit("gaze_status", { status: "sucesso", mensagem: "foco mantido." });
            finalizar_alvo_fase1(true);
          }
        }
      } else {
        if (estado.fase_atual === 1 && foco_iniciado_timestamp !== null) {
          const tempo_focado = Date.now() - foco_iniciado_timestamp;
          if (tempo_focado < tempo_minimo_foco) {
            estado.erros_desvio_foco++;
            console.log(`❌ desviou antes de ${tempo_minimo_foco / 1000}s. cliente: ${socket.id}. total erros desvio: ${estado.erros_desvio_foco}`);
            socket.emit("gaze_status", {
              status: "erro",
              tipo: "desvio_foco",
              mensagem: "desviou o olhar muito rápido.",
              erros_desvio_foco: estado.erros_desvio_foco,
            });
          }
          estado.foco_iniciado_timestamp = null;
          socket.emit("gaze_status", { status: "foco_perdido", mensagem: "foco fora da área alvo." });
        }
      }
    } catch (err) {
      console.error(`erro ao processar gaze do cliente ${socket.id}:`, err);
    }
  });

  socket.on("send_to_arduino", (payload) => {
    try {
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      serialPort.write(text + "\n", (err) => {
        if (err) {
          console.error("Erro ao escrever na serial:", err);
          socket.emit("arduino_write_error", { error: err.message });
        } else {
          socket.emit("arduino_write_ok", { sent: text });
        }
      });
    } catch (err) {
      console.error("Erro no send_to_arduino:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`cliente desconectado. id: ${socket.id}`);
    const estado = estados_clientes.get(socket.id);
    if (estado?.timer_fase) clearTimeout(estado.timer_fase);
    estados_clientes.delete(socket.id);
  });
});

// --- INICIALIZAÇÃO DO SERVIDOR HTTP ---
httpServer.listen(port, host, () => {
  console.log(`servidor rodando em http://${host}:${port}`);
});
