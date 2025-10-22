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

// calcula a média e o desvio padrão de um array de números (tempos em que o usuário iniciou o foco no alvo)
const calcular_desvio_padrao = (tempos) => {
  if (tempos.length === 0) return { media: 0, desvioPadrao: 0 };
  const soma = tempos.reduce((acc, val) => acc + val, 0);
  const media = soma / tempos.length;
  const variancia =
    tempos.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) /
    tempos.length;
  const desvioPadrao = Math.sqrt(variancia);

  return {
    media: parseFloat(media.toFixed(2)),
    desvioPadrao: parseFloat(desvioPadrao.toFixed(2)),
  };
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

    // métricas gerais das fases
    foco_iniciado_timestamp: null, // quando o foco foi iniciado
    foco_concluido_nesta_fase: false, // se o foco foi concluído com sucesso na fase atual
    tempo_inicio_fase: null, // quando a fase atual foi iniciada
    timer_fase: null, // timer para controle de tempo máximo por fase
    indice_alvo_atual: 0, // serve para navegar pelos alvos da fase 1

    // métricas da fase 1 (atenção sustentada)
    tempo_primeiro_foco: null, // tempo de reação (primeiro foco)
    tempos_primeiro_foco_registrados: [], // array de tempos de reação registrados
    erros_omissao: 0,
    erros_desvio_foco: 0,

    // métricas da fase 3 (atenção dividida)
    indice_alvos_fase3: 0, // serve para navegar pelos pares de alvos da fase 3
    tempo_primeiro_foco_estrela: null,
    tempo_primeiro_foco_radar: null,
    foco_iniciado_estrela: null,
    foco_iniciado_radar: null,
    tempos_reacao_fase3: [], // array para armazenar tempos de reação combinados
    erros_omissao_fase3: 0,
    erros_desvio_foco_fase3: 0,
    foco_concluido_estrela: false,
    foco_concluido_radar: false,
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
        mensagem:
          "Fase 1 (Atenção Sustentada) concluída. Experimento finalizado.",
        total_alvos: config_fase1.length,
        total_erros_omissao: estado.erros_omissao,
        total_erros_desvio_foco: estado.erros_desvio_foco,
        metricas: calcular_desvio_padrao(
          estado.tempos_primeiro_foco_registrados
        ),
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
      console.log(
        `omissão no alvo ${estado.indice_alvo_atual + 1}. cliente: ${socket.id}`
      );
      finalizar_alvo_fase1(false);
    }, tempo_maximo_alvo);

    socket.emit("fase_iniciada", {
      fase: 1,
      alvo: alvo_atual,
      mensagem: `fase 1 (sustentada). alvo ${estado.indice_alvo_atual + 1} de ${
        config_fase1.length
      }. foque por ${tempo_minimo_foco / 1000}s.`,
    });
    console.log(
      `>>> alvo ${estado.indice_alvo_atual + 1} iniciado. cliente: ${socket.id}`
    );
  };

  // FASE 3: Atenção Dividida
  const iniciar_fase3 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;

    const config_fase3 = estado.config_alvos_fase3; // Usa as coordenadas recebidas do cliente
    const alvos_atuais = config_fase3[estado.indice_alvos_fase3];

    // Verifica se todos os pares de alvos foram completados
    if (!alvos_atuais) {
      console.log(`--- fase 3 concluída. cliente: ${socket.id} ---`);

      socket.emit("experimento_concluido", {
        mensagem: "Fase 3 (atenção dividida) concluída.",
        total_pares_alvos: config_fase3.length,
        total_erros_omissao: estado.erros_omissao_fase3,
        total_erros_desvio: estado.erros_desvio_foco_fase3,
        metricas: calcular_desvio_padrao(estado.tempos_reacao_fase3),
      });
      return;
    }

    // Reset do estado para novo par de alvos
    if (estado.timer_fase) clearTimeout(estado.timer_fase);
    estado.tempo_foco_inicio_fase = Date.now();
    estado.tempo_primeiro_foco_estrela = null;
    estado.tempo_primeiro_foco_radar = null;
    estado.foco_iniciado_estrela = null;
    estado.foco_iniciado_radar = null;
    estado.foco_concluido_estrela = false;
    estado.foco_concluido_radar = false;

    // Timer para erro de omissão
    estado.timer_fase = setTimeout(() => {
      estado.erros_omissao_fase3++;
      finalizar_alvo_fase3(false);
    }, tempo_maximo_alvo);

    socket.emit("fase_iniciada", {
      fase: 3,
      alvos: alvos_atuais,
      mensagem: `fase 3 (atenção dividida). par de alvos ${
        estado.indice_alvos_fase3 + 1
      } de ${config_fase3.length}. foque em ambos por 5s.`,
    });
  };

  const finalizar_alvo_fase1 = (termino_por_sucesso = false) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 1) return;
    if (estado.timer_fase) clearTimeout(estado.timer_fase);

    if (estado.tempo_primeiro_foco !== null) {
      estado.tempos_primeiro_foco_registrados.push(estado.tempo_primeiro_foco);
    }

    const metricas_variabilidade = calcular_desvio_padrao(
      estado.tempos_primeiro_foco_registrados
    );

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

  // FASE 3 - Finaliza o par de alvos atual e passa para o próximo par
  const finalizar_alvos_fase3 = (sucesso = false) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 3) return;

    if (estado.timer_fase) clearTimeout(estado.timer_fase);

    // registra o tempo de reação combinado (média entre os dois alvos)
    if (
      estado.tempo_primeiro_foco_estrela !== null &&
      estado.tempo_primeiro_foco_radar !== null
    ) {
      const tempo_medio =
        (estado.tempo_primeiro_foco_estrela +
          estado.tempo_primeiro_foco_radar) /
        2;
      estado.tempos_reacao_fase3.push(tempo_medio);
    }

    const metricas = calcular_desvio_padrao(estado.tempos_reacao_fase3);

    socket.emit("fase_atual_finalizada", {
      fase: 3,
      par_alvos_concluido: estado.indice_alvos_fase3 + 1,
      sucesso: sucesso,
      tempo_medio_reacao: metricas.media,
      total_erros_omissao: estado.erros_omissao_fase3,
      total_erros_desvio: estado.erros_desvio_foco_fase3,
    });

    // avança e inicia o próximo par de alvos
    estado.indice_alvos_fase3++;
    iniciar_fase3();
  };

  // --- RECEBIMENTO DAS CONFIGURAÇÕES (COORDENADAS) E INÍCIO DO JOGO ---
  socket.on("iniciar_experimento_com_config", (config) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 0) return;
    if (!Array.isArray(config) || config.length === 0) return;
    estado.config_alvos = config;
    estado.fase_atual = 1;
    console.log(
      `Configurações recebidas, iniciando fase 1. Total de alvos: ${config.length}. cliente: ${socket.id}`
    );
    iniciar_fase1();
  });

  // --- ESCUTA DE DADOS DO OLHAR ---
  socket.on("gaze_data", (data) => {
    try {
      const { x, y } = data; // coordenadas do olhar recebidas do cliente
      const estado = estados_clientes.get(socket.id);
      if (!estado) return;

      // --- FASE 1 (atenção sustentada) ---
      if (estado.fase_atual === 1) {
        const alvo_da_fase = estado.config_alvos[estado.indice_alvo_atual];
        if (!alvo_da_fase) return;

        const esta_focando_na_area =
          x >= alvo_da_fase.x_min &&
          x <= alvo_da_fase.x_max &&
          y >= alvo_da_fase.y_min &&
          y <= alvo_da_fase.y_max;

        if (esta_focando_na_area) {
          // tempo de reação (primeiro foco) para poder usar no cálculo de variabilidade
          if (estado.tempo_primeiro_foco === null) {
            estado.tempo_primeiro_foco = Date.now() - estado.tempo_inicio_fase;
            console.log(
              `⏱️ tempo de reação registrado: ${estado.tempo_primeiro_foco}ms. cliente: ${socket.id}`
            );
          }

          // inicia contagem de foco sustentado (pra poder validar o sucesso do alvo)
          if (estado.foco_iniciado_timestamp === null) {
            estado.foco_iniciado_timestamp = Date.now();
            socket.emit("gaze_status", {
              status: "foco_iniciado",
              mensagem: "foco iniciado na área alvo.",
            });
          }

          const tempo_de_foco = Date.now() - estado.foco_iniciado_timestamp; // tempo que o usuário está focando no alvo (ao menos 5 segundos)

          // verifica se o foco sustentado atingiu o tempo mínimo
          if (tempo_de_foco >= tempo_minimo_foco) {
            estado.foco_concluido_nesta_fase = true;
            console.log(
              `foco mantido por ${tempo_minimo_foco / 1000}s. cliente: ${
                socket.id
              }`
            );
            socket.emit("gaze_status", {
              status: "sucesso",
              mensagem: "foco mantido.",
            });
            finalizar_alvo_fase1(true);
          }
        } else {
          // desviou
          if (estado.foco_iniciado_timestamp !== null) {
            const tempo_focado = Date.now() - estado.foco_iniciado_timestamp;
            // verifica se desviou antes do tempo mínimo
            if (tempo_focado < tempo_minimo_foco) {
              // registra erro de comissão
              estado.erros_desvio_foco++;

              console.log(
                `desviou antes de ${tempo_minimo_foco / 1000}s. cliente: ${
                  socket.id
                }. total erros desvio: ${estado.erros_desvio_foco}`
              );
              socket.emit("gaze_status", {
                status: "erro",
                tipo: "desvio_foco",
                mensagem: "desviou o olhar muito rápido.",
                erros_desvio_foco: estado.erros_desvio_foco, // total de erros de desvio até o momento
              });
            }
            estado.foco_iniciado_timestamp = null;
            socket.emit("gaze_status", {
              status: "foco_perdido",
              mensagem: "foco fora da área alvo.",
            });
          }
        }

        return; // já tratou fase 1
      }

      // --- FASE 3 (atenção dividida) ---
      if (estado.fase_atual === 3) {
        const config_fase3 = estado.config_alvos_fase3;
        // verifica se a configuração da fase3 está disponível (no caso, o cliente deve ter enviado)
        if (!Array.isArray(config_fase3) || config_fase3.length === 0) {
          console.error(
            `configuração de fase3 ausente ou inválida. cliente: ${socket.id}`
          );
          return;
        }

        const par_atual = config_fase3?.[estado.indice_alvos_fase3];
        if (!par_atual) return;

        const estrela = par_atual.estrela;
        const radar = par_atual.radar;
        if (!estrela || !radar) return;

        const esta_na_estrela =
          x >= estrela.x_min &&
          x <= estrela.x_max &&
          y >= estrela.y_min &&
          y <= estrela.y_max;

        const esta_no_radar =
          x >= radar.x_min &&
          x <= radar.x_max &&
          y >= radar.y_min &&
          y <= radar.y_max;

        // tempo de referência para reação (início da tentativa)
        const tempo_inicio =
          estado.tempo_foco_inicio_fase ||
          estado.tempo_inicio_fase ||
          Date.now();

        // primeiros tempos de reação
        if (esta_na_estrela && estado.tempo_primeiro_foco_estrela === null) {
          estado.tempo_primeiro_foco_estrela = Date.now() - tempo_inicio;
          console.log(
            `⏱️ reação estrela: ${estado.tempo_primeiro_foco_estrela}ms. cliente: ${socket.id}`
          );
        }
        if (esta_no_radar && estado.tempo_primeiro_foco_radar === null) {
          estado.tempo_primeiro_foco_radar = Date.now() - tempo_inicio;
          console.log(
            `⏱️ reação radar: ${estado.tempo_primeiro_foco_radar}ms. cliente: ${socket.id}`
          );
        }

        // inicia contagem sustentada para cada alvo
        if (esta_na_estrela && estado.foco_iniciado_estrela === null) {
          estado.foco_iniciado_estrela = Date.now();
          socket.emit("gaze_status", {
            status: "foco_iniciado",
            alvo: "estrela",
          });
        }
        if (esta_no_radar && estado.foco_iniciado_radar === null) {
          estado.foco_iniciado_radar = Date.now();
          socket.emit("gaze_status", {
            status: "foco_iniciado",
            alvo: "radar",
          });
        }

        // verifica conclusão individual
        if (
          estado.foco_iniciado_estrela !== null &&
          !estado.foco_concluido_estrela
        ) {
          const tempo_estrela = Date.now() - estado.foco_iniciado_estrela; // tempo focado na estrela
          if (tempo_estrela >= tempo_minimo_foco) {
            estado.foco_concluido_estrela = true;
            socket.emit("gaze_status", {
              status: "sucesso_parcial",
              alvo: "estrela",
            });
          }
        }
        if (
          estado.foco_iniciado_radar !== null &&
          !estado.foco_concluido_radar
        ) {
          const tempo_radar = Date.now() - estado.foco_iniciado_radar; // tempo focado no radar
          if (tempo_radar >= tempo_minimo_foco) {
            estado.foco_concluido_radar = true;
            socket.emit("gaze_status", {
              status: "sucesso_parcial",
              alvo: "radar",
            });
          }
        }

        // sucesso só quando ambos os alvos mantiveram o foco
        if (estado.foco_concluido_estrela && estado.foco_concluido_radar) {
          console.log(
            `ambos os alvos mantidos por ${
              tempo_minimo_foco / 1000
            }s. cliente: ${socket.id}`
          );
          finalizar_alvos_fase3(true);
          return;
        }

        // tratamento de desvio (se iniciou foco em um alvo e depois saiu antes do mínimo)
        if (
          !esta_na_estrela &&
          estado.foco_iniciado_estrela !== null &&
          !estado.foco_concluido_estrela
        ) {
          const tempo_focado = Date.now() - estado.foco_iniciado_estrela;
          if (tempo_focado < tempo_minimo_foco) {
            // registra erro de comissão
            estado.erros_desvio_foco_fase3++;
            socket.emit("gaze_status", {
              status: "erro",
              tipo: "desvio_foco",
              alvo: "estrela",
              mensagem: "desviou o olhar da estrela antes do tempo mínimo.",
              erros_desvio_foco_fase3: estado.erros_desvio_foco_fase3,
            });
          }
          estado.foco_iniciado_estrela = null;
          estado.foco_concluido_estrela = false;
        }

        if (
          !esta_no_radar &&
          estado.foco_iniciado_radar !== null &&
          !estado.foco_concluido_radar
        ) {
          const tempo_focado = Date.now() - estado.foco_iniciado_radar;
          if (tempo_focado < tempo_minimo_foco) {
            // registra erro de comissão
            estado.erros_desvio_foco_fase3++;
            socket.emit("gaze_status", {
              status: "erro",
              tipo: "desvio_foco",
              alvo: "radar",
              mensagem: "desviou o olhar do radar antes do tempo mínimo.",
              erros_desvio_foco_fase3: estado.erros_desvio_foco_fase3,
            });
          }
          estado.foco_iniciado_radar = null;
          estado.foco_concluido_radar = false;
        }

        return;
      }
    } catch (err) {
      console.error(`erro ao processar dados do cliente ${socket.id}:`, err);
    }
  });

  socket.on("send_to_arduino", (payload) => {
    try {
      const text =
        typeof payload === "string" ? payload : JSON.stringify(payload);
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
