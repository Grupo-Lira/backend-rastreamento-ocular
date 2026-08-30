// como se fosse o repository do java para o redis
import { getRedis } from "./redisConfig.js";

function toNumber(value, defaultValue = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const EXP_TTL = 60 * 60; //1HORA
export const DWELL_REQUIRED_MS = 5000; // 5 SEGUNDOS DE DWELL PARA CONSIDERAR FOCO COMPLETO
export const DWELL_REQUIRED_MS_FASE_3 = 3000; // 3 SEGUNDOS DE DWELL PARA CONSIDERAR FOCO COMPLETO EM FASE 3

//FASE 1
//ESTADO ---
export async function salvarEstadoExperimentoFase1(expId, alvoIndice) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:estado`; // experimentoId

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
  if (!data) {
    return [];
  }

  const json = JSON.parse(data);
  return Array.isArray(json) ? json : [];
}

export async function getAlvoFase1ByIndice(expId, indice) {
  const redis = getRedis();
  const key = `exp:${expId}:alvos`;

  const data = await redis.get(key);

  const alvosList = JSON.parse(data);

  return alvosList[indice - 1] ?? null;
}

export async function clearAlvosFase1(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:alvos`;

  await redis.del(key);
}

//FASE 3
//ESTADO ---
export async function salvarEstadoExperimentoFase3(expId, nomeAlvoAtual) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:estado`;

  const currentDate = Date.now();

  await redis.hset(stateKey, {
    nomeAlvoAtual,
    focoConsecutivo: 0,
    foraConsecutivo: 0,
    inicioFocoTs: 0,
    ultimoFocoTs: 0,
    timestampInicio: currentDate,
    finalizado: 0,
    pausado: 0,
    timerRestanteMs: 0,
    pausaIniciadaEm: 0,
  });

  await redis.expire(stateKey, EXP_TTL);
}

export async function getEstadoExperimentoFase3ByExpId(expId) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:estado`;

  const estado = await redis.hgetall(stateKey);

  return {
    nomeAlvoAtual: estado.nomeAlvoAtual || "",
    focoConsecutivo: toNumber(estado.focoConsecutivo),
    foraConsecutivo: toNumber(estado.foraConsecutivo),
    inicioFocoTs: toNumber(estado.inicioFocoTs),
    ultimoFocoTs: toNumber(estado.ultimoFocoTs),
    timestampInicio: toNumber(estado.timestampInicio),
    finalizado: toNumber(estado.finalizado),
    pausado: toNumber(estado.pausado),
    timerRestanteMs: toNumber(estado.timerRestanteMs),
    pausaIniciadaEm: toNumber(estado.pausaIniciadaEm),
  };
}

export async function updateEstadoExperimentoFase3(expId, newEstado) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:estado`;

  const update = Object.fromEntries(
    Object.entries(newEstado).map(([k, v]) => [k, String(v)]),
  );

  await redis.hset(stateKey, update);
}

export async function clearEstadoExperimentoFase3(expId) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:estado`;

  await redis.del(stateKey);
}

//ESTADO HISTORICO ---
export async function salvarEstadoExperimentoHistoricoFase3(
  expId,
  currentDadoOlhar,
) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:estadoHist`;

  const currentDate = Date.now();

  await redis.rpush(
    stateKey,
    JSON.stringify({
      is_focando: currentDadoOlhar.is_focando,
      timestamp: currentDate,
      nome_alvo: currentDadoOlhar.nome_alvo,
      olhar_coord: currentDadoOlhar.olhar_coord,
      tipo: currentDadoOlhar.tipo,
      lado_tela: currentDadoOlhar.lado_tela,
    }),
  );

  await redis.expire(stateKey, EXP_TTL);
}

export async function getEstadoExperimentoHistoricoFase3(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:fase3:estadoHist`;

  const eventos = await redis.lrange(key, 0, -1);

  const historico = eventos.map((e) => JSON.parse(e));
  return historico;
}

export async function clearEstadoExperimentoHistoricoFase3(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:fase3:estadoHist`;

  await redis.del(key);
}

//ALVOS ---
export async function salvarAlvoFase3(expId, alvos) {
  const redis = getRedis();
  const stateKey = `exp:${expId}:fase3:alvos`;

  await redis.set(stateKey, JSON.stringify(alvos), "EX", EXP_TTL);
}

export async function getAlvoFase3ByNome(expId, nomeAlvo) {
  const redis = getRedis();
  const key = `exp:${expId}:fase3:alvos`;

  const data = await redis.get(key);
  const alvosList = JSON.parse(data);

  return (
    alvosList.find(
      (item) =>
        String(item?.nome ?? "").toUpperCase() ===
        String(nomeAlvo ?? "").toUpperCase(),
    ) ?? null
  );
}

export async function clearAlvosFase3(expId) {
  const redis = getRedis();
  const key = `exp:${expId}:fase3:alvos`;

  await redis.del(key);
}
