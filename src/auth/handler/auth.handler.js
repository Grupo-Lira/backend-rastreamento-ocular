import loginUsuarioDto from "../../dto/request/loginUsuario.js";
import registerUsuarioDto from "../../dto/request/registerUsuario.js";
import { login, registrarUser } from "../service/authService.js";

const registerHandler = async (req, res) => {
  try {
    const dadosDto = registerUsuarioDto(req.body);
    await registrarUser(dadosDto);
    return res.status(201).send();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const loginHandler = async (req, res) => {
  try {
    const credenciaisDto = loginUsuarioDto(req.body); 
    const resultado = await login(credenciaisDto); 
    return res.status(200).json({ token: resultado.token });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export { loginHandler, registerHandler };

