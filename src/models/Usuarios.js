import mongoose from "mongoose";

const UsuariosSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    especialidade: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    senha: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["ADMIN", "DOUTOR"],
      default: "DOUTOR",
    },
    pacientes_ids: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Pacientes",
          },
        ],
    criado_em: { type: Date, default: Date.now },
  },
  { collection: "usuarios" },
);

UsuariosSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.senha;
    return ret;
  },
});

const Usuarios = mongoose.model("Usuarios", UsuariosSchema);

export default Usuarios;
