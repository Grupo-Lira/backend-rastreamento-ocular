import { getPacienteResponseDto } from "../../dto/response/getPacientes.js";
import { getById } from "../../pacientes/service/pacienteService.js";
import relatorioPdfService from "../service/relatorioPdfService.js";

const gerarRelatorioPdfHandler = async (req, res) => {
  try {
    const pacienteId = req.params.id;

    const paciente = await getById(req.user.id, pacienteId);
    const pacienteComMetricas = await getPacienteResponseDto(paciente);


    const resultado = await relatorioPdfService.gerarRelatorioPaciente(
      pacienteId,
      pacienteComMetricas,
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${resultado.fileName}"`,
    );

    res.sendFile(resultado.filePath, (err) => {
      if (err) {
        console.error("Erro ao enviar arquivo PDF:", err);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: "Erro ao fazer download do relatório" });
        }
      }
    });
  } catch (err) {
    console.error("Erro ao gerar relatório PDF:", err);
    res.status(err.status || 500).json({
      error: err.message || "Erro ao gerar relatório PDF",
    });
  }
};

export { gerarRelatorioPdfHandler };
