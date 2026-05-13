const getUsuarioResponseDto = (usuario) => {
  if (!usuario) {
    return null;
  }

  return {
    id: usuario._id,
    nome: usuario.nome,
    telefone: usuario.telefone,
    especialidade: usuario.especialidade,
    email: usuario.email,
    pacientesIds: Array.isArray(usuario.pacientes_ids)
      ? usuario.pacientes_ids.map((id) => id?.toString()).filter(Boolean)
      : [],
  };
};

export { getUsuarioResponseDto };
