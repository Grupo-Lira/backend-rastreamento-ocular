import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const EXEMPLO_USUARIO = {
  nome: "Dra. Ana",
  telefone: "11999999999",
  especialidade: "Neurologia",
  email: "novo@empresa.com",
  senha: "123456",
};

const EXEMPLO_PACIENTE = {
  nome: "Carlos Silva",
  rg: "123456789",
  motivo_avaliacao:
    "Monitoramento do desempenho cognitivo pós-treinamento e verificação de fadiga atencional.",
  data_nascimento: "27/04/2016",
  data_avaliacao: "23/04/2026",
  sexo: "M",
  escolaridade: "Ensino fundamental",
  observacoes: "Paciente com sensibilidade a luz forte.",
};

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Rastreamento Ocular API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Servidor local",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        LoginRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: EXEMPLO_USUARIO.email },
            senha: { type: "string", example: EXEMPLO_USUARIO.senha },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["nome", "telefone", "especialidade", "email", "senha"],
          properties: {
            nome: { type: "string", example: EXEMPLO_USUARIO.nome },
            telefone: { type: "string", example: EXEMPLO_USUARIO.telefone },
            especialidade: {
              type: "string",
              example: EXEMPLO_USUARIO.especialidade,
            },
            email: { type: "string", example: EXEMPLO_USUARIO.email },
            senha: { type: "string", example: EXEMPLO_USUARIO.senha },
          },
        },
        AuthTokenResponse: {
          type: "object",
          properties: {
            token: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
          },
        },
        LogoutResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Logout realizado com sucesso.",
            },
          },
        },
        CreateDoctorProfileRequest: {
          type: "object",
          properties: {
            nome: { type: "string", example: "Dra. Ana" },
            telefone: { type: "string", example: "11999999999" },
            especialidade: { type: "string", example: "Neurologia" },
          },
        },
        UpdateDoctorRequest: {
          type: "object",
          properties: {
            nome: { type: "string", example: EXEMPLO_USUARIO.nome },
            email: { type: "string", example: EXEMPLO_USUARIO.email },
            telefone: { type: "string", example: EXEMPLO_USUARIO.telefone },
            especialidade: {
              type: "string",
              example: EXEMPLO_USUARIO.especialidade,
            },
          },
        },
        CreatePacienteRequest: {
          type: "object",
          required: ["nome"],
          properties: {
            nome: { type: "string", example: EXEMPLO_PACIENTE.nome },
            rg: { type: "string", example: EXEMPLO_PACIENTE.rg },
            motivo_avaliacao: {
              type: "string",
              example: EXEMPLO_PACIENTE.motivo_avaliacao,
            },
            data_nascimento: {
              type: "string",
              description: "Data de nascimento (ISO 8601 ou dd/mm/yyyy)",
              example: "27/04/2016",
            },
            data_avaliacao: {
              type: "string",
              description: "Data de avaliação (ISO 8601 ou dd/mm/yyyy)",
              example: "23/04/2026",
            },
            sexo: { type: "string", example: EXEMPLO_PACIENTE.sexo },
            escolaridade: {
              type: "string",
              example: EXEMPLO_PACIENTE.escolaridade,
            },
          },
        },
        UpdatePacienteRequest: {
          type: "object",
          properties: {
            nome: { type: "string", example: EXEMPLO_PACIENTE.nome },
            rg: { type: "string", example: EXEMPLO_PACIENTE.rg },
            motivo_avaliacao: {
              type: "string",
              example: EXEMPLO_PACIENTE.motivo_avaliacao,
            },
            data_nascimento: {
              type: "string",
              description: "Data de nascimento (ISO 8601 ou dd/mm/yyyy)",
              example: "27/04/2016",
            },
            data_avaliacao: {
              type: "string",
              description: "Data de avaliação (ISO 8601 ou dd/mm/yyyy)",
              example: "23/04/2026",
            },
            sexo: { type: "string", example: EXEMPLO_PACIENTE.sexo },
            escolaridade: {
              type: "string",
              example: EXEMPLO_PACIENTE.escolaridade,
            },
            observacoes: {
              type: "string",
              description:
                "Observações do doutor (adicionadas após a conclusão das 3 fases)",
              example: EXEMPLO_PACIENTE.observacoes,
            },
          },
        },
        RelatorioPacienteData: {
          type: "object",
          properties: {
            nomePaciente: { type: "string", example: EXEMPLO_PACIENTE.nome },
            dataAvaliacaoPaciente: { type: "string", example: "23/04/2026" },
            sexo: { type: "string", example: EXEMPLO_PACIENTE.sexo },
            escolaridade: {
              type: "string",
              example: EXEMPLO_PACIENTE.escolaridade,
            },
            motivoAvaliacao: {
              type: "string",
              example: EXEMPLO_PACIENTE.motivo_avaliacao,
            },
            dataNascimento: { type: "string", example: "27/04/2016" },
            tempoReacao: { type: "string", example: "0:15" },
            variabilidadeTemporalRespostas: {
              type: "string",
              example: "13.49%",
            },
            acertos: { type: "number", example: 9 },
            errosOmissao: { type: "number", example: 2 },
            errosComissao: { type: "number", example: 1 },
            observacoes: {
              type: "string",
              example: EXEMPLO_PACIENTE.observacoes,
            },
            dadosComparativos: {
              type: "array",
              items: { $ref: "#/components/schemas/DadoComparativo" },
              example: [
                { idade: 10, mediaAcertos: 8.0 },
                { idade: 11, mediaAcertos: 7.5 },
                { idade: 12, mediaAcertos: 9.2 }
              ]
            }
          },
        },
        RelatorioPacienteDataResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/RelatorioPacienteData" },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            200: {
              description: "Aplicacao ativa",
            },
          },
        },
      },
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Usuário criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthTokenResponse" },
                },
              },
            },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Token JWT",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthTokenResponse" },
                },
              },
            },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Logout realizado com sucesso",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LogoutResponse" },
                },
              },
            },
            401: { description: "Token inválido ou expirado" },
          },
        },
      },
      "/api/usuarios": {
        get: {
          tags: ["Users"],
          summary: "Get my profile",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Perfil do usuário" } },
        },
        put: {
          tags: ["Users"],
          summary: "Update my profile",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateDoctorRequest" },
              },
            },
          },
          responses: { 200: { description: "Perfil atualizado" } },
        },
        delete: {
          tags: ["Users"],
          summary: "Delete my profile",
          security: [{ bearerAuth: [] }],
          responses: { 204: { description: "Perfil removido" } },
        },
      },
      "/api/pacientes": {
        post: {
          tags: ["Pacientes"],
          summary: "Criar paciente ",
          description:
            "Cria um novo paciente. Observações devem ser adicionadas após a conclusão das 3 fases via PUT.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreatePacienteRequest" },
              },
            },
          },
          responses: {
            201: { description: "Paciente criado" },
            400: { description: "Dados inválidos" },
            409: { description: "Paciente com mesmo RG ja existe" },
          },
        },
        get: {
          tags: ["Pacientes"],
          summary: "Listar meus pacientes",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Lista de pacientes do usuario logado" },
          },
        },
      },
      "/api/pacientes/{id}": {
        get: {
          tags: ["Pacientes"],
          summary: "Buscar paciente por ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Paciente encontrado" },
            404: { description: "Paciente nao encontrado" },
          },
        },
        put: {
          tags: ["Pacientes"],
          summary: "Editar paciente",
          description:
            "Atualiza dados do paciente. ⚠️ Observações só podem ser adicionadas após a conclusão das 3 fases. Retorna 403 se tentar adicionar observações antes disso.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdatePacienteRequest" },
              },
            },
          },
          responses: {
            200: { description: "Paciente atualizado" },
            400: { description: "Nenhum campo valido informado" },
            403: {
              description:
                "Observações só podem ser adicionadas após conclusão das 3 fases",
            },
            404: { description: "Paciente nao encontrado" },
            409: { description: "Ja existe outro paciente com este RG" },
          },
        },
        delete: {
          tags: ["Pacientes"],
          summary: "Deletar paciente por ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            204: { description: "Paciente removido" },
            404: { description: "Paciente nao encontrado" },
          },
        },
      },
      "/api/relatorios/{id}/": {
        get: {
          tags: ["Relatorios"],
          summary: "Obter dados do relatorio de um paciente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID do paciente",
            },
          ],
          responses: {
            200: {
              description: "Dados do relatorio retornados com sucesso",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/RelatorioPacienteDataResponse",
                  },
                },
              },
            },
            400: { description: "ID invalido" },
            401: { description: "Nao autenticado" },
            404: { description: "Paciente nao encontrado" },
            500: { description: "Erro interno" },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {}));
  app.get("/api/docs.json", (_req, res) => {
    res.status(200).json(swaggerSpec);
  });
};

export { setupSwagger };

