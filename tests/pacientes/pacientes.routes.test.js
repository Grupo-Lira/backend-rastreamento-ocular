import mongoose from "mongoose";
import request from "supertest";
import { registerUsuario } from "../../src/auth/service/authService.js";
import Pacientes from "../../src/models/Pacientes.js";
import Usuarios from "../../src/models/Usuarios.js";
import { create } from "../../src/pacientes/service/pacienteService.js";
import { app } from "../../src/server/server.js";
let token;

beforeEach(async () => {
  await registerUsuario({
    email: "admin@email.com",
    senha: "123456",
  });

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: "admin@email.com",
      senha: "123456",
    });

  token = response.body.token.trim();
});

// Get Pacientes [/api/pacientes]
test("Get /api/pacientes - Deve retornar 200 e uma lista de pacientes", async () => {
  const response = await request(app)
    .get("/api/pacientes")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty("data");
  expect(Array.isArray(response.body.data)).toBe(true);
});

// Get Paciente by ID [/api/pacientes/:id]
test("Get /api/pacientes/:id - Deve retornar 404 para paciente não encontrado", async () => {
  const idFicticio = new mongoose.Types.ObjectId().toString();

  const response = await request(app)
    .get(`/api/pacientes/${idFicticio}`) // ID fictício
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(404);
  expect(response.body).toHaveProperty("error");
});

test("Get /api/pacientes/:id - Deve retornar 200 para paciente encontrado", async () => {
  const usuario = await Usuarios.findOne({ email: "admin@email.com" });
  const paciente = await create(usuario._id, {
    nome: "Paciente Teste",
    rg: "123456789",
    motivo_avaliacao: "Motivo de teste",
    data_nascimento: new Date("1990-01-01"),
    data_avaliacao: new Date(),
    sexo: "Masculino",
    escolaridade: "Ensino Médio",
  });

  const response = await request(app)
    .get(`/api/pacientes/${paciente._id}`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty("data");
  expect(response.body.data.nome).toBe("Paciente Teste");
});

// Post Paciente [/api/pacientes]
test("Post /api/pacientes - Deve retornar 201 para paciente criado com sucesso", async () => {
  const response = await request(app)
    .post("/api/pacientes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      nome: "Novo Paciente",
      rg: "987654321",
      motivo_avaliacao: "Motivo de teste",
      data_nascimento: new Date("1995-05-05"),
      data_avaliacao: new Date(),
      sexo: "Feminino",
      escolaridade: "Ensino Superior",
    });

  expect(response.status).toBe(201);

  const paciente = await Pacientes.findOne({ rg: "987654321" });

  expect(paciente).not.toBeNull();
  expect(paciente.nome).toBe("Novo Paciente");
});

// Put Paciente [/api/pacientes/:id]
test("Put /api/pacientes/:id - Deve retornar 200 para paciente atualizado com sucesso", async () => {
   const response = await request(app)
    .post("/api/pacientes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      nome: "Novo Paciente",
      rg: "987654321",
      motivo_avaliacao: "Motivo de teste",
      data_nascimento: new Date("1995-05-05"),
      data_avaliacao: new Date(),
      sexo: "Feminino",
      escolaridade: "Ensino Superior",
    });

  expect(response.status).toBe(201);

  const paciente = await Pacientes.findOne({ rg: "987654321" });
  expect(paciente).not.toBeNull();
  expect(paciente.nome).toBe("Novo Paciente");

  const updateResponse = await request(app)
    .put(`/api/pacientes/${paciente._id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      nome: "Paciente Atualizado",
      rg: "987654321",
      motivo_avaliacao: "Motivo atualizado",
      data_nascimento: new Date("1995-05-05"),
      data_avaliacao: new Date(),
      sexo: "Feminino",
      escolaridade: "Ensino Superior",
    });

  expect(updateResponse.status).toBe(200);

  const updatedPaciente = await Pacientes.findById(paciente._id);
  expect(updatedPaciente.nome).toBe("Paciente Atualizado");
  expect(updatedPaciente.motivo_avaliacao).toBe("Motivo atualizado");
});

// Delete Paciente [/api/pacientes/:id]
test("Delete /api/pacientes/:id - Deve retornar 200 para paciente deletado com sucesso", async () => {
  const response = await request(app)
    .post("/api/pacientes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      nome: "Paciente a ser deletado",
      rg: "111222333",
      motivo_avaliacao: "Motivo de teste",
      data_nascimento: new Date("1995-05-05"),
      data_avaliacao: new Date(),
      sexo: "Feminino",
      escolaridade: "Ensino Superior",
    });

  expect(response.status).toBe(201);

  const paciente = await Pacientes.findOne({ rg: "111222333" });
  expect(paciente).not.toBeNull();
  expect(paciente.nome).toBe("Paciente a ser deletado");

  const deleteResponse = await request(app)
    .delete(`/api/pacientes/${paciente._id}`)
    .set("Authorization", `Bearer ${token}`);

  expect(deleteResponse.status).toBe(204);

  const deletedPaciente = await Pacientes.findById(paciente._id);
  expect(deletedPaciente).toBeNull();
});

