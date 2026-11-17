// Envio de um arquivo.
//
// P4: leitura em partes, divisão em blocos e controle de fluxo LOCAL (bufferedAmount).
// P5: confirmações (ACK) do destinatário e janela PONTA A PONTA de bytes não confirmados.
//
// Fluxo no canal "controle":
//   remetente    -> oferta-transferencia   (nome, tamanho, tipo e parâmetros de confirmação)
//   destinatário -> aceitar-transferencia  (ou recusar-transferencia)
//   remetente    -> blocos no canal "dados"
//   destinatário -> confirmacao            (bytes gravados, a cada 1 MiB ou 250 ms)
//   remetente    -> arquivo-concluido      (SHA-256 calculado durante a leitura)        [P6]
//   destinatário -> arquivo-verificado     (hash conferiu) ou arquivo-falhou            [P6]
//
// Os blocos só começam depois do aceite: "controle" e "dados" são canais diferentes,
// sem garantia de ordem entre eles.
//
// Três contadores distintos (ADR 0008):
//   bytesEnviados    entregues ao send() — podem ainda estar no buffer local
//   bytesRecebidos   contados no destinatário (não visíveis aqui)
//   bytesConfirmados gravados no destinatário e informados por "confirmacao"

import { PARAMETROS_PADRAO } from './parametros.js';
import { conteudoPorBloco, gerarIdDeTransferencia, montarBloco } from './protocolo-de-dados.js';
import { criarCalculadoraSha256 } from './hash.js';

// Falhas provocadas de propósito, para comprovar a detecção (P6). Aplicadas ao bloco do meio.
export const FALHAS_PROVOCADAS = Object.freeze(['nenhuma', 'corromper-bloco', 'pular-bloco']);

/** Promessa que é rejeitada quando abortar() é chamado. Usada com Promise.race. */
function criarAbortador() {
  let rejeitar;
  const promessa = new Promise((_, falhar) => {
    rejeitar = falhar;
  });
  promessa.catch(() => {}); // evita aviso de rejeição não tratada
  return { promessa, abortar: (erro) => rejeitar(erro) };
}

/** Espera o bufferedAmount cair até o limiar baixo. */
function aguardarEspacoNoBuffer(canal) {
  return new Promise((continuar, falhar) => {
    const limpar = () => {
      canal.removeEventListener('bufferedamountlow', aoBaixar);
      canal.removeEventListener('close', aoFechar);
    };
    const aoBaixar = () => {
      limpar();
      continuar();
    };
    const aoFechar = () => {
      limpar();
      falhar(new Error('O canal "dados" foi fechado durante o envio.'));
    };
    canal.addEventListener('bufferedamountlow', aoBaixar);
    canal.addEventListener('close', aoFechar);
  });
}

/** Aguarda uma mensagem de um dos tipos informados, para a transferência indicada. */
function aguardarMensagem(controle, tipos, idTransferencia, limiteMs) {
  return new Promise((receber, falhar) => {
    const temporizador = limiteMs
      ? setTimeout(() => falhar(new Error(`Sem resposta do destinatário (${tipos.join(' / ')}).`)), limiteMs)
      : null;
    for (const tipo of tipos) {
      controle.aoReceber(tipo, (mensagem) => {
        if (mensagem.idTransferencia === idTransferencia) {
          clearTimeout(temporizador);
          receber(mensagem);
        }
      });
    }
  });
}

/**
 * Envia um arquivo.
 * @param {{arquivo: File, canalDeDados: RTCDataChannel, controle: object, parametros?: object,
 *          aoProgredir?: (progresso: object) => void, aoRegistrar?: (texto: string) => void}} opcoes
 */
export async function enviarArquivo({
  arquivo,
  canalDeDados,
  controle,
  parametros = PARAMETROS_PADRAO,
  falhaProvocada = 'nenhuma',
  aoProgredir = () => {},
  aoRegistrar = () => {},
}) {
  if (!FALHAS_PROVOCADAS.includes(falhaProvocada)) {
    throw new Error(`Falha provocada desconhecida: ${falhaProvocada}`);
  }
  const {
    tamanhoDoBloco, tamanhoDaLeitura, limiarAltoDoBuffer, limiarBaixoDoBuffer, prazoDeAceiteMs,
    intervaloDeConfirmacaoBytes, intervaloDeConfirmacaoMs, janelaDeBytesNaoConfirmados, prazoSemConfirmacaoMs,
  } = parametros;
  if (limiarBaixoDoBuffer >= limiarAltoDoBuffer) {
    throw new Error('O limiar baixo do buffer deve ser menor que o limiar alto.');
  }
  if (janelaDeBytesNaoConfirmados < tamanhoDoBloco) {
    throw new Error('A janela deve comportar pelo menos um bloco.');
  }
  if (canalDeDados.readyState !== 'open') {
    throw new Error('O canal "dados" não está aberto.');
  }

  const idTransferencia = gerarIdDeTransferencia();
  const indiceDoArquivo = 0;
  const bytesPorBloco = conteudoPorBloco(tamanhoDoBloco);
  const blocoAlvoDaFalha = Math.floor(Math.ceil(arquivo.size / bytesPorBloco) / 2);
  const hash = await criarCalculadoraSha256();
  canalDeDados.bufferedAmountLowThreshold = limiarBaixoDoBuffer;

  // ---------- 1. Oferta e aceite ----------
  const resposta = aguardarMensagem(controle, ['aceitar-transferencia', 'recusar-transferencia'], idTransferencia, prazoDeAceiteMs);
  controle.enviar({
    tipo: 'oferta-transferencia',
    idTransferencia,
    arquivos: [{ indice: indiceDoArquivo, nome: arquivo.name, tamanho: arquivo.size, tipoMime: arquivo.type || 'application/octet-stream' }],
    tamanhoDoBloco,
    confirmacao: { intervaloBytes: intervaloDeConfirmacaoBytes, intervaloMs: intervaloDeConfirmacaoMs },
  });
  aoRegistrar(`Oferta enviada: ${arquivo.size} bytes`);
  if ((await resposta).tipo === 'recusar-transferencia') {
    throw new Error('O destinatário recusou a transferência.');
  }

  // ---------- 2. Estado do envio, confirmações e detecção de travamento ----------
  const inicio = performance.now();
  const abortador = criarAbortador();
  let bytesEnviados = 0;
  let bytesConfirmados = 0;
  let sequencia = 0;
  let maiorBufferObservado = 0;
  let maiorJanelaObservada = 0;
  let pausasPorBufferCheio = 0;
  let pausasPorJanelaCheia = 0;
  let confirmacoesRecebidas = 0;
  let ultimoAvancoEm = performance.now();
  let liberarJanela = null; // função que acorda o envio quando a janela abre
  let ultimoProgresso = 0;
  // Instantes (ms desde o início) em que os bytes confirmados passaram de 25%, 50%, 75% e 100%.
  const marcosConfirmadosMs = [];

  const naoConfirmados = () => bytesEnviados - bytesConfirmados;

  controle.aoReceber('confirmacao', (mensagem) => {
    if (mensagem.idTransferencia !== idTransferencia || !Number.isSafeInteger(mensagem.bytesConfirmados)) {
      return;
    }
    if (mensagem.bytesConfirmados > bytesEnviados) {
      abortador.abortar(new Error('O destinatário confirmou mais bytes do que foram enviados.'));
      return;
    }
    confirmacoesRecebidas++;
    if (mensagem.bytesConfirmados > bytesConfirmados) {
      bytesConfirmados = mensagem.bytesConfirmados;
      ultimoAvancoEm = performance.now();
      while (marcosConfirmadosMs.length < 4 && bytesConfirmados >= (arquivo.size * (marcosConfirmadosMs.length + 1)) / 4) {
        marcosConfirmadosMs.push(Math.round(ultimoAvancoEm - inicio));
      }
      if (liberarJanela && naoConfirmados() < janelaDeBytesNaoConfirmados) {
        liberarJanela();
      }
    }
  });

  const vigia = setInterval(() => {
    const parado = performance.now() - ultimoAvancoEm;
    if (naoConfirmados() > 0 && parado > prazoSemConfirmacaoMs) {
      abortador.abortar(new Error(`Sem confirmações do destinatário há ${Math.round(parado / 1000)} s.`));
    }
  }, 1_000);

  const aguardarJanela = () => new Promise((continuar) => {
    liberarJanela = () => {
      liberarJanela = null;
      continuar();
    };
  });

  const informarProgresso = (forcar = false) => {
    const agora = performance.now();
    if (forcar || agora - ultimoProgresso >= 100) {
      ultimoProgresso = agora;
      aoProgredir({
        bytesEnviados, bytesConfirmados, total: arquivo.size,
        bufferAtual: canalDeDados.bufferedAmount, maiorBufferObservado,
        janelaAtual: naoConfirmados(), maiorJanelaObservada, decorridoMs: agora - inicio,
      });
    }
  };

  // A resposta final é registrada antes de enviar o último bloco, para não perdê-la.
  const confirmacaoFinal = aguardarMensagem(
    controle,
    ['arquivo-verificado', 'arquivo-falhou', 'erro-transferencia'],
    idTransferencia,
    0,
  );
  // Um erro informado pelo destinatário no meio do envio interrompe o envio imediatamente.
  confirmacaoFinal.then((mensagem) => {
    if (mensagem.tipo === 'erro-transferencia') {
      abortador.abortar(new Error(`O destinatário informou erro: ${mensagem.motivo}`));
    } else if (mensagem.tipo === 'arquivo-falhou') {
      abortador.abortar(new Error(`Falha de integridade informada pelo destinatário: ${mensagem.motivo}`));
    }
  });

  try {
    // ---------- 3. Leitura em partes e envio em blocos ----------
    for (let posicao = 0; posicao < arquivo.size; posicao += tamanhoDaLeitura) {
      const parte = new Uint8Array(await Promise.race([
        arquivo.slice(posicao, posicao + tamanhoDaLeitura).arrayBuffer(),
        abortador.promessa,
      ]));
      hash.atualizar(parte); // hash do conteúdo ORIGINAL, durante a leitura
      for (let deslocamento = 0; deslocamento < parte.byteLength; deslocamento += bytesPorBloco) {
        let conteudo = parte.subarray(deslocamento, deslocamento + bytesPorBloco);

        if (sequencia === blocoAlvoDaFalha && falhaProvocada === 'pular-bloco') {
          aoRegistrar(`Falha provocada: bloco ${sequencia} não será enviado`);
          sequencia++;
          continue;
        }
        if (sequencia === blocoAlvoDaFalha && falhaProvocada === 'corromper-bloco') {
          conteudo = conteudo.slice(); // cópia: não altera o que já entrou no hash
          conteudo[0] ^= 0xff;
          aoRegistrar(`Falha provocada: primeiro byte do bloco ${sequencia} invertido`);
        }

        // Janela ponta a ponta: não passa de N bytes sem confirmação.
        if (naoConfirmados() + conteudo.byteLength > janelaDeBytesNaoConfirmados) {
          pausasPorJanelaCheia++;
          await Promise.race([aguardarJanela(), abortador.promessa]);
        }
        // Buffer local: não enfileira mais do que o limiar alto.
        if (canalDeDados.bufferedAmount > limiarAltoDoBuffer) {
          pausasPorBufferCheio++;
          await Promise.race([aguardarEspacoNoBuffer(canalDeDados), abortador.promessa]);
        }

        canalDeDados.send(montarBloco({ idTransferencia, indiceDoArquivo, sequencia, conteudo }));
        sequencia++;
        bytesEnviados += conteudo.byteLength;
        maiorBufferObservado = Math.max(maiorBufferObservado, canalDeDados.bufferedAmount);
        maiorJanelaObservada = Math.max(maiorJanelaObservada, naoConfirmados());
        informarProgresso();
      }
    }
    informarProgresso(true);
    const envioConcluidoEm = performance.now();
    const sha256 = hash.finalizar();
    controle.enviar({ tipo: 'arquivo-concluido', idTransferencia, indiceDoArquivo, sha256 });
    aoRegistrar(`Todos os ${sequencia} blocos entregues ao send(); SHA-256 enviado; aguardando a verificação`);

    // ---------- 4. Verificação final pelo destinatário ----------
    const final = await Promise.race([confirmacaoFinal, abortador.promessa]);
    if (final.tipo === 'erro-transferencia') {
      throw new Error(`O destinatário informou erro: ${final.motivo}`);
    }
    if (final.tipo === 'arquivo-falhou') {
      throw new Error(`Falha de integridade informada pelo destinatário: ${final.motivo}`);
    }
    bytesConfirmados = Math.max(bytesConfirmados, final.bytesRecebidos);
    informarProgresso(true);
    const duracaoMs = performance.now() - inicio;

    return {
      idTransferencia,
      bytesEnviados,
      bytesConfirmados,
      blocos: sequencia,
      maiorBufferObservado,
      maiorJanelaObservada,
      pausasPorBufferCheio,
      pausasPorJanelaCheia,
      confirmacoesRecebidas,
      marcosConfirmadosMs,
      sha256,
      hash: hash.estatisticas(),
      duracaoAteEntregarAoSendMs: envioConcluidoEm - inicio,
      duracaoMs,
      vazaoMiBs: arquivo.size / (1024 * 1024) / (duracaoMs / 1000),
    };
  } finally {
    clearInterval(vigia);
    liberarJanela = null;
  }
}
