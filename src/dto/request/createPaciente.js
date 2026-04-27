const createPacienteDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    nome: body.nome,
    rg: body.rg,
    data_nascimento: body.data_nascimento,
    data_avaliacao: body.data_avaliacao,
    sexo: body.sexo,
    escolaridade: body.escolaridade,
    observacoes: body.observacoes,
  };
};

export default createPacienteDto;
