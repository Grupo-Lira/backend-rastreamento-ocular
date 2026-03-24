const registerUsuarioDto = (dadosEntrada = {}) => {
  const body =
    dadosEntrada &&
    typeof dadosEntrada === "object" &&
    !Array.isArray(dadosEntrada)
      ? dadosEntrada
      : {};

  return {
    email: body.email,
    senha: body.senha,
  };
};

export default registerUsuarioDto;
