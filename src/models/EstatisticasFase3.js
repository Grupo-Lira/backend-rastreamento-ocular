import mongoose from "mongoose";

const estatisticasResumoSchema = new mongoose.Schema(
  {
    tempo_reacao_medio_ms: Number,
    tempo_reacao_desvio_padrao_ms: Number,
    total_acertos: Number,
    total_comissao: Number,
    total_omissao: Number,
  },
  { _id: false },
);

const analisePorAlvoSchema = new mongoose.Schema(
  {
    nome_alvo: String,
    motivo_servidor: String,
    resultado: String,
    quantidade_acerto: Number,
    quantidade_comissao: Number,
    quantidade_omissao: Number,
    tempo_reacao_ms: Number,
    foco_maximo_ms: Number,
    desvio_maximo_ms: Number,
    tempo_total_focado_ms: Number,
    duracao_total_alvo_ms: Number,
  },
  { _id: false },
);

const estatisticasFase3 = new mongoose.Schema(
  {
    usuario_id: {
      type: String,
      required: true,
    },
    experimento_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExperimentosFase3",
      required: true,
    },
    analise_por_alvo: [analisePorAlvoSchema],
    variabilidade_temporal_respostas_ms: Number,
    resumo_metricas: estatisticasResumoSchema,
    timestamp_analise: { type: Date, default: Date.now },
  },
  { collection: "estatisticas_fase_3" },
);

const EstatisticasFase3 = mongoose.model(
  "estatisticas_fase3",
  estatisticasFase3,
);
export default EstatisticasFase3;
