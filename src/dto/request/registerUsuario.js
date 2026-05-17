const registerUsuarioDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    email: body.email,
    senha: body.senha,
  };
};

export default registerUsuarioDto;
