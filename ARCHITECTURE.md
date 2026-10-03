# Arquitetura do backend FocusQuest

## Visão geral

O backend combina uma API REST para autenticação e cadastros com Socket.IO para processar as fases do experimento em tempo real.

```text
Cliente
  |-- HTTP /api/* ----------> routes -> handlers -> services -> MongoDB
  |                              `-> middleware JWT       `-> Redis (logout)
  `-- Socket.IO ------------> handlers das fases -> services
                                 |                  |-> Redis / MongoDB
                                 |                  `-> avaliação externa
                                 `-> Arduino (fase 2)
```

`app.js` carrega a configuração, conecta MongoDB e Redis com retentativas e inicia o servidor HTTP compartilhado com Socket.IO.

## Camadas e responsabilidades

### Servidor

`src/server/server.js` cria Express e o servidor HTTP, configura JSON, CORS, Swagger, healthcheck e monta as rotas. `src/server/socket.js` registra os handlers das três fases em cada conexão e oferece `ping`/`pong`.

### Módulos HTTP

O fluxo predominante é:

```text
route -> middleware -> handler -> DTO -> service -> model
```

- `auth`: cadastro e login geram JWT; logout bloqueia o token no Redis pelo restante de seu TTL.
- `usuarios`: consulta, atualização e remoção do próprio perfil.
- `pacientes`: CRUD limitado por `doutor_id` ao usuário autenticado.
- `relatorios`: autoriza o paciente, reúne métricas e gera PDF.

Handlers traduzem exceções para HTTP. Services usam `Error` com a propriedade `status`; não há classe de erro nem middleware global de erros.

### DTOs

DTOs isolam parcialmente o contrato HTTP dos nomes persistidos. A criação de paciente, por exemplo, traduz `motivoAvaliacao` para `motivo_avaliacao`. O padrão não é uniforme em todos os DTOs; verifique entrada, saída e model ao mudar campos.

## Persistência

### MongoDB

MongoDB é a fonte durável. As collections configuradas incluem:

- `usuarios`: credenciais, role, perfil e referências de pacientes;
- `pacientes`: dados do paciente e vínculo com o doutor;
- `experimentos_fase_1` e `estatisticas_fase_1`;
- `experimentos_fase_2`;
- `experimentos_fase_3` e `estatisticas_fase_3`;
- `avaliacoes_finais`.

Experimentos armazenam o ID do paciente como string em `client_id`; estatísticas usam principalmente `ObjectId` em `usuario_id`. Essa diferença exige conversões explícitas e deve ser preservada até uma migração deliberada.

Não há migrations no código, apesar de `migrate-mongoose` estar instalado.

### Redis

Redis armazena:

- estado, alvos e histórico temporário da fase 1;
- estado, alvos, pausa e histórico temporário da fase 3;
- blocklist de JWT após logout.

As chaves de experimento expiram após uma hora. Na conclusão ou desconexão, os services tentam limpar seus dados. Alterações nas chaves ou hashes/listas precisam ser coordenadas com `redisHandlers.js`. A fase 2 persiste diretamente no MongoDB.

## Fluxos das fases

### Fase 1 — foco sustentado

1. O cliente envia o paciente e as caixas normalizadas dos alvos.
2. O backend cria um experimento MongoDB e guarda estado/alvos no Redis.
3. Coordenadas de gaze são classificadas como foco, desvio, comissão ou omissão; uma
   amostra fora da hitbox encerra imediatamente o bloco de foco.
4. O histórico permanece no Redis durante o alvo.
5. Após dwell de 5 segundos, resultado e histórico são persistidos no MongoDB. O
   handler emite `fase1_foco_status` para sincronizar o estado autoritativo com o
   cliente.
6. O servidor ativa o próximo alvo ou calcula `EstatisticasFase1` e conclui a fase.

### Fase 2 — atenção seletiva

1. O backend cria duas rodadas com gabaritos definidos no service.
2. O controle pode ser `CONTROLE_MOUSE` ou `CONTROLE_ARDUINO`.
3. Seleções do mouse chegam via Socket.IO; as físicas chegam pelo emitter serial.
4. Cada resposta é gravada diretamente no MongoDB e devolvida com sua correção.
5. A primeira rodada muda o status para `RODADA2`; a segunda produz os totais finais.

A porta serial está fixa em `COM13`, a 9600 baud. `ARDUINO_ENABLED=false` desativa a inicialização.

### Fase 3 — atenção alternada

1. O cliente envia paciente, alvo inicial e caixas de `ESTRELA` e `RADAR`.
2. O backend cria o experimento, armazena estado/alvos no Redis e inicia alternância a cada 6 segundos.
3. Pausa e retomada preservam no Redis o tempo restante.
4. Gaze é classificado com dwell de 3 segundos.
5. Cada alternância persiste resultado e histórico do alvo anterior no MongoDB.
6. O fim por tempo calcula estatísticas e tenta obter uma avaliação externa.
7. Falha nessa avaliação não impede a conclusão; seus campos são emitidos como `null`.

Veja o contrato completo em [docs/REALTIME.md](docs/REALTIME.md).

## Relatórios

`GET /api/relatorios/pdf/:id` exige JWT e verifica o vínculo do paciente. Os dados usam a estatística mais recente das fases 1 e 3 e o experimento mais recente da fase 2. Métricas consolidadas exigem dados das três fases.

Puppeteer renderiza o template local e grava o PDF em `relatorios/` antes do envio. O código atual não remove o arquivo depois do download.

## Autenticação e limites de confiança

- JWT contém `sub`, `email` e `role`, com expiração configurada por ambiente.
- O middleware REST verifica assinatura, expiração e blocklist Redis.
- `role` é persistido, mas não há autorização baseada em role nas rotas atuais.
- Pacientes e relatórios aplicam autorização por propriedade (`doutor_id`).
- Socket.IO não aplica JWT e aceita `usuarioId` do payload; sua identidade não é confiável.
- CORS HTTP usa `FRONTEND_ORIGINS`; Socket.IO aceita origem `*`.

## Fronteiras externas

- MongoDB e Redis são obrigatórios na inicialização.
- O cliente Socket.IO fornece geometria dos alvos, gaze e comandos de ciclo de vida.
- Arduino é uma entrada opcional da fase 2.
- A avaliação é chamada por HTTP após a fase 3 por `ML_SERVICE_URL`; sua implementação está fora do escopo deste documento.
- Chromium/Puppeteer é necessário para PDF.

## Riscos conhecidos

- Eventos Socket.IO não são autenticados nem têm acknowledgements padronizados.
- Alguns payloads não possuem validação formal.
- Cálculos de métricas semelhantes existem em mais de um módulo.
- Logs com `console` podem ser volumosos durante gaze.
- Faltam testes de sockets, fases, Arduino, relatórios e avaliação externa.
- O endpoint `/eyetracking` referenciado pelo cliente não existe neste backend.
