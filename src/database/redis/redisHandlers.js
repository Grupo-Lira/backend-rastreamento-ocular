import { getRedis } from "./redisConfig.js";

export const EXP_TTL = 60 * 60; //1HORA
export const DWELL_REQUIRED_MS = 5000;

//FASE 1
//ESTADO ---
export async function salvarEstadoExperimentoFase1(expId, alvoIndice) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estado`;

  const currentDate = Date.now();

  await redis.hset(stateKey, {
    alvoAtual: alvoIndice,
    focoConsecutivo: 0,
    foraConsecutivo: 0,
    inicioFocoTs: 0,
    ultimoFocoTs: 0,
    timestampInicio: currentDate,
  });

  await redis.expire(stateKey, EXP_TTL);
}

export async function getEstadoExperimentoFase1ByExpId(expId) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estado`;

  const estado = await redis.hgetall(stateKey);

  return {
    alvoAtual: Number(estado.alvoAtual),
    focoConsecutivo: Number(estado.focoConsecutivo),
    foraConsecutivo: Number(estado.foraConsecutivo),
    inicioFocoTs: Number(estado.inicioFocoTs),
    ultimoFocoTs: Number(estado.ultimoFocoTs),
    timestampInicio: Number(estado.timestampInicio),
  };
}

export async function updateEstadoExperimentoFase1(expId, newEstado) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estado`;

  const update = Object.fromEntries(
    Object.entries(newEstado).map(([k, v]) => [k, String(v)]),
  );

  await redis.hset(stateKey, update);
}

export async function clearEstadoExperimentoFase1(expId) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estado`;

  await redis.del(stateKey);
}

//ESTADO HISTORICO ---
export async function salvarEstadoExperimentoHistoricoFase1(
  expId,
  currentDadoOlhar,
) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estadoHist`;

  const currentDate = Date.now();

  await redis.rpush(
    stateKey,
    JSON.stringify({
      is_focando: currentDadoOlhar.is_focando,
      timestamp: currentDate,
      alvo_indice: currentDadoOlhar.alvo_indice,
      olhar_coord: currentDadoOlhar.olhar_coord,
      tipo: currentDadoOlhar.tipo,
    }),
  );

  await redis.expire(stateKey, EXP_TTL);
}

export async function getEstadoExperimentoHistoricoFase1(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:estadoHist`;

  const eventos = await redis.lrange(key, 0, -1);

  const historico = eventos.map((e) => JSON.parse(e));
  return historico;
}

export async function clearEstadoExperimentoHistoricoFase1(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:estadoHist`;

  await redis.del(key);
}

//ALVOS ---
export async function salvarAlvoFase1(expId, alvos) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:alvos`;

  await redis.set(stateKey, JSON.stringify(alvos), "EX", EXP_TTL);
}

export async function getAlvoFase1(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:alvos`;

  const data = await redis.get(key);
  const json = JSON.parse(data);
  return json;
}

export async function getAlvoFase1ByIndice(expId, indice) {
  const redis = getRedis();
  const key = `exp:${expId}:alvos`;

  const data = await redis.get(key);
  //TODO-VALIDAR DATA RECEBIDA

  const alvosList = JSON.parse(data);
  //TODO-VALIDAR SE INDICIE É MAIOR QUE TAMANHO DO ARRAY DE ALVOS

  return alvosList[indice - 1] ?? null;
}

export async function clearAlvosFase1(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:alvos`;

  await redis.del(key);
}
