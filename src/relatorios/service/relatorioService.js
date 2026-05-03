import mongoose from "mongoose";

import EstatisticasFase1 from "../../models/EstatisticasFase1.js";
import EstatisticasFase3 from "../../models/EstatisticasFase3.js";
import experimentos_fase2 from "../../models/ExperimentosFase2.js";
import Pacientes from "../../models/Pacientes.js";

const validarObjectId = (id, campo) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`${campo} inválido.`);
    err.status = 400;
    throw err;
  }
};

const extrairResumoMetricas = (registro) => {
  const resumo = registro?.resumo_metricas ?? {};
  const variabilidadeTemporalMs =
    typeof registro?.variabilidade_temporal_respostas_ms === "number"
      ? registro.variabilidade_temporal_respostas_ms
      : typeof resumo.tempo_reacao_desvio_padrao_ms === "number"
        ? resumo.tempo_reacao_desvio_padrao_ms
        : null;

  return {
    tempoReacaoMs:
      typeof resumo.tempo_reacao_medio_ms === "number"
        ? resumo.tempo_reacao_medio_ms
        : null,
    variabilidadeTemporalRespostasMs: variabilidadeTemporalMs,
    acertos: Number(resumo.total_acertos ?? 0),
    errosOmissao: Number(resumo.total_omissao ?? 0),
    errosComissao: Number(resumo.total_comissao ?? 0),
  };
};

const formatarTempoReacao = (tempoReacaoMs) => {
  if (!Number.isFinite(tempoReacaoMs) || tempoReacaoMs < 0) {
    return "-";
  }

  const totalCentesimos = Math.round(tempoReacaoMs / 10);
  const segundos = Math.floor(totalCentesimos / 100);
  const centesimos = String(totalCentesimos % 100).padStart(2, "0");
  return `${segundos}:${centesimos}`;
};

const formatarVariabilidadeTemporal = (
  variabilidadeTemporalMs,
  tempoReacaoMs,
) => {
  if (
    !Number.isFinite(variabilidadeTemporalMs) ||
    !Number.isFinite(tempoReacaoMs) ||
    tempoReacaoMs <= 0
  ) {
    return "-";
  }

  const percentual = (variabilidadeTemporalMs / tempoReacaoMs) * 100;
  return `${Number(percentual.toFixed(2))}%`;
};

class RelatorioService {
  async buscarPacienteDoDoutor(doutorId, pacienteId) {
    validarObjectId(doutorId, "ID do doutor");
    validarObjectId(pacienteId, "ID do paciente");

    const paciente = await Pacientes.findOne({
      _id: pacienteId,
      doutor_id: doutorId,
    }).lean();

    if (!paciente) {
      const err = new Error("Paciente não encontrado.");
      err.status = 404;
      throw err;
    }

    return paciente;
  }

  async buscarMetricasPaciente(pacienteId) {
    const objId = new mongoose.Types.ObjectId(String(pacienteId));

    const [estatisticaFase1, experimentoFase2, estatisticaFase3] =
      await Promise.all([
        EstatisticasFase1.findOne({ usuario_id: objId })
          .sort({ timestamp_analise: -1 })
          .lean(),
        experimentos_fase2
          .findOne({ usuario_id: objId })
          .sort({ data_hora: -1 })
          .lean(),
        EstatisticasFase3.findOne({ usuario_id: objId })
          .sort({ timestamp_analise: -1 })
          .lean(),
      ]);

    const temFase1 = !!estatisticaFase1?.resumo_metricas;
    const temFase2 =
      typeof experimentoFase2?.acertos === "number" ||
      experimentoFase2?.acertos != null;
    const temFase3 = !!estatisticaFase3?.resumo_metricas;

    if (!temFase1 && !temFase2 && !temFase3) {
      return {
        tempoReacaoMs: null,
        acertos: 0,
        errosOmissao: 0,
        errosComissao: 0,
      };
    }

    let metricas = {
      tempoReacaoMs: null,
      variabilidadeTemporalRespostasMs: null,
      acertos: 0,
      errosOmissao: 0,
      errosComissao: 0,
    };

    if (temFase1) {
      const fase1 = extrairResumoMetricas(estatisticaFase1);
      metricas.tempoReacaoMs = fase1.tempoReacaoMs;
      metricas.variabilidadeTemporalRespostasMs =
        fase1.variabilidadeTemporalRespostasMs;
      metricas.acertos += fase1.acertos;
      metricas.errosOmissao += fase1.errosOmissao;
      metricas.errosComissao += fase1.errosComissao;
    }

    if (temFase2) {
      metricas.acertos += experimentoFase2.acertos ?? 0;
    }

    if (temFase3) {
      const fase3 = extrairResumoMetricas(estatisticaFase3);
      metricas.tempoReacaoMs = metricas.tempoReacaoMs ?? fase3.tempoReacaoMs;
      metricas.variabilidadeTemporalRespostasMs =
        metricas.variabilidadeTemporalRespostasMs ??
        fase3.variabilidadeTemporalRespostasMs;
      metricas.acertos += fase3.acertos;
      metricas.errosOmissao += fase3.errosOmissao;
      metricas.errosComissao += fase3.errosComissao;
    }

    return metricas;
  }

  async buscarMediasPorIdade() {
    const anoAtual = new Date().getFullYear();
    const idadesAlvo = [10, 11, 12];

    const [mediasFase1, mediasFase2, mediasFase3] = await Promise.all([
      EstatisticasFase1.aggregate([
        {
          $lookup: {
            from: "pacientes",
            localField: "usuario_id",
            foreignField: "_id",
            as: "dados_paciente",
          },
        },
        { $unwind: "$dados_paciente" },
        {
          $addFields: {
            idadeCalculada: {
              $subtract: [
                anoAtual,
                {
                  $year: {
                    $dateFromString: {
                      dateString: "$dados_paciente.data_nascimento",
                    },
                  },
                },
              ],
            },
          },
        },
        { $match: { idadeCalculada: { $in: idadesAlvo } } },
        {
          $group: {
            _id: "$idadeCalculada",
            mediaAcertos: { $avg: "$resumo_metricas.total_acertos" },
          },
        },
      ]),
      experimentos_fase2.aggregate([
        {
          $lookup: {
            from: "pacientes",
            localField: "usuario_id",
            foreignField: "_id",
            as: "dados_paciente",
          },
        },
        { $unwind: "$dados_paciente" },
        {
          $addFields: {
            idadeCalculada: {
              $subtract: [
                anoAtual,
                {
                  $year: {
                    $dateFromString: {
                      dateString: "$dados_paciente.data_nascimento",
                    },
                  },
                },
              ],
            },
          },
        },
        { $match: { idadeCalculada: { $in: idadesAlvo } } },
        {
          $group: {
            _id: "$idadeCalculada",
            mediaAcertos: { $avg: "$acertos" },
          },
        },
      ]),
      EstatisticasFase3.aggregate([
        {
          $lookup: {
            from: "pacientes",
            localField: "usuario_id",
            foreignField: "_id",
            as: "dados_paciente",
          },
        },
        { $unwind: "$dados_paciente" },
        {
          $addFields: {
            idadeCalculada: {
              $subtract: [
                anoAtual,
                {
                  $year: {
                    $dateFromString: {
                      dateString: "$dados_paciente.data_nascimento",
                    },
                  },
                },
              ],
            },
          },
        },
        { $match: { idadeCalculada: { $in: idadesAlvo } } },
        {
          $group: {
            _id: "$idadeCalculada",
            mediaAcertos: { $avg: "$resumo_metricas.total_acertos" },
          },
        },
      ]),
    ]);

    const sums = {};
    const counts = {};
    idadesAlvo.forEach((idade) => {
      sums[idade] = 0;
      counts[idade] = 0;
    });

    const add = (m) => {
      if (m && m._id != null) {
        sums[m._id] = (sums[m._id] || 0) + m.mediaAcertos;
        counts[m._id] = (counts[m._id] || 0) + 1;
      }
    };

    mediasFase1.forEach(add);
    mediasFase2.forEach(add);
    mediasFase3.forEach(add);

    return idadesAlvo.map((idade) => ({
      idade,
      mediaAcertos: counts[idade]
        ? Number((sums[idade] / counts[idade]).toFixed(2))
        : 0,
    }));
  }

  async buscarDadosRelatorioPaciente(doutorId, pacienteId) {
    const paciente = await this.buscarPacienteDoDoutor(doutorId, pacienteId);
    const metricas = await this.buscarMetricasPaciente(paciente._id);
    const dadosComparativos = await this.buscarMediasPorIdade();

    const anoAtual = new Date().getFullYear();
    const anoNascimento = new Date(paciente.data_nascimento).getFullYear();
    const idadePacienteAtual = anoAtual - anoNascimento;

    return {
      idPaciente: paciente._id,
      nomePaciente: paciente.nome ?? "",
      idade: idadePacienteAtual,
      dataAvaliacaoPaciente: paciente.data_avaliacao ?? "",
      sexo: paciente.sexo ?? "",
      escolaridade: paciente.escolaridade ?? "",
      motivoAvaliacao: paciente.motivo_avaliacao ?? "",
      dataNascimento: paciente.data_nascimento ?? "",
      tempoReacao: formatarTempoReacao(metricas.tempoReacaoMs),
      variabilidadeTemporalRespostas: formatarVariabilidadeTemporal(
        metricas.variabilidadeTemporalRespostasMs,
        metricas.tempoReacaoMs,
      ),
      acertos: metricas.acertos,
      errosOmissao: metricas.errosOmissao,
      errosComissao: metricas.errosComissao,
      observacoes: paciente.observacoes ?? "",
      dadosComparativos: dadosComparativos,
    };
  }
}

export default new RelatorioService();
