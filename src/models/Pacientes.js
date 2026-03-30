import mongoose from "mongoose";

const PacientesSchema = new mongoose.Schema(
	{
		doutor_id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Doutores",
			required: true,
		},
		nome: { type: String, required: true },
		data_nascimento: { type: Date },
		sexo: { type: String },
		escolaridade: { type: String },
		observacoes: { type: String },
		criado_em: { type: Date, default: Date.now },
	},
	{ collection: "pacientes" },
);

const Pacientes = mongoose.model("Pacientes", PacientesSchema);

export default Pacientes;
