import relatorioService from "../../relatorios/service/relatorioService.js";

const getPacienteResponseDto = async (paciente) => {
  if (!paciente) {
    return null;
  }

  const hoje = new Date();
  const dataNascimento = paciente.data_nascimento;

  let dataParseada = new Date(dataNascimento);
  let idade = 0;

  if (dataNascimento) {
    if (isNaN(dataParseada.getTime())) {
      const partes = dataNascimento.split("/");
      if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const ano = parseInt(partes[2], 10);
        dataParseada = new Date(ano, mes, dia);
      }
    }

    idade = hoje.getFullYear() - dataParseada.getFullYear();

    const mesAtual = hoje.getMonth();
    const diaAtual = hoje.getDate();
    const mesNascimento = dataParseada.getMonth();
    const diaNascimento = dataParseada.getDate();

    if (
      mesAtual < mesNascimento ||
      (mesAtual === mesNascimento && diaAtual < diaNascimento)
    ) {
      idade--;
    }
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
        relatorioService.formatarVariabilidadeTemporal(
          metricas.variabilidadeTemporalRespostasMs,
          metricas.tempoReacaoMs,
        ),
      acertos: metricas.acertos,
      errosOmissao: metricas.errosOmissao,
      errosComissao: metricas.errosComissao,
      dadosComparativos: dadosComparativos,
      idade: idade,
    };
  } else if (paciente.metricas) {
    pacienteDto.metricas = paciente.metricas;
  }

  return pacienteDto;
};

const getPacientesResponseDto = async (pacientes = []) => {
  if (!Array.isArray(pacientes)) {
    return [];
  }

  const pacientesDto = [];
  for (const paciente of pacientes) {
    try {
      const pacienteDto = await getPacienteResponseDto(paciente);
      if (pacienteDto) {
        pacientesDto.push(pacienteDto);
      }
    } catch (error) {}
  }

  return pacientesDto;
};

export { getPacienteResponseDto, getPacientesResponseDto };
