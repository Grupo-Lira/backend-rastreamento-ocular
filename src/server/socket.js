import { registrarFase2Handlers } from "../fase2/handler/fase2.handler.js";
import { registrarFase1Handlers } from "../fase_1/handler/fase1.handler.js";
import { io } from "./server.js";

io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);

  registrarFase1Handlers(socket);
  registrarFase2Handlers(socket);

  socket.on("ping", () => {
    socket.emit("pong");
  });
});

io.on("disconnect", (socket) => {
  console.log("❌ Cliente desconectado:", socket.id);
});
