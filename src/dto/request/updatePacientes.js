const CAMPOS_ATUALIZAVEIS = [
  "nome",
  "data_nascimento",
  "sexo",
  "escolaridade",
  "observacoes",
];

const updatePacientesDto = (dadosEntrada = {}) => {
  const body =
    dadosEntrada &&
    typeof dadosEntrada === "object" &&
    !Array.isArray(dadosEntrada)
      ? dadosEntrada
      : {};

  const dto = {};

  for (const campo of CAMPOS_ATUALIZAVEIS) {
    if (!(campo in body) || body[campo] === undefined) {
      continue;
    }

    dto[campo] = body[campo];
  }

  return dto;
};

export default updatePacientesDto;
