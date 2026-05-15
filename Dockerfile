FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=builder /app ./

EXPOSE 4000

CMD ["npm", "start"]
