import mongoose from "mongoose";
import AvaliacaoFinal from "../models/AvaliacaoFinal.js";
import EstatisticasFase3 from "../models/EstatisticasFase3.js";
import ExperimentosFase1 from "../models/ExperimentosFase1.js";
import ExperimentosFase2 from "../models/ExperimentosFase2.js";
import { DWELL_REQUIRED_MS } from "../database/redis/redisHandlers.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 4000);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTimestamp = (value) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return toNumber(value, 0);
};

const mean = (values) => {
  if (!values.length) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Number((sum / values.length).toFixed(2));
};

const std = (values) => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
    values.length;
  return Number(Math.sqrt(variance).toFixed(2));
};

const computePhase1Summary = (experimento) => {
  const historico = Array.isArray(experimento?.historico_olhar)
    ? experimento.historico_olhar
    : [];
  const resultados = Array.isArray(experimento?.resultados_alvos)
    ? experimento.resultados_alvos
    : [];

  let totalAcertos = 0;
  let totalComissao = 0;
  let totalOmissao = 0;
  const temposReacao = [];

  resultados.forEach((resultado) => {
    const alvoIndice = resultado?.alvo_indice;
    const inicio = toTimestamp(resultado?.tempo_inicio_alvo);
    const fim = toTimestamp(resultado?.tempo_fim_alvo);

    const eventos = historico
      .filter((item) => {
        const ts = toTimestamp(item?.timestamp);
        return item?.alvo_indice === alvoIndice && ts >= inicio && ts <= fim;
      })
      .sort((a, b) => toTimestamp(a?.timestamp) - toTimestamp(b?.timestamp));

    const primeiroFoco = eventos.find((item) => Boolean(item?.is_focando));
    let tempoReacao = null;
    if (primeiroFoco) {
      tempoReacao = Math.max(0, toTimestamp(primeiroFoco.timestamp) - inicio);
      temposReacao.push(tempoReacao);
    }

    let focoMaximo = 0;
    let desvioMaximo = 0;
    let inicioBlocoFoco = null;
    let inicioBlocoDesvio = inicio;
    let estadoAtualFoco = false;

    eventos.forEach((evento) => {
      const ts = toTimestamp(evento?.timestamp);

      if (estadoAtualFoco && inicioBlocoFoco !== null) {
        focoMaximo = Math.max(focoMaximo, ts - inicioBlocoFoco);
      }

      const estaFocando = Boolean(evento?.is_focando);

      if (!estadoAtualFoco && estaFocando) {
        inicioBlocoFoco = ts;
        if (inicioBlocoDesvio !== null) {
          desvioMaximo = Math.max(desvioMaximo, ts - inicioBlocoDesvio);
          inicioBlocoDesvio = null;
        }
      }

      if (estadoAtualFoco && !estaFocando) {
        if (inicioBlocoFoco !== null) {
          focoMaximo = Math.max(focoMaximo, ts - inicioBlocoFoco);
        }
        inicioBlocoFoco = null;
        inicioBlocoDesvio = ts;
      }

      estadoAtualFoco = estaFocando;
    });

    if (estadoAtualFoco) {
      focoMaximo = Math.max(
        focoMaximo,
        fim - (inicioBlocoFoco !== null ? inicioBlocoFoco : fim),
      );
    } else if (inicioBlocoDesvio !== null) {
      desvioMaximo = Math.max(desvioMaximo, fim - inicioBlocoDesvio);
    }

    if (
      tempoReacao !== null &&
      tempoReacao <= DWELL_REQUIRED_MS &&
      focoMaximo >= DWELL_REQUIRED_MS
    ) {
      totalAcertos += 1;
    } else if (tempoReacao === null || tempoReacao > DWELL_REQUIRED_MS) {
      totalOmissao += 1;
    } else if (desvioMaximo > DWELL_REQUIRED_MS || eventos.length > 2) {
      totalComissao += 1;
    }
  });

  const totalEventos = totalAcertos + totalComissao + totalOmissao;
  const taxaAcerto = totalEventos ? totalAcertos / totalEventos : 0;

  return {
    phase1_tempo_reacao_medio_ms: mean(temposReacao),
    phase1_tempo_reacao_desvio_padrao_ms: std(temposReacao),
    phase1_total_acertos: totalAcertos,
    phase1_total_comissao: totalComissao,
    phase1_total_omissao: totalOmissao,
    phase1_taxa_acerto: Number(taxaAcerto.toFixed(4)),
  };
};

const computePhase2Summary = (experimento) => {
  const acertos = Math.trunc(toNumber(experimento?.acertos, 0));
  const planetasVistos = Math.trunc(toNumber(experimento?.planetas_vistos, 0));
  const planetasIgnorados = Math.trunc(
    toNumber(experimento?.planetas_ignorados, 0),
  );
  const total = acertos + planetasIgnorados;
  const taxaAcerto = total ? acertos / total : 0;

  return {
    phase2_acertos: acertos,
    phase2_planetas_vistos: planetasVistos,
    phase2_planetas_ignorados: planetasIgnorados,
    phase2_taxa_acerto: Number(taxaAcerto.toFixed(4)),
  };
};

const computePhase3Summary = (estatisticas) => {
  const resumo = estatisticas?.resumo_metricas || {};
  const totalAcertos = Math.trunc(toNumber(resumo?.total_acertos, 0));
  const totalComissao = Math.trunc(toNumber(resumo?.total_comissao, 0));
  const totalOmissao = Math.trunc(toNumber(resumo?.total_omissao, 0));
  const totalEventos = totalAcertos + totalComissao + totalOmissao;
  const taxaAcerto = totalEventos ? totalAcertos / totalEventos : 0;

  return {
    phase3_tempo_reacao_medio_ms: toNumber(resumo?.tempo_reacao_medio_ms, 0),
    phase3_tempo_reacao_desvio_padrao_ms: toNumber(
      resumo?.tempo_reacao_desvio_padrao_ms,
      0,
    ),
    phase3_total_acertos: totalAcertos,
    phase3_total_comissao: totalComissao,
    phase3_total_omissao: totalOmissao,
    phase3_taxa_acerto: Number(taxaAcerto.toFixed(4)),
  };
};

const mergeFeatures = (phase1, phase2, phase3) => ({
  phase1_tempo_reacao_medio_ms: 0,
  phase1_tempo_reacao_desvio_padrao_ms: 0,
  phase1_total_acertos: 0,
  phase1_total_comissao: 0,
  phase1_total_omissao: 0,
  phase1_taxa_acerto: 0,
  phase2_acertos: 0,
  phase2_planetas_vistos: 0,
  phase2_planetas_ignorados: 0,
  phase2_taxa_acerto: 0,
  phase3_tempo_reacao_medio_ms: 0,
  phase3_tempo_reacao_desvio_padrao_ms: 0,
  phase3_total_acertos: 0,
  phase3_total_comissao: 0,
  phase3_total_omissao: 0,
  phase3_taxa_acerto: 0,
  ...phase1,
  ...phase2,
  ...phase3,
});

const toObjectId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  const valueString = String(value);
  if (!mongoose.isValidObjectId(valueString)) {
    return null;
  }

  return new mongoose.Types.ObjectId(valueString);
};

const callMlService = async (features) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: features }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ML service error: ${response.status} ${text}`);
    }

    const payload = await response.json();
    return {
      evaluation: payload?.evaluation,
      score: toNumber(payload?.score, 0),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const avaliarSessaoFinal = async ({
  usuarioId,
  experimentoFase3Id,
  estatisticasFase3,
}) => {
  const usuarioIdNormalizado =
    usuarioId === undefined || usuarioId === null ? null : String(usuarioId);
  const experimentoFase3IdNormalizado =
    experimentoFase3Id === undefined || experimentoFase3Id === null
      ? null
      : String(experimentoFase3Id);

  if (!usuarioIdNormalizado || !experimentoFase3IdNormalizado) {
    return null;
  }

  const experimentoFase3ObjectId = toObjectId(experimentoFase3IdNormalizado);
  if (!experimentoFase3ObjectId) {
    return null;
  }

  const [fase1, fase2, statsFase3] = await Promise.all([
    ExperimentosFase1.findOne({ client_id: usuarioIdNormalizado })
      .sort({ data_hora: -1 })
      .lean(),
    ExperimentosFase2.findOne({ client_id: usuarioIdNormalizado })
      .sort({ data_hora: -1 })
      .lean(),
    estatisticasFase3
      ? Promise.resolve(estatisticasFase3)
      : EstatisticasFase3.findOne({
          experimento_id: experimentoFase3IdNormalizado,
        }).lean(),
  ]);

  const phase1Summary = fase1 ? computePhase1Summary(fase1) : {};
  const phase2Summary = fase2 ? computePhase2Summary(fase2) : {};
  const phase3Summary = statsFase3 ? computePhase3Summary(statsFase3) : {};
  const features = mergeFeatures(phase1Summary, phase2Summary, phase3Summary);

  const mlResult = await callMlService(features);
  if (!mlResult?.evaluation) {
    return null;
  }

  const payload = {
    usuario_id: usuarioIdNormalizado,
    experimento_fase1_id: fase1?._id,
    experimento_fase2_id: fase2?._id,
    experimento_fase3_id: experimentoFase3ObjectId,
    avaliacao: mlResult.evaluation,
    score: mlResult.score,
    features,
  };

  const saved = await AvaliacaoFinal.findOneAndUpdate(
    { experimento_fase3_id: experimentoFase3ObjectId },
    { $set: payload },
    { upsert: true, new: true },
  );

  return {
    avaliacao: saved.avaliacao,
    score: saved.score,
    features: saved.features,
  };
};
