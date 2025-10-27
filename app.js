import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { SerialPort, ReadlineParser } from "serialport"; // mantenha conforme sua versão do pacote
import mongoose from "mongoose";
import Dados from "./models/Dados.js";
import ResultadoAnalise from "./models/ResultadoAnalise.js";

// --- CONFIGURAÇÕES GLOBAIS HTTP/WS ---
const port = 4000;
const host = "localhost";

const tempo_sucesso_min = 5000;
const tempo_omissao_max = 10000;
const tempo_duracao_fase1 = 60000;

const estados_clientes = new Map();

const MONGODB_URI = "mongodb://127.0.0.1:27017/rastreamento-ocular";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Conectado ao MongoDB!"))
  .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

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

// --- SERVIDOR EXPRESS + SOCKET.IO ---
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const salvar_banco = async (clientId, historicoOlhar, resultadosAlvos) => {
  if (mongoose.connection.readyState !== 1) {
    console.error(
      `Conexão com o MongoDB não está pronta: ${mongoose.connection.readyState}). Não foi possível salvar.`
    );
    return false;
  }

  // tenta salvar ou atualizar os dados do olhar do cliente X para a fase 1
  try {
    const registro_salvo = await Dados.findOneAndUpdate(
      { client_id: clientId, fase: 1 },
      {
        $set: {
          historico_olhar_fase1: historicoOlhar.map((item) => ({
            ...item,
            _id: undefined, // segurança
          })),
          resultados_alvos_fase1: resultadosAlvos.map((item) => ({
            ...item,
            _id: undefined,
          })),
        },
      },
      // se o doc existente não for encontrado, cria um novo
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(
      `Dados da fase 1 salvos/atualizados. ID: ${registro_salvo._id}`
    );
    return true;
  } catch (error) {
    console.error(`Erro ao salvar dados:`, error);
    return false;
  }
};

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

// função chamada após a finalização da fase 1 para calcular as métricas TDC e enviar ao front
const analisar_metricas = async (
  client_id,
  historico_olhar,
  resultados_alvos
) => {
  console.log(`\n--- INICIANDO ANÁLISE POSTERIOR DA FASE 1 (${client_id}) ---`);

  // objeto principal para armazenar os resultados detalhados e o resumo estatístico
  const resultados_participante = {
    client_id: client_id,
    analise_por_alvo: [],
    resumo_metricas: {},
  };

  for (const alvo of resultados_alvos) {
    const alvo_indice = alvo.alvo_indice;

    // filtra e ordena cronologicamente os eventos de olhar (estado 1=foco, 0=desvio) para o alvo atual
    const eventos_olhar_alvo = historico_olhar
      .filter((e) => e.alvo_indice === alvo_indice)
      .sort((a, b) => a.timestamp - b.timestamp);

    let tempo_total_foco = 0;
    let foco_maximo = 0;
    let inicio_foco = null;
    let desvio_maximo = 0;
    let inicio_desvio = null;
    const tempo_final = alvo.tempo_fim_alvo;

    // cálculo de foco e desvio máximo/total
    // percorre o histórico para calcular a duração dos blocos contínuos de foco e desvio
    for (let i = 0; i < eventos_olhar_alvo.length; i++) {
      const evento = eventos_olhar_alvo[i];

      if (evento.estado === 1) {
        if (inicio_foco === null) inicio_foco = evento.timestamp;

        // se estava desviado, calcula o tempo que ficou em desvio (fim do desvio)
        if (inicio_desvio !== null) {
          const duracao_desvio = evento.timestamp - inicio_desvio;
          if (duracao_desvio > desvio_maximo) desvio_maximo = duracao_desvio;
          inicio_desvio = null;
        }
      } else if (evento.estado === 0) {
        if (inicio_desvio === null) inicio_desvio = evento.timestamp;

        // se estava focado, calcula o tempo que ficou focado (fim do foco)
        if (inicio_foco !== null) {
          const duracao_bloco = evento.timestamp - inicio_foco;
          tempo_total_foco += duracao_bloco;
          if (duracao_bloco > foco_maximo) foco_maximo = duracao_bloco;
          inicio_foco = null;
        }
      }
    }

    // trata o estado final, calculando a duração do último bloco até o fim do alvo
    // o loop anterior só registra o tempo na transição de estados, não no término do alvo
    if (inicio_foco !== null) {
      // o alvo terminou no estado de foco
      const duracao_bloco = tempo_final - inicio_foco;
      tempo_total_foco += duracao_bloco;
      if (duracao_bloco > foco_maximo) foco_maximo = duracao_bloco;
    } else if (inicio_desvio !== null) {
      // o alvo terminou no estado de desvio
      const duracao_desvio = tempo_final - inicio_desvio;
      // atualiza apenas o desvio máximo
      if (duracao_desvio > desvio_maximo) desvio_maximo = duracao_desvio;
    }

    // cálculo: tempo de reação (tr)
    // diferença entre o primeiro foco e o início do alvo
    const primeiro_foco = eventos_olhar_alvo.find((e) => e.estado === 1);
    const tempo_reacao = primeiro_foco
      ? primeiro_foco.timestamp - alvo.tempo_inicio_alvo
      : "n/a";

    // verifica se o foco contínuo máximo atingiu o critério de sucesso
    const concluiu_duracao_minima = foco_maximo >= tempo_sucesso_min;

    // classificação: omissão > comissão > acerto
    let resultado_final;
    const duracao_total_alvo = tempo_final - alvo.tempo_inicio_alvo;

    // regras de omissão (foco nunca iniciado ou latência/desvio muito longos)
    // foco nao iniciado: verifica se demorou demais para focar (tempo de reacao)
    const foco_nao_iniciado =
      tempo_reacao === "n/a" ||
      (typeof tempo_reacao === "number" && tempo_reacao > tempo_omissao_max);

    // tempo max. desviado: verifica se demorou demais para voltar ao foco
    const latencia_retorno_excedida = desvio_maximo > tempo_omissao_max;

    // critério para comissão: houve quebra de foco (mais de dois eventos = inicio, quebra, retorno, etc)
    const houve_quebra_foco = eventos_olhar_alvo.length > 2;

    // a. prioridade máxima: omissão (se demorou muito no inicio ou no retorno)
    if (foco_nao_iniciado || latencia_retorno_excedida) {
      resultado_final = "OMISSÃO";
      // b. próxima prioridade: comissão (se nao foi omissao, mas houve quebras de foco)
    } else if (houve_quebra_foco) {
      resultado_final = "COMISSÃO";
      // c. última prioridade: acerto (se nao e omissao nem comissao)
    } else {
      resultado_final = "ACERTO";
    }

    // log de análise por alvo
    // deixar apenas para fase de integração por conta dos testes, pra versão final: tirar
    console.log(
      `[ANÁLISE ALVO ${alvo_indice + 1}] motivo término bruto: ${
        alvo.motivo_termino
      }.`
    );
    console.log(
      `  > tr: ${tempo_reacao}ms, foco máximo: ${foco_maximo}ms, desvio máximo: ${desvio_maximo}ms, duração total: ${duracao_total_alvo}ms`
    );
    console.log(
      `  > classificação final: ${resultado_final}. concluiu duração mínima: ${concluiu_duracao_minima}. (critério: tempo_sucesso_min=${tempo_sucesso_min}ms, tempo_omissao_max=${tempo_omissao_max}ms)`
    );

    // armazena o detalhe do alvo
    resultados_participante.analise_por_alvo.push({
      alvo_indice: alvo_indice,
      motivo_servidor: alvo.motivo_termino,
      resultado: resultado_final,
      concluiu_duracao_minima: concluiu_duracao_minima,
      tempo_reacao_ms: tempo_reacao,
      foco_maximo_ms: foco_maximo,
      desvio_maximo_ms: desvio_maximo,
      tempo_total_focado_ms: tempo_total_foco,
      duracao_total_alvo_ms: duracao_total_alvo,
    });
    return resultados_participante;
  }

  // cálculo estatístico e resumo das métricas
  // filtra os tempos de reação válidos para o cálculo da média
  const tempos_reacao = resultados_participante.analise_por_alvo
    .map((r) => r.tempo_reacao_ms)
    .filter((tr) => typeof tr === "number");

  // calcula média e desvio padrão usando a função auxiliar
  const { media: tr_medio, desvioPadrao: tr_desvio_padrao } =
    calcular_desvio_padrao(tempos_reacao);

  // cálculo de acertos: total de alvos que atingiram o critério de foco mínimo
  const total_acertos = resultados_participante.analise_por_alvo.filter(
    (r) => r.concluiu_duracao_minima === true
  ).length;

  // contagem de omissão/comissão
  const total_comissao = resultados_participante.analise_por_alvo.filter(
    (r) => r.resultado === "COMISSÃO"
  ).length;
  const total_omissao = resultados_participante.analise_por_alvo.filter(
    (r) => r.resultado === "OMISSÃO"
  ).length;

  const resumo = {
    tempo_reacao_medio_ms: tr_medio,
    tempo_reacao_desvio_padrao_ms: tr_desvio_padrao,
    total_acertos: total_acertos,
    total_comissao: total_comissao,
    total_omissao: total_omissao,
  };
  resultados_participante.resumo_metricas = resumo;

  // log de resumo: tirar depois da integração
  console.log(`\n--- resumo de métricas da fase 1 ---`);
  console.log(`total acertos: ${total_acertos}`);
  console.log(`total comissão: ${total_comissao}`);
  console.log(`total omissão: ${total_omissao}`);
  console.log(`tr médio: ${tr_medio}ms (dp: ${tr_desvio_padrao}ms)`);
  console.log(`------------------------\n`);

  try {
    // busca ou cria (upsert) um documento de análise para este client_id e salva o resultado completo
    await ResultadoAnalise.findOneAndUpdate(
      { client_id: client_id },
      { $set: resultados_participante },
      { upsert: true, new: true }
    );
    console.log(
      `Análise resumida da fase 1 salva/atualizada para ${client_id}`
    );
  } catch (saveError) {
    console.error(`Erro ao salvar a análise para ${client_id}:`, saveError);
  }

  return {
    client_id: client_id,
    tempo_reacao_medio_ms: tr_medio,
    total_acertos: total_acertos,
    total_comissao: total_comissao,
    total_omissao: total_omissao,
  };
};

// chamada em caso de sucesso no último alvo ou tempo esgotado da fase
const finalizar_fase1_completa = async (socket, motivo) => {
  const estado = estados_clientes.get(socket.id);
  if (!estado || estado.fase_atual !== 1) return;

  if (estado.timer_fase1) clearTimeout(estado.timer_fase1);

  // salva os dados e executa a análise
  const salvou = await salvar_banco(
    socket.id,
    estado.historico_olhar_fase1,
    estado.resultados_alvos_fase1
  );

  if (salvou) {
    // se salvou, analisa e salva o resumo
    const metricasFinais = await analisar_metricas(
      socket.id,
      estado.historico_olhar_fase1,
      estado.resultados_alvos_fase1
    );

    socket.emit("fase_concluida", {
      fase: 1,
      mensagem: `Fase 1 concluída. Motivo: ${motivo}.`,
      metricas: metricasFinais,
    });
  } else {
    // caso não salve
    socket.emit("fase_concluida", {
      fase: 1,
      mensagem: "Fase 1 concluída. Falha ao salvar dados.",
    });
  }

  // limpa os arrays de dados locais e prepara para a próxima fase
  estado.historico_olhar_fase1 = [];
  estado.resultados_alvos_fase1 = [];

  // 4. Avança para a próxima fase
  iniciar_fase2();
};

io.on("connection", (socket) => {
  console.log(`novo cliente conectado. id: ${socket.id}`);

  const estado_inicial = {
    fase_atual: 0,
    config_alvos: [],
    timer_fase1: null,

    // métricas gerais das fases
    foco_iniciado_timestamp: null,
    tempo_inicio_fase: null,
    indice_alvo_atual: 0,

    // métricas da fase 1 (atenção sustentada)
    historico_olhar_fase1: [],
    ultimo_estado_foco: 0,
    resultados_alvos_fase1: [],

    // métricas da fase 2 (atenção seletiva)
    rodada_atual_fase2: 1,
    alvos_rodada1: [2, 5, 7],
    alvos_rodada2: [1, 3, 6],
    acertos_fase2: 0,
    erros_fase2: 0,
    planetas_clicados: [],
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
      acertos: estado.acertos_fase2,
      erros: estado.erros_fase2,
    });

    // verifica se já atingiu o limite de cliques para finalizar a rodada (1 clique por planeta)
    if (estado.planetas_clicados.length >= alvos_atuais.length) {
      // finalizar_rodada_fase2() irá gerenciar o fim da rodada/fase
      finalizar_rodada_fase2();
    }
  };

  // FASE 1: Atenção Sustentada
  const iniciar_alvo_fase1 = () => {
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
        // metricas: calcular_desvio_padrao(
        //   estado.tempos_primeiro_foco_registrados
        // ),
      });
      finalizar_fase1_completa(socket, "ALVOS_CONCLUIDOS");
      return;
    }

    // se este é o primeiro alvo, inicia o timer de 60s
    if (estado.indice_alvo_atual === 0) {
      estado.tempo_inicio_fase = Date.now();
    }

    // reset para o novo alvo
    estado.foco_iniciado_timestamp = null;
    estado.ultimo_estado_foco = 0;

    // registra o tempo de início do alvo
    estado.historico_olhar_fase1.push({
      estado: 0,
      timestamp: Date.now(),
      alvo_indice: estado.indice_alvo_atual,
    });

    socket.emit("fase_iniciada", {
      fase: 1,
      alvo: alvo_atual,
      tempo_necessario: tempo_sucesso_min,
      mensagem: `fase 1 (atenção sustentada). alvo ${
        estado.indice_alvo_atual + 1
      } de ${config_fase1.length}. foque por ${tempo_sucesso_min / 1000}s.`,
    });
    console.log(
      `>>> alvo ${estado.indice_alvo_atual + 1} iniciado. Tempo Início: ${
        estado.historico_olhar_fase1.slice(-1)[0].timestamp
      }. cliente: ${socket.id}`
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
  const finalizar_alvo_fase1 = (motivo_termino_bruto) => {
    const estado = estados_clientes.get(socket.id);
    if (!estado || estado.fase_atual !== 1) return;

    const alvo_indice = estado.indice_alvo_atual;

    estado.historico_olhar_fase1.push({
      estado: 0,
      timestamp: Date.now(),
      alvo_indice: alvo_indice,
    });

    estado.resultados_alvos_fase1.push({
      alvo_indice: alvo_indice,
      motivo_termino: motivo_termino_bruto,
      tempo_inicio_alvo: estado.historico_olhar_fase1.find(
        (h) => h.alvo_indice === estado.indice_alvo_atual && h.estado === 0
      ).timestamp, // Busca o timestamp de início
      tempo_fim_alvo: Date.now(),
    });

    const config_fase1 = estado.config_alvos;
    const alvo_atual = config_fase1[estado.indice_alvo_atual];
    socket.emit("alvo_fase1_concluido", {
      fase: 1,
      alvo: alvo_atual,
      alvo_concluido: alvo_indice + 1,
      motivo_termino: motivo_termino_bruto,
    });

    estado.indice_alvo_atual++;
    // SOMENTE CHAMA O PRÓXIMO ALVO SE NÃO FOI ENCERRADO PELO TEMPO DA FASE
    if (motivo_termino_bruto !== "TEMPO_FASE_EXCEDIDO") {
      iniciar_alvo_fase1(); // Chama o início do próximo alvo ou a finalização da fase
    }
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
  socket.on("fase2_pronta_para_cliques", () => {
    console.log(`Front-end renderizou a pergunta dos planetas. Ligando LED.`);

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
    // Pega estado do cliente
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;

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
        console.log("Alvos da fase 1 recebidos:", config.fase1);
        estado.config_alvos = config.fase1;
      } else {
        // Se não tiver alvos válidos para fase 1, sai da função
        console.log(
          "Configuração inválida: alvos da fase 1 ausentes ou inválidos."
        );
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
    iniciar_alvo_fase1();
  });

  // --- ESCUTA DE DADOS DO OLHAR ---
  // comunicar
  socket.on("gaze_data", (data) => {
    console.log(`Gaze data recebido do cliente ${socket.id}:`, data);

    try {
      const { x, y } = data;
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

        const novo_estado_foco = esta_focando_na_area ? 1 : 0;
        const alvo_indice = estado.indice_alvo_atual; // 1. REGISTRO E EMISSÃO DE MUDANÇA DE ESTADO

        if (novo_estado_foco !== estado.ultimo_estado_foco) {
          estado.historico_olhar_fase1.push({
            estado: novo_estado_foco, // 1: Olhou, 0: Desviou
            timestamp: Date.now(),
            alvo_indice: alvo_indice,
          });

          estado.ultimo_estado_foco = novo_estado_foco;

          socket.emit("gaze_status", {
            status: novo_estado_foco === 1 ? "foco_iniciado" : "foco_perdido",
          });
        }

        // 2. LÓGICA DE CRONOMETRAGEM E CONCLUSÃO (APENAS POR SUCESSO)
        if (esta_focando_na_area) {
          if (estado.foco_iniciado_timestamp === null) {
            estado.foco_iniciado_timestamp = Date.now();
            console.log(
              `INICIANDO FOCO - Cliente ${socket.id} - Fase 1 - FOCO INICIADO TIMESTAMP: ${estado.foco_iniciado_timestamp}ms - Mínimo: ${tempo_minimo_foco}ms`
            );
          } else {
            const tempo_focado = Date.now() - estado.foco_iniciado_timestamp;
            if (tempo_focado >= tempo_sucesso_min) {
              finalizar_alvo_fase1("FOCO_COMPLETO");
              return;
            }
          }
        } else {
          // Foco perdido, reseta o contador de tempo contínuo
          if (estado.foco_iniciado_timestamp !== null) {
            estado.foco_iniciado_timestamp = null;
          }
          console.log(
            `NÃO FOCOU - Cliente ${socket.id} - Fase 1 - FOCO INICIADO TIMESTAMP: ${estado.foco_iniciado_timestamp}ms - Mínimo: ${tempo_minimo_foco}ms`
          );
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
          if (tempo_estrela >= tempo_sucesso_min) {
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
          if (tempo_radar >= tempo_sucesso_min) {
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
              tempo_sucesso_min / 1000
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
          if (tempo_focado < tempo_sucesso_min) {
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
          if (tempo_focado < tempo_sucesso_min) {
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

  socket.on("fase_1_tempo_excedido", () => {
    console.log(`Cliente ${socket.id} - Fase 1 tempo excedido recebido.`);
    const estado = estados_clientes.get(socket.id);
    if (!estado) return;
    estado.fase_atual = 2;

    // Garante que o alvo atual seja finalizado antes de encerrar a fase
    if (estado.indice_alvo_atual < estado.config_alvos.length) {
      finalizar_alvo_fase1("TEMPO_FASE_EXCEDIDO");
    }
    finalizar_fase1_completa(socket, "TEMPO_FASE_EXCEDIDO");

    return;
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
