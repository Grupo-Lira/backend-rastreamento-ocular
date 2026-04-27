const createPacienteDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    nome: body.nome,
    rg: body.rg,
    motivo_avaliacao: body.motivo_avaliacao,
    data_nascimento: body.data_nascimento,
    data_avaliacao: body.data_avaliacao,
    sexo: body.sexo,
    escolaridade: body.escolaridade,
  };
};

export default createPacienteDto;
