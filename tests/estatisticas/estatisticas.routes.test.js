import mongoose from "mongoose";
import request from "supertest";
import { registerUsuario } from "../../src/auth/service/authService.js";
import Pacientes from "../../src/models/Pacientes.js";
import EstatisticasFase1 from "../../src/models/EstatisticasFase1.js";
import Usuarios from "../../src/models/Usuarios.js";
import { app } from "../../src/server/server.js";

let token;

beforeEach(async () => {
  await registerUsuario({ email: "feedback@email.com", senha: "123456" });
  const response = await request(app).post("/api/auth/login").send({
    email: "feedback@email.com",
    senha: "123456",
  });
  token = response.body.token.trim();
});

test("salva feedback e nota profissional nas estatísticas da fase", async () => {
  const usuario = await Usuarios.findOne({ email: "feedback@email.com" });
  const paciente = await Pacientes.create({
    doutor_id: usuario._id,
    nome: "Paciente Feedback",
  });
  const experimentoId = new mongoose.Types.ObjectId();
  const estatisticas = await EstatisticasFase1.create({
    usuario_id: paciente._id,
    experimento_id: experimentoId,
    resumo_metricas: {},
  });

  const response = await request(app)
    .post("/api/estatisticas/feedback")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fase: 1,
      experimentoId: experimentoId.toString(),
      feedbackProfissional: "Manteve o foco durante a atividade.",
      notaDoProfissional: 4,
      modoTreinamento: true,
    });

  expect(response.status).toBe(200);

  const atualizado = await EstatisticasFase1.findById(estatisticas._id).lean();
  expect(atualizado.feedback_profissional).toBe(
    "Manteve o foco durante a atividade.",
  );
  expect(atualizado.nota_do_profissional).toBe(4);
  expect(atualizado.modo_treinamento).toBe(true);
});
