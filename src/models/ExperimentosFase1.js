import mongoose from "mongoose";

const historicoOlharSchema = new mongoose.Schema(
  {
    is_focando: Boolean,
    timestamp: { type: Date, default: Date.now },
    alvo_indice: Number,
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
  },
  { _id: false },
);

const resultadoAlvoSchema = new mongoose.Schema(
  {
    alvo_indice: Number,
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

const ExperimentosFase1Schema = new mongoose.Schema(
  {
    client_id: { type: String, required: true },
    data_hora: { type: Date, default: Date.now },
    historico_olhar: [historicoOlharSchema],
    resultados_alvos: [resultadoAlvoSchema],
  },
  { collection: "experimentos_fase_1" },
);

const ExperimentosFase1 = mongoose.model(
  "ExperimentosFase1",
  ExperimentosFase1Schema,
);
export default ExperimentosFase1;
