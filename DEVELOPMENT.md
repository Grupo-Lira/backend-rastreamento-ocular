# Desenvolvimento do backend

## Requisitos

- Node.js `>=20.19.0`; Docker e CI usam Node 20.
- npm e o `package-lock.json` versionado.
- MongoDB e Redis para executar a aplicação.
- Docker com Compose, opcional, para serviços locais.
- Chromium compatível com Puppeteer para relatórios.
- Hardware/driver serial apenas para o modo Arduino da fase 2.

O README antigo indicava Node 18+, incompatível com os engines das dependências atuais.

## Instalação

Use instalação determinística em automações e worktrees limpas:

```bash
npm ci
```

Use `npm install` somente quando a tarefa deliberadamente permitir atualizar o lockfile. Não altere dependências como efeito colateral.

## Variáveis de ambiente

`env.config.js` lê `.env.${ENV}` e usa `.env.development` quando `ENV` está ausente.

| Variável                | Uso                                 | Fallback                                        |
| ----------------------- | ----------------------------------- | ----------------------------------------------- |
| `ENV`                   | Seleciona `.env.<ambiente>`         | `development`                                   |
| `SERVER_PORT`           | Porta HTTP/Socket.IO                | `4000`                                          |
| `MONGO_URI`             | URI MongoDB                         | `mongodb://127.0.0.1:27017/rastreamento-ocular` |
| `REDIS_HOSTNAME`        | Host Redis                          | não definido                                    |
| `REDIS_PORT`            | Porta Redis                         | não definido                                    |
| `REDIS_PASSWORD`        | Senha Redis                         | não definido                                    |
| `JWT_SECRET`            | Assinatura/verificação JWT          | obrigatório na prática                          |
| `JWT_EXPIRACAO`         | Expiração do JWT                    | obrigatório na prática                          |
| `FRONTEND_ORIGINS`      | Origens HTTP, separadas por vírgula | `http://localhost:3000`                         |
| `ARDUINO_ENABLED`       | Ativa a porta serial                | `true`                                          |
| `ML_SERVICE_URL`        | Base da avaliação externa           | `http://localhost:8000`                         |
| `ML_SERVICE_TIMEOUT_MS` | Timeout dessa integração            | `4000`                                          |

Não copie valores reais para documentação, logs ou commits. Use `.env.example` como modelo e mantenha `.env.development` somente no ambiente local. O arquivo de desenvolvimento ainda aparece no histórico atual do repositório; removê-lo do controle de versão e rotacionar eventuais credenciais deve ser uma operação deliberada, sem apagar a cópia local. `.env.test` deve conter somente valores seguros para testes.

## Execução local

Crie a configuração local a partir do exemplo sanitizado:

```bash
cp .env.example .env.development
```

Ajuste os valores e inicie os serviços de `compose.yml`:

```bash
npm run infra:up
```

O script executa `docker compose --env-file .env.development up -d`. Assim, o mesmo arquivo abastece a interpolação do Compose e os containers. O Compose contém somente `mongo` e `redis`.

Comandos de ciclo de vida:

```bash
npm run infra:logs
npm run infra:down
```

Em outro terminal:

```bash
npm run dev
```

Pontos padrão:

- API e Socket.IO: `http://localhost:4000`
- Healthcheck: `http://localhost:4000/api/health`
- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/docs.json`

O processo tenta conectar MongoDB e Redis até 10 vezes, com intervalo de 3 segundos. Falha permanente encerra a aplicação.

Sem hardware serial, use `ARDUINO_ENABLED=false`. O Arduino só é inicializado quando a fase 2 seleciona esse controle.

## Produção e Docker

```bash
npm start
```

O comando define `ENV=production` e tenta carregar `.env.production`. Em implantação, prefira injetar variáveis no runtime.

```bash
docker build .
```

O `Dockerfile` usa Node 20 Bookworm Slim, inclui bibliotecas para Chromium, remove dependências de desenvolvimento e expõe 4000. Não existe `npm run build`; JavaScript ESM executa diretamente.

`Dockerfile.local` define `ENV=docker`, mas `.dockerignore` exclui `.env*`. Injete as variáveis no container em vez de esperar um `.env.docker` na imagem.

## Testes

```bash
npm test
npm test -- tests/app.test.js
npm test -- tests/pacientes/pacientes.routes.test.js
```

Jest roda em Node, em série e com módulos ESM experimentais. A infraestrutura global:

- carrega `.env.test`;
- inicia MongoDB efêmero com `mongodb-memory-server`;
- substitui ioredis por `ioredis-mock`;
- limpa collections após cada teste;
- encerra recursos ao final.

MongoDB em memória precisa abrir porta local. Sandboxes podem produzir `listen EPERM` sem indicar defeito no código.

Estado verificado na criação desta documentação: 2 suítes e 7 testes aprovados. A cobertura se limita ao healthcheck e às rotas de pacientes; não assuma cobertura de auth completa, usuários, sockets, fases, relatórios ou integrações.

## Formatação e qualidade

```bash
npm run format:check
npm run format
```

Os dois scripts usam Prettier; o segundo modifica arquivos. Não há ESLint no backend. O check possui violações preexistentes, então evite reformatação global junto de alterações funcionais.

O CI usa Node 20, `npm ci` e `npm test`. Ele não executa Prettier nem Docker build.

## Arquivos gerados e limitações

- PDFs são mantidos em `relatorios/` após o envio; não os versione.
- O Compose não inicia o backend nem a avaliação externa.
- A porta serial está fixa como `COM13`.
- Não há migrations no repositório.
- Não há testes automatizados de Socket.IO.
- Socket.IO não autentica JWT.
- Logging usa `console`, sem estrutura central.
- Não existe endpoint `/eyetracking` neste backend.
