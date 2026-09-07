import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer;

export async function connectTestMongo() {
  mongoServer = await MongoMemoryServer.create();

  const uri = mongoServer.getUri();

  await mongoose.connect(uri);

  console.info("Mongo Memory conectado.");
}

export async function disconnectTestMongo() {
  await mongoose.connection.dropDatabase();

  await mongoose.connection.close();

  await mongoServer.stop();

  console.info("Mongo Memory encerrado.");
}

export async function clearDatabase() {
  const collections = mongoose.connection.collections;

  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
}
