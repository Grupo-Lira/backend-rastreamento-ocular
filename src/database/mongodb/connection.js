import mongoose from "mongoose";

async function connectMongo() {
  try {
    const MONGODB_URI =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rastreamento-ocular";

    await mongoose.connect(MONGODB_URI);
    console.info("Conectado ao Banco de Dados MongoDB!");
  } catch (err) {
    console.error("Erro ao conectar ao MongoDB:", err);
    process.exit(1);
  }
}

export default connectMongo;
