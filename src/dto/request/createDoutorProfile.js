const createDoutorProfileDto = (dadosEntrada = {}) => {
  const body =
    dadosEntrada &&
    typeof dadosEntrada === "object" &&
    !Array.isArray(dadosEntrada)
      ? dadosEntrada
      : {};

  return {
    nome: body.nome,
    telefone: body.telefone,
    especialidade: body.especialidade,
  };
};

export default createDoutorProfileDto;
