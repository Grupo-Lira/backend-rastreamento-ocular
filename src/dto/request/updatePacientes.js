const updatePacientesDto = (dadosEntrada = {}) => {
  if (Array.isArray(dadosEntrada)) {
    return {};
  }

  const dto = {};

  for (const campo of ["nome", "rg", "data_nascimento", "data_avaliacao", "sexo", "escolaridade", "observacoes"]) {
    if (dadosEntrada[campo] !== undefined) {
      dto[campo] = dadosEntrada[campo];
    }
  }

  return dto;
};

export default updatePacientesDto;
