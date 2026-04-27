const createPacienteDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    nome: body.nome,
    rg: body.rg,
    motivoAvaliacao: body.motivoAvaliacao,
    dataNascimento: body.dataNascimento,
    dataAvaliacao: body.dataAvaliacao,
    sexo: body.sexo,
    escolaridade: body.escolaridade,
  };
};

export default createPacienteDto;
