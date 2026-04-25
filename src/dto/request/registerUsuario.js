const registerUsuarioDto = (dadosEntrada = {}) => {
  const body = Array.isArray(dadosEntrada) ? {} : dadosEntrada;

  return {
    nome: body.nome,
    telefone: body.telefone,
    especialidade: body.especialidade,
    email: body.email,
    senha: body.senha,
  };
};

export default registerUsuarioDto;
