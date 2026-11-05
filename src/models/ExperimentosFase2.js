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
    modo_treinamento: { type: Boolean, default: false },
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
    feedback_profissional: { type: String, default: "" },
    nota_do_profissional: { type: Number, min: 0, max: 5, default: null },
    controle_jogo: {
      type: String,
      enum: ["CONTROLE_ARDUINO", "CONTROLE_MOUSE"],
      default: "CONTROLE_MOUSE",
    },
  },
  { collection: "experimentos_fase_2" },
);

const DadosExperimentosFase2 = mongoose.model(
  "experimentos_fase2",
  ExperimentosFase2Schema,
);
export default DadosExperimentosFase2;
