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

    // métricas da fase 2 (atenção seletiva)
    rodada_atual_fase2: 1, // começa na rodada 1
    alvos_rodada1: [2, 5, 7], // planetas corretos da rodada 1
    alvos_rodada2: [1, 3, 6], // planetas corretos da rodada 2
    acertos_fase2: 0,
    erros_fase2: 0,
    planetas_clicados: [], // histórico de planetas clicados
    tempo_inicio_rodada: null,

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

  // função que processa a seleção de um planeta na fase 2 (chamar no IOT)
  const processar_selecao_planeta = (socket, planeta) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 2) return;

    // se estiver na rodade 1, então usa os alvos da rodada 1, senão os da rodada 2
    const alvos_atuais =
      estado.rodada_atual_fase2 === 1
        ? estado.alvos_rodada1
        : estado.alvos_rodada2;

    estado.planetas_clicados.push(planeta); // registra o planeta clicado

    // verifica se o planeta clicado está entre os alvos atuais
    const correto = alvos_atuais.includes(planeta);
    if (correto) {
      estado.acertos_fase2++;
    } else {
      estado.erros_fase2++;
    }

    // envia a resposta ao cliente
    socket.emit("resposta_planeta", {
      planeta,
      correto,
    });

    // verifica se já atingiu o limite de cliques para finalizar a rodada (1 clique por planeta)
    if (estado.planetas_clicados.length >= alvos_atuais.length) {
      // finalizar_rodada_fase2() irá gerenciar o fim da rodada/fase
      finalizar_rodada_fase2();
    }
  };

  // FASE 1: Atenção Sustentada
  const iniciar_fase1 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;
    const config_fase1 = estado.config_alvos;
    const alvo_atual = config_fase1[estado.indice_alvo_atual];

    if (!alvo_atual) {
      // Fase 1 concluída, inicia Fase 2
      estado.fase_atual = 2;
      socket.emit("fase_concluida", {
        fase: 1,
        mensagem: "Fase 1 (Atenção Sustentada) concluída.",
        total_alvos: config_fase1.length,
        total_erros_omissao: estado.erros_omissao,
        total_erros_desvio_foco: estado.erros_desvio_foco,
        metricas: calcular_desvio_padrao(
          estado.tempos_primeiro_foco_registrados
        ),
      });
      iniciar_fase2();
      return;
    }

    // cancela o timer de omissãoq ue estava rodando pro alvo anterior 
    if (estado.timer_fase) clearTimeout(estado.timer_fase);

    // variáveis resetadas 
    estado.foco_iniciado_timestamp = null;
    estado.foco_concluido_nesta_fase = false;
    estado.tempo_inicio_fase = Date.now();
    estado.tempo_primeiro_foco = null;

    // timer para registrar omissão => se o timer de 10s estourar, registra omissão e finaliza o alvo 
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
      mensagem: `fase 1 (atenção sustentada). alvo ${
        estado.indice_alvo_atual + 1
      } de ${config_fase1.length}. foque por ${tempo_minimo_foco / 1000}s.`,
    });
    console.log(
      `>>> alvo ${estado.indice_alvo_atual + 1} iniciado. cliente: ${socket.id}`
    );
  };

  // FASE 2: Atenção Seletiva
  const iniciar_fase2 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;

    estado.tempo_inicio_rodada = Date.now();
    const alvos_atuais =
      estado.rodada_atual_fase2 === 1
        ? estado.alvos_rodada1
        : estado.alvos_rodada2;

    socket.emit("fase_iniciada", {
      fase: 2,
      rodada: estado.rodada_atual_fase2,
      alvos: alvos_atuais,
      mensagem: `fase 2 (atenção seletiva). rodada ${estado.rodada_atual_fase2}. selecione os planetas corretos.`,
    });
  };

  // FASE 3: Atenção Dividida
  const iniciar_fase3 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;

    const config_fase3 = estado.config_alvos_fase3; // Usa as coordenadas recebidas do cliente
    const alvos_atuais = config_fase3[estado.indice_alvos_fase3];

    // Verifica se todos os pares de alvos foram completados
    if (!alvos_atuais) {
      socket.emit("fase_concluida", {
        mensagem: "Fase 3 (Atenção Dividida) concluída.",
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

  // FASE 1 - Finaliza o alvo atual e passa para o próximo
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
      mensagem: "Fase 1 (atenção sustentada) concluída.",
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

  // FASE 2 - Finaliza a rodada atual e passa para a próxima
  const finalizar_rodada_fase2 = () => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 2) return;

    // envia comando para o IoT apagar o led, pois é o fim da rodada
    serialPort.write("LED_SELECAO_OFF\n", (err) => {
      if (err) {
        console.error("Erro ao mandar apagar LED:", err.message);
      } else {
        console.log(`IoT <- LED_SELECAO_OFF`);
      }
    });

    socket.emit("rodada_finalizada", {
      fase: 2,
      rodada: estado.rodada_atual_fase2,
      acertos: estado.acertos_fase2,
      erros: estado.erros_fase2,
    });

    // se foi a primeira rodada, inicia a segunda
    if (estado.rodada_atual_fase2 === 1) {
      estado.rodada_atual_fase2 = 2;
      estado.planetas_clicados = []; // reseta o histórico de cliques
      estado.tempo_inicio_rodada = Date.now();
      iniciar_fase2();
    } else {
      // se foi a segunda rodada, finaliza a fase 2 e inicia a fase 3
      estado.fase_atual = 3;
      socket.emit("fase_atual_finalizada", {
        fase: 2,
        mensagem: "Fase 2 (atenção seletiva) concluída.",
        acertos_totais: estado.acertos_fase2,
        erros_totais: estado.erros_fase2,
      });
      // se houver configuração (pares de alvos) para a fase 3, inicia
      if (
        Array.isArray(estado.config_alvos_fase3) &&
        estado.config_alvos_fase3.length > 0
      ) {
        iniciar_fase3();
      } else {
        socket.emit("experimento_concluido", {
          mensagem: "Experimento finalizado após fase 2.",
        });
      }
    }
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
      mensagem: "Fase 3 (atenção dividida) concluída.",
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

  // ligar o led quando a tela de pergunta dos planetas estiver rendereizada no front 
  socket.on("aguardando_iot", () => {
    console.log(`Front-end renderizou a pergunta dos planetas e está aguardando o IoT. Ligando LED.`);

    // comando pro arduino ascender o led 
    serialPort.write("LED_SELECAO_ON\n", (err) => {
      if (err) {
        console.error("Erro ao mandar ascender LED:", err.message);
      } else {
        console.log(`IoT <- LED_SELECAO_ON (LED ACESO)`);
      }
    });
  });

  // --- RECEBIMENTO DAS CONFIGURAÇÕES (COORDENADAS) E INÍCIO DO JOGO ---
  socket.on("iniciar_experimento_com_config", (config) => {
    // Verifica se o valor recebido (config) é um array direto
    if (Array.isArray(config)) {
      // Se o array estiver vazio, não faz nada e sai da função
      if (config.length === 0) return;

      // Se for um array válido, assume que são os alvos da fase 1
      estado.config_alvos = config;
    } else if (config && typeof config === "object") {
      // Se config for um objeto (formato mais estruturado)

      // Verifica se existe uma propriedade chamada fase1 com um array de alvos
      if (Array.isArray(config.fase1) && config.fase1.length > 0) {
        // Salva os alvos da fase 1
        estado.config_alvos = config.fase1;
      } else {
        // Se não tiver alvos válidos para fase 1, sai da função
        return;
      }

      // Verifica se existe uma propriedade chamada fase3 com um array de pares de alvos
      if (Array.isArray(config.fase3)) {
        // Salva os alvos da fase 3 (se existirem)
        estado.config_alvos_fase3 = config.fase3;
      }
    } else {
      // Se config não for nem array nem objeto válido, sai da função
      return;
    }

    // Define que o cliente está agora na fase 1
    estado.fase_atual = 1;

    // Exibe no console quantos alvos foram recebidos para fase 1 e fase 3
    console.log(
      `Configurações recebidas. Fase1: ${
        estado.config_alvos.length
      } alvos; Fase3: ${
        estado.config_alvos_fase3?.length || 0
      } pares. cliente: ${socket.id}`
    );

    // Inicia a fase 1
    iniciar_fase1();
  });

  // --- ESCUTA DE DADOS DO OLHAR ---
  // comunicar
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
