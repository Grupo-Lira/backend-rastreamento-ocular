import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

// --- CONFIGURAÇÕES GLOBAIS ---
const port = 4000;
const host = "localhost";

const tempo_minimo_foco = 5000; // Tempo que o foco deve ser sustentado em cada alvo (Fase 1)
const tempo_maximo_alvo = 10000; // Tempo máximo para cada alvo da Fase 1 (Erro de Omissão)

// map para armazenar o estado de cada cliente conectado
const estados_clientes = new Map();

// --- FUNÇÕES AUXILIARES DE CÁLCULO ---

// calcula a média e o desvio padrão de um array de números.
const calcular_desvio_padrao = (tempos) => {
    if (tempos.length === 0) return { media: 0, desvioPadrao: 0 };
    const soma = tempos.reduce((acc, val) => acc + val, 0);
    const media = soma / tempos.length;
    const variancia = tempos.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / tempos.length;
    const desvioPadrao = Math.sqrt(variancia);

    return {
        media: parseFloat(media.toFixed(2)),
        desvioPadrao: parseFloat(desvioPadrao.toFixed(2))
    };
};

// --- INICIALIZAÇÃO DO SERVIDOR ---
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// --- LÓGICA DO SOCKET.IO ---
io.on("connection", (socket) => {
    console.log(`novo cliente conectado. id: ${socket.id}`);

    // estado inicial do cliente
    const estado_inicial = {
        fase_atual: 0, // Estado inicial (0) para aguardar as coordenadas do cliente
        config_alvos: [], // Onde as coordenadas vindas do cliente serão armazenadas
        
        // métricas gerais de fase
        foco_iniciado_timestamp: null, // quando o foco foi iniciado
        foco_concluido_nesta_fase: false, // se o foco foi concluído com sucesso na fase atual
        tempo_inicio_fase: null, // quando a fase atual foi iniciada
        timer_fase: null, // timer para controle de tempo máximo por fase
        
        // métricas da fase 1 (atenção sustentada)
        indice_alvo_atual: 0, // serve para navegar pelos alvos da fase 1
        tempo_primeiro_foco: null, // tempo de reação (primeiro foco)
        tempos_primeiro_foco_registrados: [], // array de tempos de reação registrados
        erros_omissao: 0, 
        erros_desvio_foco: 0, 

    };
    estados_clientes.set(socket.id, estado_inicial);

    
    // --- FASE 1: Atenção Sustentada ---
    const iniciar_fase1 = () => {
        const estado = estados_clientes.get(socket.id);
        if (!estado) return;
        
        const config_fase1 = estado.config_alvos; // Usa as coordenadas recebidas do cliente
        const alvo_atual = config_fase1[estado.indice_alvo_atual];
        
        // Verifica se todos os alvos foram completados
        if (!alvo_atual) {
            console.log(`--- fase 1 concluída. cliente: ${socket.id} ---`);
            
            estado.fase_atual = 3; // marca o experimento como concluído
            socket.emit("experimento_concluido", { 
                mensagem: "Fase 1 (Atenção Sustentada) concluída. Experimento finalizado.",
                total_alvos: config_fase1.length,
                total_erros_omissao: estado.erros_omissao,
                total_erros_desvio_foco: estado.erros_desvio_foco,
                metricas: calcular_desvio_padrao(estado.tempos_primeiro_foco_registrados)
            });
            return;
        }

        // limpa e configura o estado do novo alvo
        if (estado.timer_fase) clearTimeout(estado.timer_fase);
        estado.foco_iniciado_timestamp = null;
        estado.foco_concluido_nesta_fase = false;
        estado.tempo_inicio_fase = Date.now();
        estado.tempo_primeiro_foco = null; 
        
        // inicia o timer de omissão
        estado.timer_fase = setTimeout(() => {
            // registra erro de omissão
            estado.erros_omissao++;
            console.log(`omissão no alvo ${estado.indice_alvo_atual + 1}. cliente: ${socket.id}`);
            finalizar_alvo_fase1(false); // finaliza como falha e passa para o próximo
        }, tempo_maximo_alvo);
        
        socket.emit("fase_iniciada", { 
            fase: 1, 
            alvo: alvo_atual,
            mensagem: `fase 1 (sustentada). alvo ${estado.indice_alvo_atual + 1} de ${config_fase1.length}. foque por 5s.` 
        });
        console.log(`>>> alvo ${estado.indice_alvo_atual + 1} iniciado. cliente: ${socket.id}`);
    };
    
    // Finaliza o alvo atual e passa para o próximo alvo
    const finalizar_alvo_fase1 = (termino_por_sucesso = false) => {
        const estado = estados_clientes.get(socket.id);
        if (!estado || estado.fase_atual !== 1) return; 

        if (estado.timer_fase) clearTimeout(estado.timer_fase);
        
        // registra o tempo de reação
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
        
        // avança e inicia o próximo alvo
        estado.indice_alvo_atual++; 
        iniciar_fase1();
    };

// --- RECEBIMENTO DAS CONFIGURAÇÕES (COORDENADAS) E INÍCIO DO JOGO ---
    
    // O cliente deve enviar um array de configurações de alvo ('config') neste evento.
    socket.on("iniciar_experimento_com_config", (config) => {
        
        const estado = estados_clientes.get(socket.id);

        // 1. VALIDAÇÃO DO ESTADO ATUAL
        if (!estado || estado.fase_atual !== 0) {
            console.log(`Tentativa de iniciar experimento em fase inválida: ${estado?.fase_atual}. cliente: ${socket.id}`);
            return; // Sai da função se a fase já tiver começado ou terminado.
        }

        // 2. VALIDAÇÃO DOS DADOS RECEBIDOS
        if (!Array.isArray(config) || config.length === 0) {
             console.error(`Configurações de alvo inválidas recebidas. cliente: ${socket.id}`);
             return; // Sai da função se os dados do cliente estiverem errados.
        }

        // 3. ARMAZENAMENTO 
        estado.config_alvos = config;
        
        // Altera a fase para 1, ou seja, ela irá inciar 
        estado.fase_atual = 1;

        console.log(`Configurações recebidas, iniciando fase 1. Total de alvos: ${config.length}. cliente: ${socket.id}`);
        
        // Chama a função principal que define o primeiro alvo e inicia o timer.
        iniciar_fase1();
    });

    // --- ESCUTA DE DADOS DO OLHAR ---
    socket.on("gaze_data", (data) => {
        try {
            const { x, y } = data;
            const estado = estados_clientes.get(socket.id);
            // Ignora se o experimento já terminou
            if (!estado || estado.fase_atual === 3 || estado.foco_concluido_nesta_fase) return;

            const { foco_iniciado_timestamp } = estado;
            let alvo_da_fase = null;
            
            // Define o alvo com base na fase
            if (estado.fase_atual === 1) {
                // Usa a configuração recebida
                alvo_da_fase = estado.config_alvos[estado.indice_alvo_atual];
            }

            if (!alvo_da_fase) return;

            // verifica se o olhar está DENTRO da área do alvo
            const esta_focando_na_area =
                x >= alvo_da_fase.x_min && x <= alvo_da_fase.x_max &&
                y >= alvo_da_fase.y_min && y <= alvo_da_fase.y_max;

            if (esta_focando_na_area) {
                
                if (estado.fase_atual === 1) {

                    // 1. Rastreamento do Tempo de Reação (primeiro foco)
                    if (estado.tempo_primeiro_foco === null) {
                        estado.tempo_primeiro_foco = Date.now() - estado.tempo_inicio_fase;
                        console.log(`⏱️ tempo de reação registrado: ${estado.tempo_primeiro_foco}ms. cliente: ${socket.id}`);
                    }

                    // 2. Inicia a contagem de tempo de foco sustentado
                    if (foco_iniciado_timestamp === null) {
                        estado.foco_iniciado_timestamp = Date.now();
                        socket.emit("gaze_status", { status: "foco_iniciado", mensagem: "foco iniciado na área alvo." });
                    }

                    const tempo_de_foco = Date.now() - estado.foco_iniciado_timestamp;

                    // 3. Sucesso (foco mantido pelo tempo mínimo)
                    if (tempo_de_foco >= tempo_minimo_foco) {
                        estado.foco_concluido_nesta_fase = true;
                        console.log(`✅ foco mantido por ${tempo_minimo_foco / 1000}s. cliente: ${socket.id}`);
                        socket.emit("gaze_status", { status: "sucesso", mensagem: "foco mantido." });

                        // finaliza o alvo imediatamente
                        finalizar_alvo_fase1(true);
                    }
                }
                
            } else {
                // --- O OLHAR DESVIOU ---
                
                if (estado.fase_atual === 1 && foco_iniciado_timestamp !== null) {
                    // FASE 1: Rastreia desvio como ERRO
                    const tempo_focado = Date.now() - foco_iniciado_timestamp;

                    // erro de desvio de foco (se desviou antes do tempo mínimo)
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

                    // reseta a contagem de foco
                    estado.foco_iniciado_timestamp = null;
                    socket.emit("gaze_status", { status: "foco_perdido", mensagem: "foco fora da área alvo." });
                }
            }
        } catch (err) {
            console.error(`erro ao processar dados do cliente ${socket.id}:`, err);
        }
    });

    // --- LÓGICA DE DESCONEXÃO ---
    socket.on("disconnect", () => {
        console.log(`cliente desconectado. id: ${socket.id}`);
        const estado = estados_clientes.get(socket.id);
        // limpa o timer de fase ao desconectar
        if (estado?.timer_fase) clearTimeout(estado.timer_fase);
        estados_clientes.delete(socket.id);
    });
});


// --- INICIALIZAÇÃO DO SERVIDOR HTTP ---
httpServer.listen(port, host, () => {
    console.log(`servidor rodando em http://${host}:${port}`);
});