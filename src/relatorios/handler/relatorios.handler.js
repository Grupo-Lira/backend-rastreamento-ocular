import relatorioService from "../service/relatorioService.js";

const gerarDadosRelatorioPacienteHandler = async (req, res) => {
  try {
    const dadosRelatorio = await relatorioService.buscarDadosRelatorioPaciente(
      req.user.id,
      req.params.id,
    );

    return res.status(200).json({ data: dadosRelatorio });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export { gerarDadosRelatorioPacienteHandler };

