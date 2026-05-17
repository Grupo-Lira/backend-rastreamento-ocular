const updateUsuariosDto = (dadosEntrada = {}) => {
  if (Array.isArray(dadosEntrada)) {
    return {};
  }

  const dto = {};

  for (const campo of ["nome", "telefone", "especialidade", "email"]) {
    if (dadosEntrada[campo] !== undefined) {
      dto[campo] = dadosEntrada[campo];
    }
  }

  return dto;
};

export default updateUsuariosDto;
