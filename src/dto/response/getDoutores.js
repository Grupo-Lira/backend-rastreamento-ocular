const mapPacientesIds = (pacientesIds = []) => {
  if (!Array.isArray(pacientesIds)) {
    return [];
  }

  return pacientesIds.map((id) => id?.toString()).filter(Boolean);
};

const getDoutorResponseDto = (doutor) => {
  if (!doutor) {
    return null;
  }

  return {
    nome: doutor.nome,
    email: doutor.email,
    telefone: doutor.telefone,
    especialidade: doutor.especialidade,
    pacientesIds: mapPacientesIds(doutor.pacientes_ids),
    criadoEm: doutor.criado_em,
  };
};

const getDoutoresResponseDto = (doutores = []) => {
  if (!Array.isArray(doutores)) {
    return [];
  }

  return doutores.map(getDoutorResponseDto);
};

export { getDoutoresResponseDto, getDoutorResponseDto };

