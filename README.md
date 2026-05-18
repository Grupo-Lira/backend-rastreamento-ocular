## FocusQuest Backend

Servidor Node.js responsável por autenticação, gerenciamento de pacientes e usuários, comunicação em tempo real via Socket.IO, integração com MongoDB/Redis, geração de relatórios e processamento dos eventos de rastreamento ocular.

## Visão Geral

Este backend concentra a lógica de domínio do FocusQuest. Ele expõe a API HTTP, mantém os canais de WebSocket, persiste dados no MongoDB, usa Redis para estados temporários e integra a comunicação com Arduino e geração de PDF dos relatórios.

## Tecnologias Utilizadas

- Node.js
- Express
- Socket.IO
- MongoDB com Mongoose
- Redis com ioredis
- SerialPort para integração com Arduino
- Puppeteer para geração de PDF
- Swagger para documentação da API

## Estrutura do Projeto

```
backend/
├── app.js
├── compose.yml
├── Dockerfile
├── Dockerfile.local
├── env.config.js
├── package.json
├── src/
│   ├── arduino/
│   ├── auth/
│   ├── database/
│   ├── docs/
│   ├── fase1/
│   ├── fase2/
│   ├── fase3/
│   ├── models/
│   ├── pacientes/
│   ├── relatorios/
│   ├── server/
│   ├── usuarios/
│   └── utils/
└── tests/
```

## Como Executar

### Modo rápido no monorepo

Use este caminho quando quiser subir tudo em conjunto:
<br>
Basta acessar o repositório `focusquest-monorepo` e seguir os passos descritos no readme do projeto:
<br>
<b>Link:</b> https://github.com/Grupo-Lira/focusquest-monorepo.git

### Execução manual só do backend

Use este caminho quando quiser rodar apenas o backend dentro deste submodule:

1. Instale as dependências:

```bash
npm install
```

2. Ajuste as variáveis no arquivo `.env.development` conforme seu ambiente local.

3. Garanta que MongoDB e Redis estejam disponíveis localmente.

4. Inicie o servidor:

```bash
npm run dev
```

O backend sobe em:

```bash
http://localhost:4000
```

### 3. Frontend separado

Se preferir testar sem o monorepo, clone o frontend em outro diretório e aponte a variável `NEXT_PUBLIC_API_URL` para o backend.

<b>Link do frontend:</b> https://github.com/Grupo-Lira/FocusQuest-web.git

## Pré-requisitos

- Node.js 18+
- MongoDB
- Redis
- Arduino via USB, se for testar a integração física

## Documentação da API

- Swagger UI: http://localhost:4000/api/docs
- Swagger JSON: http://localhost:4000/api/docs.json

## Observações

- A fase 2 depende da conexão com arduino para seleção dos planetas.
- A porta serial pode precisar de ajuste em `src/arduino/config/serial.js`.
- O URI do MongoDB é configurado por ambiente e pode ser alterado em `.env.development`.
- Os eventos de Socket.IO e as métricas calculadas dependem do fluxo de uso do cliente frontend.



