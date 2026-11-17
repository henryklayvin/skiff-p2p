// Envio de um arquivo (P4): leitura em partes, divisão em blocos e controle de fluxo local.
//
// Fluxo no canal "controle":
//   remetente -> oferta-transferencia    (nome, tamanho, tipo)
//   destinatário -> aceitar-transferencia (ou recusar-transferencia)
//   remetente -> blocos no canal "dados"
//   destinatário -> arquivo-recebido      (quando recebeu todos os bytes)
//
// Os blocos só começam depois do aceite. Como "controle" e "dados" são canais
// diferentes, não há garantia de ordem entre eles: sem esse aceite, um bloco
// poderia chegar antes da oferta.

import { PARAMETROS_PADRAO } from './parametros.js';
import { conteudoPorBloco, gerarIdDeTransferencia, montarBloco } from './protocolo-de-dados.js';

/** Espera o bufferedAmount cair até o limiar baixo, se estiver acima do limiar alto. */
function aguardarEspacoNoBuffer(canal, limiarAlto) {
  if (canal.bufferedAmount <= limiarAlto) {
    return Promise.resolve();
  }
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
    const temporizador = limiteMs ? setTimeout(() => falhar(new Error(`Sem resposta do destinatário (${tipos.join(' / ')}).`)), limiteMs) : null;
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
  aoProgredir = () => {},
  aoRegistrar = () => {},
}) {
  const { tamanhoDoBloco, tamanhoDaLeitura, limiarAltoDoBuffer, limiarBaixoDoBuffer, prazoDeAceiteMs } = parametros;
  if (limiarBaixoDoBuffer >= limiarAltoDoBuffer) {
    throw new Error('O limiar baixo do buffer deve ser menor que o limiar alto.');
  }
  if (canalDeDados.readyState !== 'open') {
    throw new Error('O canal "dados" não está aberto.');
  }

  const idTransferencia = gerarIdDeTransferencia();
  const indiceDoArquivo = 0;
  const bytesPorBloco = conteudoPorBloco(tamanhoDoBloco);
  canalDeDados.bufferedAmountLowThreshold = limiarBaixoDoBuffer;

  // 1. Oferta e aceite.
  const resposta = aguardarMensagem(controle, ['aceitar-transferencia', 'recusar-transferencia'], idTransferencia, prazoDeAceiteMs);
  controle.enviar({
    tipo: 'oferta-transferencia',
    idTransferencia,
    arquivos: [{ indice: indiceDoArquivo, nome: arquivo.name, tamanho: arquivo.size, tipoMime: arquivo.type || 'application/octet-stream' }],
    tamanhoDoBloco,
  });
  aoRegistrar(`Oferta enviada: ${arquivo.size} bytes`);
  if ((await resposta).tipo === 'recusar-transferencia') {
    throw new Error('O destinatário recusou a transferência.');
  }

  // A confirmação final é registrada antes de enviar o último bloco, para não perdê-la.
  const confirmacaoFinal = aguardarMensagem(controle, ['arquivo-recebido', 'erro-transferencia'], idTransferencia, 0);

  // 2. Leitura em partes e envio em blocos.
  const inicio = performance.now();
  let bytesEnviados = 0;
  let sequencia = 0;
  let maiorBufferObservado = 0;
  let pausasPorBufferCheio = 0;
  let ultimoProgresso = 0;

  const informarProgresso = (forcar = false) => {
    const agora = performance.now();
    if (forcar || agora - ultimoProgresso >= 100) {
      ultimoProgresso = agora;
      aoProgredir({ bytesEnviados, total: arquivo.size, bufferAtual: canalDeDados.bufferedAmount, maiorBufferObservado, decorridoMs: agora - inicio });
    }
  };

  for (let posicao = 0; posicao < arquivo.size; posicao += tamanhoDaLeitura) {
    const parte = new Uint8Array(await arquivo.slice(posicao, posicao + tamanhoDaLeitura).arrayBuffer());
    for (let deslocamento = 0; deslocamento < parte.byteLength; deslocamento += bytesPorBloco) {
      if (canalDeDados.bufferedAmount > limiarAltoDoBuffer) {
        pausasPorBufferCheio++;
        await aguardarEspacoNoBuffer(canalDeDados, limiarAltoDoBuffer);
      }
      const conteudo = parte.subarray(deslocamento, deslocamento + bytesPorBloco);
      canalDeDados.send(montarBloco({ idTransferencia, indiceDoArquivo, sequencia, conteudo }));
      sequencia++;
      bytesEnviados += conteudo.byteLength;
      maiorBufferObservado = Math.max(maiorBufferObservado, canalDeDados.bufferedAmount);
      informarProgresso();
    }
  }
  informarProgresso(true);
  const envioConcluidoEm = performance.now();
  aoRegistrar(`Todos os ${sequencia} blocos entregues ao send(); aguardando o destinatário`);

  // 3. Confirmação do destinatário.
  const final = await confirmacaoFinal;
  if (final.tipo === 'erro-transferencia') {
    throw new Error(`O destinatário informou erro: ${final.motivo}`);
  }
  const duracaoMs = performance.now() - inicio;

  return {
    idTransferencia,
    bytesEnviados,
    blocos: sequencia,
    maiorBufferObservado,
    pausasPorBufferCheio,
    duracaoAteEntregarAoSendMs: envioConcluidoEm - inicio,
    duracaoMs,
    vazaoMiBs: arquivo.size / (1024 * 1024) / (duracaoMs / 1000),
    bytesRecebidosInformados: final.bytesRecebidos,
  };
}
