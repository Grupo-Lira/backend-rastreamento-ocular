import relatorioService from "../../relatorios/service/relatorioService.js";

const getPacienteResponseDto = async (paciente) => {
  if (!paciente) {
    return null;
  }

  const pacienteDto = {
    id: paciente._id,
    nome: paciente.nome,
    rg: paciente.rg,
    motivoAvaliacao: paciente.motivo_avaliacao,
    dataNascimento: paciente.data_nascimento,
    dataAvaliacao: paciente.data_avaliacao,
    sexo: paciente.sexo,
    escolaridade: paciente.escolaridade,
    observacoes: paciente.observacoes,
  };

  const metricas = await relatorioService.buscarMetricasPaciente(paciente._id);

  if (metricas) {
    const dadosComparativos = await relatorioService.buscarMediasPorIdade();

    pacienteDto.metricas = {
      tempoReacao: metricas.tempoReacaoMs
        ? `${(metricas.tempoReacaoMs / 1000).toFixed(2)}s`
        : null,
      variabilidadeTemporalRespostas:
        metricas.variabilidadeTemporalRespostasMs && metricas.tempoReacaoMs
          ? `${((metricas.variabilidadeTemporalRespostasMs / metricas.tempoReacaoMs) * 100).toFixed(2)}%`
          : null,
      acertos: metricas.acertos,
      errosOmissao: metricas.errosOmissao,
      errosComissao: metricas.errosComissao,
      dadosComparativos: dadosComparativos,
    };
  }

  return pacienteDto;
};

const getPacientesResponseDto = async (pacientes = []) => {
  if (!Array.isArray(pacientes)) {
    return [];
  }
  try {
    const pacientesDto = [];
    for (const paciente of pacientes) {
      const pacienteDto = await getPacienteResponseDto(paciente);
      pacientesDto.push(pacienteDto);
    }

    return pacientesDto;
  } catch (error) {
    console.error("Erro em getPacientesResponseDto:", error);
    return [];
  }
};

export { getPacienteResponseDto, getPacientesResponseDto };
