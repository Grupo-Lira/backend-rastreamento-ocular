import { salvarFeedbackProfissional } from "../service/estatisticasService.js";

export const salvarFeedbackProfissionalHandler = async (req, res) => {
  try {
    const registro = await salvarFeedbackProfissional({
      doutorId: req.user.id,
      fase: Number(req.body?.fase),
      experimentoId: req.body?.experimentoId,
      feedbackProfissional: req.body?.feedbackProfissional,
      notaDoProfissional: Number(req.body?.notaDoProfissional),
      modoTreinamento: req.body?.modoTreinamento,
    });

    return res.status(200).json({ data: registro });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
