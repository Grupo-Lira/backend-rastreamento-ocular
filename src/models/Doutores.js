import mongoose from "mongoose";

const DoutoresSchema = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuarios",
      required: true,
      unique: true,
    },
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    especialidade: { type: String, required: true },
    pacientes_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pacientes",
      },
    ],
    criado_em: { type: Date, default: Date.now },
  },
  { collection: "doutores" },
);

const Doutores = mongoose.model("Doutores", DoutoresSchema);

export default Doutores;
