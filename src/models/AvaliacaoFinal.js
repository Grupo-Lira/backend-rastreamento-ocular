import mongoose from "mongoose";

const AvaliacaoFinalSchema = new mongoose.Schema(
  {
    usuario_id: { type: String, required: true },
    experimento_fase1_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExperimentosFase1",
      required: false,
    },
    experimento_fase2_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExperimentosFase2",
      required: false,
    },
    experimento_fase3_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExperimentosFase3",
      required: true,
    },
    avaliacao: {
      type: String,
      enum: ["positive", "negative"],
      required: true,
    },
    score: { type: Number, required: true },
    features: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  {
    collection: "avaliacoes_finais",
    timestamps: true,
  },
);

const AvaliacaoFinal = mongoose.model("AvaliacaoFinal", AvaliacaoFinalSchema);

export default AvaliacaoFinal;
