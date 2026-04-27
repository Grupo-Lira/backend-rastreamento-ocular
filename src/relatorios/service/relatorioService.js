import mongoose from "mongoose";

import EstatisticasFase1 from "../../models/EstatisticasFase1.js";
import EstatisticasFase3 from "../../models/EstatisticasFase3.js";
import Pacientes from "../../models/Pacientes.js";
import ResultadoAnalise from "../../models/ResultadoAnalise.js";

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
    const [resultadoAnalise, estatisticaFase1, estatisticaFase3] =
      await Promise.all([
        ResultadoAnalise.findOne({ client_id: String(pacienteId) })
          .sort({ timestamp_analise: -1 })
          .lean(),
        EstatisticasFase1.findOne({ usuario_id: pacienteId })
          .sort({ timestamp_analise: -1 })
          .lean(),
        EstatisticasFase3.findOne({ usuario_id: String(pacienteId) })
          .sort({ timestamp_analise: -1 })
          .lean(),
      ]);

    const fonteComResumo =
      resultadoAnalise?.resumo_metricas ||
      estatisticaFase3?.resumo_metricas ||
      estatisticaFase1?.resumo_metricas
        ? (resultadoAnalise ?? estatisticaFase3 ?? estatisticaFase1)
        : null;

    if (!fonteComResumo) {
      return {
        tempoReacaoMs: null,
        acertos: 0,
        errosOmissao: 0,
        errosComissao: 0,
      };
    }

    return extrairResumoMetricas(fonteComResumo);
  }

async buscarMediasPorIdade() {
    const anoAtual = new Date().getFullYear();
    const idadesAlvo = [10, 11, 12];

    const medias = await ResultadoAnalise.aggregate([
      {
        $lookup: {
          from: "pacientes",
          let: { clientId: "$client_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", { $toObjectId: "$$clientId" }] }
              }
            }
          ],
          as: "dados_paciente"
        }
      },
      { $unwind: "$dados_paciente" },
      {
        $addFields: {
          idadeCalculada: {
            $subtract: [
              anoAtual,
              { $year: { $dateFromString: { dateString: "$dados_paciente.data_nascimento" } } }
            ]
          }
        }
      },
      { $match: { idadeCalculada: { $in: idadesAlvo } } },
      {
        $group: {
          _id: "$idadeCalculada",
          mediaAcertos: { $avg: "$resumo_metricas.total_acertos" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return idadesAlvo.map(idade => {
      const dado = medias.find(m => m._id === idade);
      return {
        idade: idade,
        mediaAcertos: dado ? Number(dado.mediaAcertos.toFixed(2)) : 0
      };
    });
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
