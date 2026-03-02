import mongoose from "mongoose";

const rodadaSchema = new mongoose.Schema(
  {
    rodada1: [{ type: Number }],
    rodada2: [{ type: Number }],
  },
  { _id: false },
);

const ExperimentosFase2Schema = new mongoose.Schema(
  {
    client_id: { type: String, required: true },
    data_hora: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["RODADA1", "RODADA2", "FINALIZADO"],
      default: "EM_EXECUCAO",
    },
    acertos: Number,
    planetas_vistos: Number,
    planetas_ignorados: Number,
    gabarito: {
      type: rodadaSchema,
      required: true,
    },
    respostas: {
      type: rodadaSchema,
      required: true,
    },
  },
  { collection: "experimentos_fase_2" },
);

const DadosExperimentosFase2 = mongoose.model(
  "experimentos_fase2",
  ExperimentosFase2Schema,
);
export default DadosExperimentosFase2;
