const getUsuarioResponseDto = (usuario) => {
  if (!usuario) {
    return null;
  }

  return {
    email: usuario.email,
    role: usuario.role,
    criadoEm: usuario.criado_em,
  };
};

const getUsuariosResponseDto = (usuarios = []) => {
  if (!Array.isArray(usuarios)) {
    return [];
  }

  return usuarios.map(getUsuarioResponseDto);
};

export { getUsuarioResponseDto, getUsuariosResponseDto };
