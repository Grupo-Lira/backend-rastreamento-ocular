import mongoose from "mongoose";

// histórico de cada olhar 
const historicoOlharSchema = new mongoose.Schema(
  {
    is_focando: Boolean,
    timestamp: { type: Date, default: Date.now },
    nome_alvo: {
      type: String, 
      enum: ["ESTRELA", "RADAR"],
      required: true,
    },
    olhar_coord: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    tipo: {
      type: String,
      enum: [
        "DESVIO_COMISSAO",
        "DESVIO_OMISSAO",
        "FOCO_FINALIZADO",
        "FOCANDO",
        "DESFOCANDO",
        "INDETERMINADO",
      ],
      default: "INDETERMINADO",
    },
    lado_tela: {
      type: String,
      enum: ["ESQUERDO", "DIREITO"],
      required: false,
    },
  },
  { _id: false },
);

// resultado de cada alvo apresentado
const resultadoAlvoSchema = new mongoose.Schema(
  {
    nome_alvo: {
      type: String, 
      enum: ["ESTRELA", "RADAR"],
      required: true,
    },
    motivo_termino: {
      type: String,
      enum: ["FOCOU", "TEMPO"],
      required: true,
    },
    tempo_inicio_alvo: { type: Date, default: Date.now },
    tempo_fim_alvo: { type: Date, default: Date.now },
  },
  { _id: false },
);

// experimentos são nada mais nada menos que um histórico de dados de olhar + resultados dos alvos para cada cliente
const ExperimentosFase3Schema = new mongoose.Schema(
  {
    client_id: { type: String, required: true },
    data_hora: { type: Date, default: Date.now },
    historico_olhar: [historicoOlharSchema],
    resultados_alvos: [resultadoAlvoSchema],
  },
  { collection: "experimentos_fase_3" },
);

const ExperimentosFase3 = mongoose.model(
  "ExperimentosFase3",
  ExperimentosFase3Schema,
);
export default ExperimentosFase3;
