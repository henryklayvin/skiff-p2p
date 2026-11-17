// Leitura das estatísticas WebRTC (getStats) para identificar o par de candidatos
// efetivamente selecionado pela conexão.
//
// Regra do experimento: a retransmissão TURN só é considerada comprovada quando o
// candidato LOCAL do par selecionado for do tipo "relay". Uma transferência
// bem-sucedida, sozinha, não comprova retransmissão.

function descreverCandidato(candidato) {
  if (!candidato) {
    return null;
  }
  return {
    tipo: candidato.candidateType ?? null, // host | srflx | prflx | relay
    protocolo: candidato.protocol ?? null, // udp | tcp
    protocoloAteOTurn: candidato.relayProtocol ?? null, // só em candidatos relay
  };
}

/**
 * Retorna o par de candidatos selecionado, ou null se ainda não houver.
 * Usa transport.selectedCandidatePairId (padrão) e, se indisponível,
 * o candidate-pair marcado como selecionado (Firefox) ou nomeado e bem-sucedido.
 */
export async function obterParSelecionado(conexao) {
  const relatorio = await conexao.getStats();
  let par = null;

  relatorio.forEach((estatistica) => {
    if (!par && estatistica.type === 'transport' && estatistica.selectedCandidatePairId) {
      par = relatorio.get(estatistica.selectedCandidatePairId) ?? null;
    }
  });
  if (!par) {
    relatorio.forEach((estatistica) => {
      const ehParDeCandidatos = estatistica.type === 'candidate-pair';
      if (!par && ehParDeCandidatos && (estatistica.selected || (estatistica.nominated && estatistica.state === 'succeeded'))) {
        par = estatistica;
      }
    });
  }
  if (!par) {
    return null;
  }

  return {
    estado: par.state ?? null,
    tempoDeIdaEVoltaMs: typeof par.currentRoundTripTime === 'number' ? par.currentRoundTripTime * 1000 : null,
    bytesEnviados: par.bytesSent ?? null,
    bytesRecebidos: par.bytesReceived ?? null,
    local: descreverCandidato(relatorio.get(par.localCandidateId)),
    remoto: descreverCandidato(relatorio.get(par.remoteCandidateId)),
  };
}

/** "retransmitida" se o candidato local do par selecionado for relay; "direta" caso contrário. */
export function classificarCaminho(par) {
  if (!par || !par.local) {
    return 'indefinido';
  }
  return par.local.tipo === 'relay' ? 'retransmitida (TURN)' : 'direta';
}
