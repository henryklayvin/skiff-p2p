// Conexão WebRTC com troca manual de SDP (protótipo descartável da Etapa 1).
//
// Fluxo:
//   A: gerarOferta()        -> copia o texto para B
//   B: responderOferta()    -> copia o texto de volta para A
//   A: aplicarResposta()
//
// Os candidatos ICE são incluídos no próprio SDP: esperamos a coleta terminar
// antes de entregar o texto ("non-trickle ICE"). Assim cada lado copia um único
// texto, sem precisar de um canal de sinalização.

export const CONFIGURACAO_ICE_PADRAO = Object.freeze({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

// Os dois canais são "negociados": ambos os lados os criam com o mesmo id.
// Isso evita depender do evento "datachannel" e deixa a criação simétrica.
const DEFINICAO_DOS_CANAIS = Object.freeze({
  controle: { negotiated: true, id: 0, ordered: true },
  dados: { negotiated: true, id: 1, ordered: true },
});

const TAMANHO_MAXIMO_DO_TEXTO_SDP = 100_000; // proteção contra colagem acidental de textos enormes
const LIMITE_DA_COLETA_DE_CANDIDATOS_MS = 10_000;

/**
 * Cria a RTCPeerConnection e os canais "controle" e "dados".
 * @param {RTCConfiguration} configuracao
 * @param {(evento: string, estado: object) => void} [aoMudarEstado]
 */
export function criarConexao(configuracao = CONFIGURACAO_ICE_PADRAO, aoMudarEstado = () => {}) {
  const conexao = new RTCPeerConnection(configuracao);

  const canais = {
    controle: conexao.createDataChannel('controle', DEFINICAO_DOS_CANAIS.controle),
    dados: conexao.createDataChannel('dados', DEFINICAO_DOS_CANAIS.dados),
  };
  canais.dados.binaryType = 'arraybuffer';

  const notificar = (evento) => aoMudarEstado(evento, lerEstados(conexao));
  for (const evento of [
    'signalingstatechange',
    'icegatheringstatechange',
    'iceconnectionstatechange',
    'connectionstatechange',
  ]) {
    conexao.addEventListener(evento, () => notificar(evento));
  }

  return { conexao, canais };
}

export function lerEstados(conexao) {
  return {
    sinalizacao: conexao.signalingState,
    coletaIce: conexao.iceGatheringState,
    conexaoIce: conexao.iceConnectionState,
    conexao: conexao.connectionState,
  };
}

/**
 * Aguarda a coleta de candidatos terminar. Se ela não terminar no prazo
 * (ex.: servidor STUN/TURN inacessível), segue com os candidatos já coletados.
 * @returns {Promise<{concluida: boolean}>}
 */
export function aguardarColetaDeCandidatos(conexao, limiteMs = LIMITE_DA_COLETA_DE_CANDIDATOS_MS) {
  if (conexao.iceGatheringState === 'complete') {
    return Promise.resolve({ concluida: true });
  }
  return new Promise((concluir) => {
    const verificar = () => {
      if (conexao.iceGatheringState === 'complete') {
        finalizar(true);
      }
    };
    const finalizar = (concluida) => {
      clearTimeout(temporizador);
      conexao.removeEventListener('icegatheringstatechange', verificar);
      concluir({ concluida });
    };
    const temporizador = setTimeout(() => finalizar(false), limiteMs);
    conexao.addEventListener('icegatheringstatechange', verificar);
  });
}

/** Lado A: cria a oferta e devolve o texto a ser enviado para B. */
export async function gerarOferta(conexao) {
  await conexao.setLocalDescription(await conexao.createOffer());
  const coleta = await aguardarColetaDeCandidatos(conexao);
  return { texto: serializarDescricao(conexao.localDescription), coletaConcluida: coleta.concluida };
}

/** Lado B: aplica a oferta de A e devolve o texto da resposta. */
export async function responderOferta(conexao, textoDaOferta) {
  await conexao.setRemoteDescription(desserializarDescricao(textoDaOferta, 'offer'));
  await conexao.setLocalDescription(await conexao.createAnswer());
  const coleta = await aguardarColetaDeCandidatos(conexao);
  return { texto: serializarDescricao(conexao.localDescription), coletaConcluida: coleta.concluida };
}

/** Lado A: aplica a resposta de B. */
export async function aplicarResposta(conexao, textoDaResposta) {
  await conexao.setRemoteDescription(desserializarDescricao(textoDaResposta, 'answer'));
}

export function serializarDescricao(descricao) {
  return JSON.stringify({ type: descricao.type, sdp: descricao.sdp });
}

export function desserializarDescricao(texto, tipoEsperado) {
  const conteudo = String(texto ?? '').trim();
  if (conteudo.length === 0) {
    throw new Error('O texto está vazio.');
  }
  if (conteudo.length > TAMANHO_MAXIMO_DO_TEXTO_SDP) {
    throw new Error('O texto é grande demais para ser um SDP.');
  }
  let descricao;
  try {
    descricao = JSON.parse(conteudo);
  } catch {
    throw new Error('O texto colado não é um SDP válido deste protótipo (JSON inválido).');
  }
  if (descricao?.type !== tipoEsperado || typeof descricao.sdp !== 'string') {
    const nomes = { offer: 'uma oferta', answer: 'uma resposta' };
    throw new Error(`Era esperado ${nomes[tipoEsperado]}, mas o texto colado é "${descricao?.type ?? 'desconhecido'}".`);
  }
  return { type: descricao.type, sdp: descricao.sdp };
}

/** Conta os candidatos ICE por tipo (host, srflx, relay, prflx) contidos num SDP. */
export function contarCandidatos(sdp) {
  const contagem = { host: 0, srflx: 0, relay: 0, prflx: 0 };
  for (const [, tipo] of sdp.matchAll(/^a=candidate:.* typ (\w+)/gm)) {
    contagem[tipo] = (contagem[tipo] ?? 0) + 1;
  }
  return contagem;
}
