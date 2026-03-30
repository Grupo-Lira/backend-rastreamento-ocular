import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

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
            email: { type: "string", example: "admin@empresa.com" },
            senha: { type: "string", example: "123456" },
          },
        },
        RegisterRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "novo@empresa.com" },
            senha: { type: "string", example: "123456" },
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
            nome: { type: "string", example: "Dra. Ana Souza" },
            email: { type: "string", example: "ana.nova@clinica.com" },
            telefone: { type: "string", example: "11888888888" },
            especialidade: { type: "string", example: "Neuroftalmologia" },
          },
        },
        UpdateUserRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "user@empresa.com" },
          },
        },
        CreatePacienteRequest: {
          type: "object",
          required: ["nome"],
          properties: {
            nome: { type: "string", example: "Carlos Silva" },
            data_nascimento: {
              type: "string",
              format: "date-time",
              example: "1998-06-25T00:00:00.000Z",
            },
            sexo: { type: "string", example: "M" },
            escolaridade: { type: "string", example: "Ensino Superior" },
            observacoes: {
              type: "string",
              example: "Paciente com sensibilidade a luz forte.",
            },
          },
        },
        UpdatePacienteRequest: {
          type: "object",
          properties: {
            nome: { type: "string", example: "Carlos Silva Junior" },
            data_nascimento: {
              type: "string",
              format: "date-time",
              example: "1998-06-25T00:00:00.000Z",
            },
            sexo: { type: "string", example: "M" },
            escolaridade: { type: "string", example: "Pos-graduacao" },
            observacoes: {
              type: "string",
              example: "Atualizado em consulta recente.",
            },
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
            201: { description: "Usuario criado" },
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
            200: { description: "Token JWT" },
          },
        },
      },
      "/api/doutores": {
        post: {
          tags: ["Doctors"],
          summary: "Create my doctor profile",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateDoctorProfileRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Perfil de doutor criado" },
            400: { description: "Campos obrigatorios faltando" },
            409: { description: "Usuario ja tem um perfil de doutor" },
          },
        },
        get: {
          tags: ["Doctors"],
          summary: "Get all doctors (admin only)",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Lista de doutores" } },
        },
      },
      "/api/doutores/me": {
        get: {
          tags: ["Doctors"],
          summary: "Get my profile",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Perfil do doutor" } },
        },
        put: {
          tags: ["Doctors"],
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
      },
      "/api/doutores/{id}": {
        get: {
          tags: ["Doctors"],
          summary: "Get doctor by id (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Doutor" } },
        },
        delete: {
          tags: ["Doctors"],
          summary: "Delete doctor (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 204: { description: "Doutor removido" } },
        },
      },
      "/api/usuarios": {
        get: {
          tags: ["Users"],
          summary: "Get all users (admin only)",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Lista de usuarios" } },
        },
      },
      "/api/usuarios/{id}": {
        put: {
          tags: ["Users"],
          summary: "Update user (admin only)",
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
                schema: { $ref: "#/components/schemas/UpdateUserRequest" },
              },
            },
          },
          responses: { 200: { description: "Usuario atualizado" } },
        },
        delete: {
          tags: ["Users"],
          summary: "Delete user (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 204: { description: "Usuario removido" } },
        },
      },
      "/api/pacientes": {
        post: {
          tags: ["Pacientes"],
          summary: "Criar paciente para o doutor logado",
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
            409: { description: "Paciente com mesmo nome ja existe" },
          },
        },
        get: {
          tags: ["Pacientes"],
          summary: "Listar meus pacientes",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Lista de pacientes do doutor logado" },
          },
        },
      },
      "/api/pacientes/{nome}": {
        get: {
          tags: ["Pacientes"],
          summary: "Buscar paciente por nome",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "nome",
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
          summary: "Editar paciente por nome",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "nome",
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
            404: { description: "Paciente nao encontrado" },
            409: { description: "Ja existe outro paciente com este nome" },
          },
        },
        delete: {
          tags: ["Pacientes"],
          summary: "Deletar paciente por nome",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "nome",
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

