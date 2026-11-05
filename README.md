# FocusQuest Backend

Backend do FocusQuest responsável pela API REST, autenticação, pacientes, experimentos em tempo real das três fases, persistência de métricas, integração com Arduino e geração de relatórios PDF.

## Stack

- Node.js `>=20.19.0`, JavaScript ESM e Express 5
- Socket.IO 4
- MongoDB 7 com Mongoose 9
- Redis 7 com ioredis
- JWT e bcryptjs
- Puppeteer para PDF
- SerialPort para Arduino
- Swagger/OpenAPI para a API REST

## Estrutura principal

```text
.
├── app.js                  # bootstrap, conexões e listen
├── env.config.js           # carrega .env.<ENV>
├── compose.yml             # MongoDB e Redis locais
├── src/
│   ├── auth/               # login, cadastro, logout e JWT
│   ├── database/           # MongoDB e Redis
│   ├── docs/               # configuração Swagger
│   ├── fase1/              # foco sustentado
│   ├── fase2/              # atenção seletiva e Arduino
│   ├── fase3/              # atenção alternada
│   ├── models/             # schemas Mongoose
│   ├── pacientes/          # CRUD de pacientes
│   ├── relatorios/         # métricas e PDF
│   ├── server/             # Express e Socket.IO
│   └── usuarios/           # perfil do usuário
└── tests/                  # Jest, Supertest e bancos efêmeros
```

Consulte [ARCHITECTURE.md](ARCHITECTURE.md) para fluxos e responsabilidades e [docs/REALTIME.md](docs/REALTIME.md) para o contrato Socket.IO.

## Desenvolvimento local

Pré-requisitos: Node.js `>=20.19.0`, npm, MongoDB e Redis. Para variáveis e Docker, consulte [DEVELOPMENT.md](DEVELOPMENT.md).

Instale as dependências:

```bash
npm ci
```

Inicie MongoDB e Redis locais com o mesmo `.env.development` usado pela aplicação:

```bash
npm run infra:up
```

O Compose deste repositório contém apenas esses dois serviços. Use `npm run infra:down` para encerrá-los e `npm run infra:logs` para acompanhar os logs.

Inicie o backend:

```bash
npm run dev
```

Por padrão, o servidor fica em `http://localhost:4000`.

## Comandos principais

```bash
npm run dev                         # desenvolvimento, ENV=development
npm start                           # produção, ENV=production
npm test                            # suíte Jest completa
npm test -- tests/app.test.js       # um arquivo de teste
npm run format:check                # verifica Prettier
npm run format                      # aplica Prettier
npm run infra:up                    # inicia MongoDB e Redis em background
npm run infra:down                  # encerra MongoDB e Redis
npm run infra:logs                  # acompanha logs da infraestrutura
```

Não existe etapa de build do JavaScript. A imagem de produção pode ser construída com `docker build .`.

## Configuração

`env.config.js` carrega `.env.${ENV}` e usa `development` por padrão. Copie `.env.example` para `.env.development` e ajuste os valores locais. Principais variáveis:

- `SERVER_PORT`
- `MONGO_URI`
- `REDIS_HOSTNAME`, `REDIS_PORT`, `REDIS_PASSWORD`
- `JWT_SECRET`, `JWT_EXPIRACAO`
- `FRONTEND_ORIGINS`
- `ARDUINO_ENABLED`
- `ML_SERVICE_URL`, `ML_SERVICE_TIMEOUT_MS`

Não registre valores reais. A avaliação é tratada como serviço externo; seus detalhes internos não fazem parte deste guia.

## API e saúde

- Healthcheck: `GET /api/health`
- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/docs.json`

Rotas REST principais:

- `/api/auth`
- `/api/usuarios`
- `/api/pacientes`
- `/api/relatorios/pdf/:id`

Usuários, pacientes, relatórios e logout usam Bearer JWT. Socket.IO ainda não aplica autenticação JWT; veja [ARCHITECTURE.md](ARCHITECTURE.md).

## Testes e qualidade

Os testes usam MongoDB em memória e Redis mockado; não devem acessar bancos de desenvolvimento ou produção. A cobertura atual inclui healthcheck e rotas de pacientes.

O backend usa Prettier, mas não possui ESLint. Há violações de formatação preexistentes; evite reformatação ampla junto de mudanças funcionais.

## Orientações para agentes

Agentes de código devem ler [AGENTS.md](AGENTS.md) antes de modificar o repositório.
