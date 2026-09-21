# Contrato Socket.IO

## Conexão e confiança

Socket.IO compartilha o servidor HTTP da API, normalmente em `http://localhost:4000`. `src/server/socket.js` registra os handlers das três fases em cada conexão.

O contrato atual não autentica JWT, não valida a propriedade do paciente e aceita origem `*`. `usuarioId` é fornecido pelo cliente e representa o paciente selecionado. Não interprete o socket como identidade autenticada.

Não há namespace customizado nem acknowledgements padronizados. Erros são normalmente registrados no servidor, sem evento de erro correspondente.

## Estado em `socket.data`

| Campo                       | Uso                                 |
| --------------------------- | ----------------------------------- |
| `usuarioId`                 | ID do paciente do experimento atual |
| `experimentoId`             | ID MongoDB do experimento atual     |
| `controleJogo`              | Controle escolhido na fase 2        |
| `fase3Pronta`               | Alvos da fase 3 inicializados       |
| `fase3Encerrada`            | Impede finalização duplicada        |
| `fase3Pausada`              | Estado de pausa                     |
| `fase3AlvoAtual`            | Alvo atual                          |
| `fase3Timer` e relacionados | Timer e prazo de alternância        |

`experimentoId` e `usuarioId` são reutilizados entre fases. Cada `iniciar_fase*` redefine o contexto.

## Eventos comuns

| Direção            | Evento | Payload |
| ------------------ | ------ | ------- |
| cliente → servidor | `ping` | nenhum  |
| servidor → cliente | `pong` | nenhum  |

## Fase 1

### Sequência

```text
iniciar_fase1
  -> fase1_iniciada
  -> gaze_data_fase1 (repetido)
  -> fase1_foco_status (a cada verificação do gaze)
  -> alvo_fase1_concluido
  -> brilhar_estrela (enquanto houver próximo alvo)
  -> fase_concluida
```

`fase_1_tempo_excedido` encerra o alvo atual e desconecta o socket.

### Cliente → servidor: `iniciar_fase1`

```json
{
  "usuarioId": "<id-do-paciente>",
  "fase1": [{ "id": 1, "x_min": 0.1, "x_max": 0.3, "y_min": 0.2, "y_max": 0.4 }]
}
```

Cria `experimentos_fase_1`, guarda alvos/estado no Redis e começa no índice 1. O
backend apenas normaliza os limites recebidos para `[0,1]`; não acrescenta margem de
tolerância. A caixa devolvida nos eventos de alvo é a mesma caixa avaliada no gaze.
Não há validação completa do ID ou dos alvos.

### Servidor → cliente: `fase1_iniciada`

```json
{
  "fase": 1,
  "alvo": { "id": 1, "x_min": 0.1, "x_max": 0.3, "y_min": 0.2, "y_max": 0.4 }
}
```

### Cliente → servidor: `gaze_data_fase1`

```json
{ "x": 0.21, "y": 0.34, "timestamp": 1710000000000 }
```

`x` e `y` devem usar a escala dos limites enviados. O backend persiste seu próprio
`Date.now()`; `timestamp` é usado apenas no log atual. O dwell é 5000 ms. Qualquer
saída da caixa encerra o bloco de foco e é registrada como comissão.

### Servidor → cliente: `fase1_foco_status`

```json
{
  "fase": 1,
  "alvo": 1,
  "status": "FOCANDO",
  "timestamp": 1710000000000,
  "inicio_foco_ts": 1710000000000,
  "tempo_foco_ms": 2300
}
```

`status` pode ser `FOCANDO`, `DESFOCADO` ou `CONCLUIDO`. `DESFOCADO` é emitido na
primeira amostra fora da caixa e zera o bloco atual. `tempo_foco_ms` é calculado pelo
relógio do servidor. O evento é emitido junto de cada amostra processada, portanto
não é um heartbeat quando o cliente não envia gaze.

### Servidor → cliente: `alvo_fase1_concluido`

```json
{
  "fase": 1,
  "alvo": { "id": 1, "x_min": 0.1, "x_max": 0.3, "y_min": 0.2, "y_max": 0.4 },
  "motivo_termino": "FOCOU"
}
```

`motivo_termino` pode ser `FOCOU` ou `TEMPO`. Se a busca falhar, `alvo` pode ser apenas o índice.

### Servidor → cliente: `brilhar_estrela`

```json
{
  "fase": 1,
  "alvo": { "id": 2, "x_min": 0.4, "x_max": 0.6, "y_min": 0.2, "y_max": 0.4 }
}
```

### Cliente → servidor: `fase_1_tempo_excedido`

O payload é ignorado. Finaliza com motivo `TEMPO` e desconecta.

### Servidor → cliente: `fase_concluida`

```json
{
  "fase": 1,
  "metricas": {
    "tempo_reacao_medio_ms": 0,
    "tempo_reacao_desvio_padrao_ms": 0,
    "total_alvos": 0,
    "total_alvos_exibidos": 0,
    "total_acertos": 0,
    "total_comissao": 0,
    "total_omissao": 0
  }
}
```

## Fase 2

### Sequência por mouse

```text
iniciar_fase2 { controleJogo: CONTROLE_MOUSE }
  -> aguardando_mouse
  -> click_planeta_selecionado (repetido)
  -> resposta_planeta
  -> fase_2_rodada_1_finalizada
  -> novas seleções
  -> fase_atual_finalizada
  -> experimento_concluido
```

No modo Arduino, `aguardando_iot` liga o LED e as seleções chegam internamente como `PLANETA_<número>`.

### Cliente → servidor: `iniciar_fase2`

```json
{
  "usuarioId": "<id-do-paciente>",
  "controleJogo": "CONTROLE_MOUSE"
}
```

`controleJogo` aceita `CONTROLE_MOUSE` ou `CONTROLE_ARDUINO`; o padrão é mouse. Não existe confirmação de início.

### Cliente → servidor: `aguardando_mouse`

Sem payload. Apenas registra que a interface está pronta.

### Cliente → servidor: `click_planeta_selecionado`

```json
{ "planetaId": 2 }
```

`planetaId` precisa ser `number`. A seleção requer experimento e espaço na rodada.

### Cliente → servidor: `aguardando_iot`

Sem payload. Envia `LED_SELECAO_ON` ao Arduino.

### Servidor → cliente: `resposta_planeta`

```json
{ "planeta": 2, "correto": true }
```

### Servidor → cliente: `fase_2_rodada_1_finalizada`

```json
{
  "fase": 2,
  "mensagem": "Selecione continuar para iniciar a rodada 2."
}
```

O backend altera o status persistido para `RODADA2`.

### Servidor → cliente: `fase_atual_finalizada`

```json
{
  "fase": 2,
  "mensagem": "Fase 2 (atenção seletiva) concluída.",
  "acertos": 0,
  "planetas_vistos": [],
  "planetas_ignorados": []
}
```

Neste evento, `planetas_vistos` e `planetas_ignorados` são arrays de IDs, apesar dos nomes; no MongoDB, os campos homônimos são números.

### Servidor → cliente: `experimento_concluido`

```json
{ "mensagem": "Experimento finalizado após fase 2." }
```

## Fase 3

### Sequência

```text
iniciar_fase3
  -> fase3_iniciada
  -> gaze_data_fase3 (repetido)
  -> brilhar_alvo_fase3 (a cada alternância)
  -> fase_3_pause / fase_3_resume (opcionais)
  -> fase_3_tempo_excedido
  -> fase_concluida
  -> desconexão
```

### Cliente → servidor: `iniciar_fase3`

```json
{
  "usuarioId": "<id-do-paciente>",
  "alvoInicialNome": "ESTRELA",
  "fase3": [
    { "x_min": 0.1, "x_max": 0.3, "y_min": 0.2, "y_max": 0.4 },
    { "x_min": 0.6, "x_max": 0.8, "y_min": 0.2, "y_max": 0.4 }
  ]
}
```

Pela ordem, índice 0 recebe `ESTRELA` e índice 1, `RADAR`; extras recebem `ESTRELA`. A lista não pode ser vazia. O alvo inicial é convertido para maiúsculas.

### Servidor → cliente: `fase3_iniciada`

```json
{ "fase": 3, "alvo": "ESTRELA" }
```

### Cliente → servidor: `gaze_data_fase3`

```json
{ "x": 0.25, "y": 0.35, "larguraTela": 1920, "timestamp": 1710000000000 }
```

O handler usa `x`, `y` e opcionalmente `larguraTela`; o timestamp persistido é do servidor. Sem largura numérica, usa 1920 para classificar o lado. Coordenadas e caixas precisam estar na mesma escala. O dwell é 3000 ms; o resultado só é persistido na alternância ou conclusão.

### Servidor → cliente: `brilhar_alvo_fase3`

```json
{ "fase": 3, "alvo": "RADAR" }
```

O servidor alterna `ESTRELA`/`RADAR` a cada 6000 ms enquanto não pausado.

### Cliente → servidor: `fase_3_pause`

Sem payload. Cancela o timer e salva o tempo restante no Redis.

### Cliente → servidor: `fase_3_resume`

Sem payload. Retoma pelo tempo restante salvo.

### Cliente → servidor: `alternar_alvo_fase3`

Sem payload. Força alternância e reinicia o timer. O motivo persistido é `TROCA`.

### Cliente → servidor: `fase_3_tempo_excedido`

Sem payload. Finaliza uma vez, calcula métricas, emite conclusão e desconecta.

### Servidor → cliente: `fase_concluida`

```json
{
  "fase": 3,
  "metricas": {
    "tempo_reacao_medio_ms": 0,
    "tempo_reacao_desvio_padrao_ms": 0,
    "total_acertos": 0,
    "total_comissao": 0,
    "total_omissao": 0
  },
  "avaliacao_final": null,
  "avaliacao_score": null,
  "acertos": 0,
  "erros_omissao": 0,
  "erros_comissao": 0
}
```

Os campos de avaliação podem ser `null`; falha externa não impede a conclusão.

## Desconexão e limpeza

- Fase 1 limpa alvos, estado e histórico temporário no Redis.
- Fase 2 remove o listener Arduino associado ao socket.
- Fase 3 cancela timer e limpa seus dados temporários no Redis.
- A limpeza correta ocorre em `socket.on("disconnect")`; o listener global `io.on("disconnect")` existente não o substitui.

Ao evoluir eventos, atualize este documento, o emissor e todos os consumidores na mesma mudança.
