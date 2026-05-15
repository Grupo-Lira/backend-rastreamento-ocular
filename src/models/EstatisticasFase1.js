import mongoose from "mongoose";

const estatisticasResumoSchema = new mongoose.Schema(
  {
    tempo_reacao_medio_ms: Number,
    tempo_reacao_desvio_padrao_ms: Number,
    total_alvos: Number,
    total_alvos_exibidos: Number,
    total_acertos: Number,
    total_comissao: Number,
    total_omissao: Number,
  },
  { _id: false },
);

const analisePorAlvoSchema = new mongoose.Schema(
  {
    alvo_indice: Number,
    motivo_servidor: String,
    resultado: String,
    tempo_reacao_ms: Number,
    foco_maximo_ms: Number,
    desvio_maximo_ms: Number,
    tempo_total_focado_ms: Number,
    duracao_total_alvo_ms: Number,
  },
  { _id: false },
);

const estatisticasFase1 = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    experimento_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExperimentosFase1",
      required: true,
    },
    analise_por_alvo: [analisePorAlvoSchema],
    variabilidade_temporal_respostas_ms: Number,
    resumo_metricas: estatisticasResumoSchema,
    timestamp_analise: { type: Date, default: Date.now },
  },
  { collection: "estatisticas_fase_1" },
);

const EstatisticasFase1 = mongoose.model(
  "estatisticas_fase1",
  estatisticasFase1,
);
export default EstatisticasFase1;
