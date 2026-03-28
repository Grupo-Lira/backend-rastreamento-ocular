const getPacienteResponseDto = (paciente) => {
  if (!paciente) {
    return null;
  }

  return {
    nome: paciente.nome,
    dataNascimento: paciente.data_nascimento,
    sexo: paciente.sexo,
    escolaridade: paciente.escolaridade,
    observacoes: paciente.observacoes,
    criadoEm: paciente.criado_em,
  };
};

const getPacientesResponseDto = (pacientes = []) => {
  if (!Array.isArray(pacientes)) {
    return [];
  }

  return pacientes.map(getPacienteResponseDto);
};

export { getPacienteResponseDto, getPacientesResponseDto };
