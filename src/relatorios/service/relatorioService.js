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
  formatarVariabilidadeTemporal = formatarVariabilidadeTemporal;
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
          .findOne({ client_id: objId.toString() })
          .sort({ data_hora: -1 })
          .lean(),
        EstatisticasFase3.findOne({ usuario_id: objId })
          .sort({ timestamp_analise: -1 })
          .lean(),
      ]);

    const temFase1 = !!estatisticaFase1?.resumo_metricas;
    const temFase2 = !!experimentoFase2;
    const temFase3 = !!estatisticaFase3?.resumo_metricas;

    if (!temFase1 || !temFase2 || !temFase3) {
      return null;
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

      if (metricas.tempoReacaoMs && fase3.tempoReacaoMs) {
        metricas.tempoReacaoMs =
          (metricas.tempoReacaoMs + fase3.tempoReacaoMs) / 2;
      } else if (fase3.tempoReacaoMs) {
        metricas.tempoReacaoMs = fase3.tempoReacaoMs;
      }

      const variabilidades = [];

      if (
        metricas.variabilidadeTemporalRespostasMs !== null &&
        metricas.variabilidadeTemporalRespostasMs !== undefined
      ) {
        variabilidades.push(metricas.variabilidadeTemporalRespostasMs);
      }

      if (
        fase3.variabilidadeTemporalRespostasMs !== null &&
        fase3.variabilidadeTemporalRespostasMs !== undefined
      ) {
        variabilidades.push(fase3.variabilidadeTemporalRespostasMs);
      }

      if (variabilidades.length > 0) {
        metricas.variabilidadeTemporalRespostasMs =
          variabilidades.reduce((sum, val) => sum + val, 0) /
          variabilidades.length;
      }

      metricas.acertos += fase3.acertos;
      metricas.errosOmissao += fase3.errosOmissao;
      metricas.errosComissao += fase3.errosComissao;
    }

    return metricas;
  }

  async buscarMediasPorIdade() {
    const anoAtual = new Date().getFullYear();
    const idadesAlvo = [10, 11, 12];

    // Primeiro, obter todos os pacientes únicos por idade
    const pacientesPorIdade = await Pacientes.aggregate([
      {
        $addFields: {
          dataNascimentoObj: {
            $dateFromString: {
              dateString: "$data_nascimento",
              format: "%d/%m/%Y",
            },
          },
        },
      },
      {
        $addFields: {
          idadeCalculada: {
            $subtract: [
              anoAtual,
              {
                $year: "$dataNascimentoObj",
              },
            ],
          },
          fezAniversarioEsteAno: {
            $gte: [
              {
                $dateFromString: {
                  dateString: {
                    $dateToString: {
                      format: "%d/%m/%Y",
                      date: "$$NOW",
                    },
                  },
                  format: "%d/%m/%Y",
                },
              },
              {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      {
                        $dateToString: {
                          format: "%d/%m/",
                          date: "$dataNascimentoObj",
                        },
                      },
                      {
                        $dateToString: {
                          format: "%Y",
                          date: "$$NOW",
                        },
                      },
                    ],
                  },
                  format: "%d/%m/%Y",
                },
              },
            ],
          },
        },
      },
      {
        $addFields: {
          idadeFinal: {
            $cond: {
              if: "$fezAniversarioEsteAno",
              then: "$idadeCalculada",
              else: { $subtract: ["$idadeCalculada", 1] },
            },
          },
        },
      },
      { $match: { idadeFinal: { $in: idadesAlvo } } },
      {
        $group: {
          _id: "$idadeFinal",
          pacientes: { $push: "$_id" },
          totalPacientes: { $sum: 1 },
        },
      },
    ]);

    // Para cada idade, buscar os acertos totais de todas as fases
    const resultado = {};

    for (const idadeData of pacientesPorIdade) {
      const idade = idadeData._id;
      const pacienteIds = idadeData.pacientes;

      if (pacienteIds.length === 0) continue;

      // Buscar acertos de cada fase para os pacientes desta idade
      const [acertosFase1, acertosFase2, acertosFase3] = await Promise.all([
        EstatisticasFase1.aggregate([
          { $match: { usuario_id: { $in: pacienteIds } } },
          {
            $group: {
              _id: null,
              totalAcertos: { $sum: "$resumo_metricas.total_acertos" },
            },
          },
        ]),
        experimentos_fase2.aggregate([
          {
            $match: {
              client_id: { $in: pacienteIds.map((id) => id.toString()) },
            },
          },
          {
            $group: {
              _id: null,
              totalAcertos: { $sum: "$acertos" },
            },
          },
        ]),
        EstatisticasFase3.aggregate([
          { $match: { usuario_id: { $in: pacienteIds } } },
          {
            $group: {
              _id: null,
              totalAcertos: { $sum: "$resumo_metricas.total_acertos" },
            },
          },
        ]),
      ]);

      const totalAcertos =
        (acertosFase1[0]?.totalAcertos || 0) +
        (acertosFase2[0]?.totalAcertos || 0) +
        (acertosFase3[0]?.totalAcertos || 0);

      resultado[idade] = {
        totalAcertos,
        totalPacientes: idadeData.totalPacientes,
      };
    }

    return idadesAlvo.map((idade) => ({
      idade,
      mediaAcertos: resultado[idade]
        ? Number(
            (
              resultado[idade].totalAcertos / resultado[idade].totalPacientes
            ).toFixed(2),
          )
        : 0,
    }));
  }

  async buscarDadosRelatorioPaciente(doutorId, pacienteId) {
    const paciente = await this.buscarPacienteDoDoutor(doutorId, pacienteId);
    const metricas = await this.buscarMetricasPaciente(paciente._id);
    const dadosComparativos = await this.buscarMediasPorIdade();

    return {
      idPaciente: paciente._id,
      nomePaciente: paciente.nome ?? "",
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
export { formatarVariabilidadeTemporal };
