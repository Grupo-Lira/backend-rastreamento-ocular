const createPacienteDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    nome: body.nome,
    rg: body.rg,
    motivo_avaliacao: body.motivoAvaliacao,
    data_nascimento: body.dataNascimento,
    data_avaliacao: body.dataAvaliacao,
    sexo: body.sexo,
    escolaridade: body.escolaridade,
  };
};

export default createPacienteDto;
