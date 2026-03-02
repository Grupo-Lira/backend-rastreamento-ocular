// Dados.js (ou models/DadosModel.js)
import mongoose from 'mongoose';

const dadosSchema = new mongoose.Schema({
    client_id: { type: String, required: true },
    data_hora: { type: Date, default: Date.now },
    fase: { type: Number, required: true },
    
    historico_olhar_fase1: [{ 
        estado: Number,         // 0: Fora do alvo, 1: Olhando o alvo
        timestamp: Number,      // Timestamp da Mudança de estado (para calcular TR e Foco Contínuo)
        alvo_indice: Number
    }],
    
    resultados_alvos_fase1: [{
        alvo_indice: Number,
        motivo_termino: String, // EX: "FOCO_COMPLETO" ou "TEMPO_ESGOTADO" <--- DADO BRUTO ESSENCIAL
        tempo_inicio_alvo: Number,
        tempo_fim_alvo: Number
    }],
});

const Dados = mongoose.model('DadosExperimento', dadosSchema);

export default Dados; 
// Certifique-se de usar `export default` se estiver usando ES Modules (import/export)