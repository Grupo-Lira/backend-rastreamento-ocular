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

const estado_inicial = {
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
      (estado.tempo_primeiro_foco_estrela + estado.tempo_primeiro_foco_radar) /
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
