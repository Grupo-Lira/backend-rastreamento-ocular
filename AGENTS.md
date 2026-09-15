# AGENTS.md

## Escopo

Este repositório contém o backend do FocusQuest: API REST, comunicação Socket.IO das três fases, persistência de experimentos, relatórios PDF e integrações externas. Leia [ARCHITECTURE.md](ARCHITECTURE.md) antes de alterar fluxos de fase ou modelos e [docs/REALTIME.md](docs/REALTIME.md) antes de mudar eventos Socket.IO.

## Stack e inicialização

- Node.js ESM, com Node `>=20.19.0`.
- Express 5, Socket.IO 4, Mongoose 9/MongoDB e ioredis/Redis.
- `app.js` carrega `.env.${ENV}`, conecta MongoDB e Redis e inicia o servidor HTTP.
- A API usa `SERVER_PORT`, com fallback para `4000`.
- Não há etapa de compilação do backend.

## Onde alterar

- `src/server/`: Express, CORS, rotas e Socket.IO.
- `src/auth/`: JWT e blocklist de logout no Redis.
- `src/usuarios/`, `src/pacientes/`, `src/relatorios/`: módulos HTTP em `routes`, `handler` e `service`.
- `src/fase1/`, `src/fase2/`, `src/fase3/`: eventos e regras das fases.
- `src/database/redis/redisHandlers.js`: estado efêmero das fases 1 e 3.
- `src/models/`: schemas e collections MongoDB.
- `src/dto/`: tradução entre contratos HTTP e persistência.
- `tests/`: Jest/Supertest e infraestrutura de teste.

## Comandos

```bash
npm ci
npm run dev
npm start
npm test
npm test -- tests/app.test.js
npm run format:check
npm run format
npm run infra:up
npm run infra:down
```

`format:check` verifica o Prettier e `format` modifica arquivos. Não existe ESLint no backend. Os scripts `infra:*` usam `.env.development`, e o Compose inicia apenas MongoDB e Redis.

## Convenções observadas

- Use imports ESM com extensão `.js`.
- Preserve `route -> handler -> service -> model` nos módulos HTTP.
- Handlers HTTP aplicam DTOs e retornam erros como `{ error: mensagem }`.
- Services lançam `Error` com propriedade `status` para erros HTTP esperados.
- Código local usa principalmente camelCase; campos persistidos e eventos usam frequentemente snake_case.
- Não renomeie eventos, campos MongoDB ou chaves Redis sem tratar todos os consumidores.
- `usuarioId`/`client_id` nos fluxos das fases representa, na prática atual, o paciente selecionado.

## Regras para alterações

- Não carregue nem registre valores de `.env`.
- Não execute migrations, treino/exportação ou operações em bancos reais durante tarefas comuns.
- Testes usam `mongodb-memory-server` e `ioredis-mock`; mantenha esse isolamento.
- Trate mudanças em dwell time, métricas, eventos e chaves Redis como mudanças de contrato.
- Preserve a verificação de pertencimento do paciente ao doutor nas rotas REST.
- Socket.IO atualmente não autentica JWT e aceita IDs do cliente; não trate esses IDs como confiáveis em código novo.
- Evite ampliar logs de gaze, tokens ou dados pessoais.
- A geração de PDF escreve em `relatorios/`; não versione saídas geradas.
- Não misture reformatação ampla com mudança funcional. Há violações preexistentes do Prettier.

## Verificação mínima

- Alteração HTTP: execute a suíte relacionada e `npm test`.
- Alteração de Socket.IO/fases: teste o fluxo afetado e atualize `docs/REALTIME.md`.
- Alteração de modelo ou persistência: execute `npm test` completo.
- Execute `npm run format:check` e diferencie falhas preexistentes das introduzidas.
- Não há cobertura suficiente para sockets, fases, relatórios e integrações; registre validações manuais no handoff.

## Referências

- [ARCHITECTURE.md](ARCHITECTURE.md): componentes, dados e fluxos.
- [DEVELOPMENT.md](DEVELOPMENT.md): ambiente, comandos, testes e Docker.
- [docs/REALTIME.md](docs/REALTIME.md): eventos Socket.IO.
- Swagger: `http://localhost:4000/api/docs` e `/api/docs.json`.
