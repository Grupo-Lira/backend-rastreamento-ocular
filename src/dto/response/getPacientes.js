const getPacienteResponseDto = (paciente) => {
  if (!paciente) {
    return null;
  }

  return {
    nome: paciente.nome,
    rg: paciente.rg,
    dataNascimento: paciente.data_nascimento,
    dataAvaliacao: paciente.data_avaliacao,
    sexo: paciente.sexo,
    escolaridade: paciente.escolaridade,
    observacoes: paciente.observacoes,
  };
};

const getPacientesResponseDto = (pacientes = []) => {
  if (!Array.isArray(pacientes)) {
    return [];
  }

  return pacientes.map(getPacienteResponseDto);
};

export { getPacienteResponseDto, getPacientesResponseDto };
