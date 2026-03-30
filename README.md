## Swagger

- UI: http://localhost:4000/api/docs
- JSON: http://localhost:4000/api/docs.json


# Teste de Desempenho Contínuo, Orientado po Visão Computacional

Este projeto implementa um **servidor Node.js** que integra **comunicação via Arduino e análise de desempenho cognitivo** em múltiplas fases de atenção (sustentada, seletiva e dividida).
Ele utiliza **Express**, **Socket.IO**, **MongoDB** e **SerialPort** para comunicação em tempo real entre o backend, o dispositivo de hardware e a aplicação cliente.

---

## 🚀 Tecnologias Utilizadas

- **Node.js** — Plataforma de execução do servidor
- **Express** — Framework web para criação de rotas e middlewares
- **Socket.IO** — Comunicação em tempo real via WebSocket
- **SerialPort** — Comunicação com o Arduino via porta serial
- **MongoDB + Mongoose** — Armazenamento e modelagem de dados
- **Arduino (IOT)** — Envio de eventos físicos (botões, sensores etc.)

---

## 📂 Estrutura do Projeto

```


````

---

## ⚙️ Configuração do Ambiente

### 1️⃣ Pré-requisitos

Antes de iniciar, instale:
- **Node.js 18+**
- **MongoDB local**
- **Redis local**
- **Arduino conectado via USB**

---

### 2️⃣ Instalação das dependências

```bash
npm install
````

---

### 3️⃣ Configuração da porta serial

No arquivo */src/arduino/config/serial.js*, ajuste a constante `SERIAL_PORT` conforme a porta do seu Arduino:

```js
const SERIAL_PORT = "COM13";
```

---

### 4️⃣ Configuração do MongoDB

Certifique-se de que o MongoDB está rodando localmente ou ajuste o URI de conexão:

```js
const MONGODB_URI = "mongodb://127.0.0.1:27017/rastreamento-ocular";
```

---

## ▶️ Inicialização do sistema

```bash
1. sudo docker compose --env-file .env.development up -d
2. npm run dev
```

O servidor iniciará em:

```
http://localhost:4000
```

---

## 🔌 Fluxo de Comunicação

### 🖥️ 1. Cliente Web

O cliente se conecta via **Socket.IO** e envia dados de rastreamento ocular e dos alvos da fase.

### 🤖 2. Arduino

O Arduino envia eventos seriais para o servidor, como:

* `BUTTON_PRESSED`
* `PLANETA_1`, `PLANETA_2`, ...

Esses eventos são capturados e retransmitidos via WebSocket aos clientes conectados.

### 🧩 3. MongoDB

Os dados de cada participante são armazenados e analisados.
O sistema calcula métricas como:

* Tempo de reação médio
* Taxa de acertos
* Erros de omissão e comissão
* Desvio padrão de tempos de resposta

---

## 🧮 Fases do Experimento

###  Fase 1 – Atenção Sustentada

O participante deve manter o foco em um alvo por um tempo mínimo de 5s.
O servidor registra o histórico de olhar e calcula métricas TDC.

### Fase 2 – Atenção Seletiva

O participante seleciona os alvos corretos via Arduino.
O sistema registra acertos, planetas vistos e planetas ignorados ao fim da fase

---

## 📊 Análise e Métricas

Após cada fase, o servidor calcula e armazena:

* **Tempo médio de reação (TR)**
* **Desvio padrão (DP)**
* **Total de acertos, comissões e omissões**
* **Métricas por alvo individual**

Esses resultados são salvos na coleção `ResultadoAnalise` no MongoDB.

---

## 📡 Eventos Socket.IO

### 🔄 Emitidos pelo servidor:

| Evento                 | Descrição                                       |
| ---------------------- | ----------------------------------------------- |
| `fase_iniciada`        | Inicia uma nova fase (1, 2 ou 3)                |
| `fase_concluida`       | Indica o fim de uma fase com métricas resumidas |
| `alvo_fase1_concluido` | Finalização de um alvo da fase 1                |
| `resposta_planeta`     | Retorno da seleção de planeta na fase 2         |
| `arduino_event`        | Dados brutos recebidos do Arduino               |
| `arduino_button`       | Evento de botão pressionado no Arduino          |

### 📥 Recebidos do cliente:

* Coordenadas dos olhos a cada 1 segundo.
* Coordenadas dos alvos

---

## 🧰 Funções Principais

| Função                        | Descrição                                        |
| ----------------------------- | ------------------------------------------------ |
| `salvar_banco()`              | Armazena dados brutos de rastreamento no MongoDB |
| `analisar_metricas()`         | Processa e classifica os resultados de atenção   |
| `finalizar_fase1_completa()`  | Gera análise final da fase 1                     |
| `processar_selecao_planeta()` | Valida cliques e registra acertos na fase 2      |

---

## 🧩 Modelos de Dados

### 📘 `Dados.js`

```js
{
  client_id: String,
  fase: Number,
  historico_olhar_fase1: Array,
  resultados_alvos_fase1: Array
}
```

### 📗 `ResultadoAnalise.js`

```js
{
  client_id: String,
  analise_por_alvo: Array,
  resumo_metricas: {
    tempo_reacao_medio_ms: Number,
    tempo_reacao_desvio_padrao_ms: Number,
    total_acertos: Number,
    total_comissao: Number,
    total_omissao: Number
  }
}
```

---

## 🧪 Logs e Depuração

Durante a execução, o servidor imprime logs detalhados:

* Conexões de clientes (`socket.id`)
* Eventos do Arduino
* Salvamento e análise de dados
* Métricas por fase

Para reduzir o nível de logs, basta comentar ou remover os `console.debug()`.

---

## 📄 Licença

Este projeto é de uso acadêmico e experimental.

---

## 👩‍💻 Autoria

Desenvolvido por **Arthur Fudali**, **Amanda Costa**, **Diego Baltazar**, **Giovana Albanês** e **Igor Leite**.


