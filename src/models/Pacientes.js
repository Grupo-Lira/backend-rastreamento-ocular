import mongoose from "mongoose";

const PacientesSchema = new mongoose.Schema(
	{
		doutor_id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Usuarios",
			required: true,
		},
		nome: { type: String, required: true },
		rg: { type: String },
		motivo_avaliacao: { type: String },
		data_nascimento: { type: String },
		data_avaliacao: { type: String },
		sexo: { type: String },
		escolaridade: { type: String },
		observacoes: { type: String },
		criado_em: { type: Date, default: Date.now },
	},
	{ collection: "pacientes" },
);

const Pacientes = mongoose.model("Pacientes", PacientesSchema);

export default Pacientes;
