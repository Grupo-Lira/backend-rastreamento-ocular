import mongoose from "mongoose";

const UsuariosSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    senha: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["ADMIN", "DOUTOR"],
      default: "DOUTOR",
    },
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
