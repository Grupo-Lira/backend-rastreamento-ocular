import mongoose from "mongoose";

const parametrosSchema = new mongoose.Schema({
  omissaoSeqLimite: { type: Number, required: true, default: 8 },
  focoSeqNecessario: { type: Number, required: true, default: 5 },
  hitBoxExtraPx: { type: Number, required: true, default: 50 },
});

const Parametros = mongoose.model("parametros_fase1", parametrosSchema);

export default Parametros;
