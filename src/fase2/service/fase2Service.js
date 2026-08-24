import { initArduino, sendToArduino } from "../../arduino/config/serial.js";
import DadosExperimentosFase2 from "../../models/ExperimentosFase2.js";
import { CONTROLE_ARDUINO, CONTROLE_MOUSE, STATUS_RODADA1, STATUS_RODADA2 } from "../../utils/constantes.js";

const ALVOS_RODADA1 = [2, 5, 7];
const ALVOS_RODADA2 = [1, 3, 6];

export const iniciar_conexao_arduino_fase2 = async (expId) => {
  initArduino();
};

export const salvarExperimentoFase2 = async (usuarioId, controleJogo = CONTROLE_MOUSE) => {
  const experiementoFase2 = await DadosExperimentosFase2.create({
    client_id: usuarioId,
    status: STATUS_RODADA1,
    gabarito: {
      rodada1: ALVOS_RODADA1,
      rodada2: ALVOS_RODADA2,
    },
    respostas: {
      rodada1: [],
      rodada2: [],
    },
    acertos: 0,
    planetas_vistos: 0,
    planetas_ignorados: 0,
    controle_jogo: controleJogo,
  });

  return experiementoFase2;
};

export const getPlanetaNumero = (socket, planetaNumero, expId) => {
  console.debug(
    `Recebido planeta selecionado: ${planetaNumero} do cliente ${socket.id}`,
  );
  return processarSelecaoPlaneta(socket, planetaNumero, expId);
};

// função que processa a seleção de um planeta na fase 2 (chamar no IOT)
const processarSelecaoPlaneta = async (socket, planeta, expId) => {
  const experimento = await getExperimentoFase2Mongo(expId);
  if (!experimento) return;

  const rodadaKey =
    experimento.status === STATUS_RODADA1 ? "rodada1" : "rodada2";

  const rodadaCampoMongo = `respostas.${rodadaKey}`;
  const alvosAtuais = experimento.gabarito?.[rodadaKey] || [];
  const respostasAtuais = experimento.respostas?.[rodadaKey] || [];
  if (respostasAtuais.length >= alvosAtuais.length) {
    return;
  }

  const correto = alvosAtuais.includes(planeta);

  let acertosAtualizados = experimento.acertos;
  let errosAtualizados = experimento.planetas_ignorados || 0;
  let planetasVistosAtualizados = experimento.planetas_vistos;
  if (correto) {
    acertosAtualizados++;
    planetasVistosAtualizados++;
  } else {
    errosAtualizados++;
  }

  const atualizado = await DadosExperimentosFase2.findByIdAndUpdate(
    experimento._id,
    {
      $push: { [rodadaCampoMongo]: planeta },
      $set: {
        acertos: acertosAtualizados,
        erros_fase2: errosAtualizados,
        planetas_vistos: planetasVistosAtualizados,
        planetas_ignorados: errosAtualizados,
      },
    },
    { new: true },
  );

  // envia a resposta ao cliente
  socket.emit("resposta_planeta", {
    planeta,
    correto,
  });

  const respostasRodadaAtualizada = atualizado.respostas?.[rodadaKey] || [];

  if (respostasRodadaAtualizada.length >= alvosAtuais.length) {
    await finalizarRodadaFase2(socket, atualizado);
  }
};

const finalizarRodadaFase2 = async (socket, experimento) => {
  if (experimento.controle_jogo === CONTROLE_ARDUINO) {
    sendToArduino("LED_SELECAO_OFF");
  }

  if (experimento.status === STATUS_RODADA1) {
    socket.emit("fase_2_rodada_1_finalizada", {
      fase: 2,
      mensagem: "Selecione continuar para iniciar a rodada 2.",
    });
    experimento.status = STATUS_RODADA2;
    await DadosExperimentosFase2.findByIdAndUpdate(experimento._id, {
      status: STATUS_RODADA2,
    });
  } else {
    const planetasVistosEIgnorados = getPlanetasVistosEIgnorados(experimento.gabarito, experimento.respostas);
    socket.emit("fase_atual_finalizada", {
      fase: 2,
      mensagem: "Fase 2 (atenção seletiva) concluída.",
      acertos: experimento.acertos,
      planetas_vistos: planetasVistosEIgnorados.planetasVistos,
      planetas_ignorados: planetasVistosEIgnorados.planetasIgnorados,
    });

    socket.emit("experimento_concluido", {
      mensagem: "Experimento finalizado após fase 2.",
    });
  }
};
const getPlanetasVistosEIgnorados = (gabarito, respostaUsuario) => {
  const planetasVistos = getPlanetasDoGabaritoVistos(gabarito, respostaUsuario);
  const planetasIgnorados = getPlanetasDoGabaritoIgnorados(gabarito, respostaUsuario);
  return { planetasVistos, planetasIgnorados };
}

const getPlanetasDoGabaritoVistos = (gabarito, respostaUsuario) => {
  const planetasVistosRodada1 = respostaUsuario.rodada1.filter((planetaId) => gabarito.rodada1.includes(planetaId));
  const planetasVistosRodada2 = respostaUsuario.rodada2.filter((planetaId) => gabarito.rodada2.includes(planetaId));
  return [...planetasVistosRodada1, ...planetasVistosRodada2];
}

const getPlanetasDoGabaritoIgnorados = (gabarito, respostaUsuario) => {
  const planetasIgnoradosRodada1 = gabarito.rodada1.filter((planetaId) => !respostaUsuario.rodada1.includes(planetaId));
  const planetasIgnoradosRodada2 = gabarito.rodada2.filter((planetaId) => !respostaUsuario.rodada2.includes(planetaId));
  return [...planetasIgnoradosRodada1, ...planetasIgnoradosRodada2];
}

const getExperimentoFase2Mongo = async (expId) => {
  const experimento = await DadosExperimentosFase2.findById(expId);
  return experimento;
};
