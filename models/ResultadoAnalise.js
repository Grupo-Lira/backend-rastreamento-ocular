import mongoose from 'mongoose';

const ResultadoAnaliseSchema = new mongoose.Schema({
    client_id: { type: String, required: true, unique: true },
    timestamp_analise: { type: Date, default: Date.now },
    
    // Métrica de Desempenho (média e DP do TR)
    estatisticas_resumo: {
        tempo_reacao_medio_ms: Number,
        tempo_reacao_desvio_padrao_ms: Number,
        total_acertos: Number,
        total_comissao: Number,
        total_omissao: Number,
    },
    
    // Resultados detalhados para cada alvo
    analise_por_alvo: [
        {
            alvo_indice: Number,
            motivo_servidor: String,
            resultado: String, // ACERTO, COMISSÃO, OMISSÃO
            tempo_reacao_ms: mongoose.Schema.Types.Mixed, // Pode ser Number ou "N/A"
            foco_maximo_ms: Number,
            desvio_maximo_ms: Number,
            tempo_total_focado_ms: Number,
            duracao_total_alvo_ms: Number,
        }
    ],
}, {
    collection: 'resultados_analise'
});

const ResultadoAnalise = mongoose.model('ResultadoAnalise', ResultadoAnaliseSchema);
export default ResultadoAnalise;