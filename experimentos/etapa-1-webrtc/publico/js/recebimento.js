// Recebimento de arquivos.
//
// P4: validação da oferta e dos blocos (ordem e tamanho) e gravação no destino.
// P5: confirmações (ACK) dos bytes efetivamente gravados.
//
// No experimento o aceite é AUTOMÁTICO: o consentimento por arquivo é um requisito do
// produto (ADR 0008), mas não é objeto deste experimento técnico.
//
// Contadores:
//   bytesRecebidos   chegaram pelo canal "dados", em ordem
//   bytesConfirmados recebidos em ordem E gravados no destino (os que são confirmados ao remetente)

import { criarDestinoEmBlob } from './destinos.js';
import { LIMITES_DE_CONFIRMACAO, PARAMETROS_PADRAO } from './parametros.js';
import { lerBloco } from './protocolo-de-dados.js';
import { sanitizarNomeDeArquivo } from './nomes.js';

const TAMANHO_MAXIMO_DO_NOME_RECEBIDO = 1024;

const dentroDe = (valor, minimo, maximo) => Number.isSafeInteger(valor) && valor >= minimo && valor <= maximo;

function validarOferta(mensagem) {
  const arquivo = mensagem.arquivos?.[0];
  const valida = Number.isInteger(mensagem.idTransferencia)
    && Array.isArray(mensagem.arquivos) && mensagem.arquivos.length === 1
    && arquivo && arquivo.indice === 0
    && typeof arquivo.nome === 'string' && arquivo.nome.length <= TAMANHO_MAXIMO_DO_NOME_RECEBIDO
    && Number.isSafeInteger(arquivo.tamanho) && arquivo.tamanho >= 0;
  return valida ? arquivo : null;
}

/** Usa os intervalos de confirmação pedidos na oferta, se estiverem dentro dos limites; senão, os padrões. */
function lerIntervalosDeConfirmacao(mensagem) {
  const pedido = mensagem.confirmacao ?? {};
  const { bytesMinimo, bytesMaximo, msMinimo, msMaximo } = LIMITES_DE_CONFIRMACAO;
  return {
    intervaloBytes: dentroDe(pedido.intervaloBytes, bytesMinimo, bytesMaximo)
      ? pedido.intervaloBytes : PARAMETROS_PADRAO.intervaloDeConfirmacaoBytes,
    intervaloMs: dentroDe(pedido.intervaloMs, msMinimo, msMaximo)
      ? pedido.intervaloMs : PARAMETROS_PADRAO.intervaloDeConfirmacaoMs,
  };
}

/**
 * Prepara o recebimento no canal "dados".
 * @param {{canalDeDados: RTCDataChannel, controle: object, criarDestino?: () => object,
 *          aoProgredir?: (progresso: object) => void, aoConcluir?: (resultado: object) => void,
 *          aoFalhar?: (erro: Error) => void, aoRegistrar?: (texto: string) => void}} opcoes
 */
export function criarRecebedor({
  canalDeDados,
  controle,
  criarDestino = criarDestinoEmBlob,
  aoProgredir = () => {},
  aoConcluir = () => {},
  aoFalhar = () => {},
  aoRegistrar = () => {},
}) {
  let atual = null; // transferência em andamento
  let blocosDescartados = 0;
  let ultimoProgresso = 0;

  const informarProgresso = (transferencia, forcar = false) => {
    const agora = performance.now();
    if (forcar || agora - ultimoProgresso >= 100) {
      ultimoProgresso = agora;
      aoProgredir({
        bytesRecebidos: transferencia.bytesRecebidos,
        bytesConfirmados: transferencia.bytesConfirmados,
        total: transferencia.arquivo.tamanho,
        decorridoMs: agora - transferencia.inicio,
      });
    }
  };

  /** Envia "confirmacao" se houver bytes novos e o intervalo (em bytes ou em tempo) tiver sido atingido. */
  function confirmarSeNecessario(transferencia, forcar = false) {
    const novos = transferencia.bytesConfirmados - transferencia.ultimoValorConfirmado;
    if (novos <= 0) {
      return;
    }
    const tempoDesdeAUltima = performance.now() - transferencia.ultimaConfirmacaoEm;
    if (forcar || novos >= transferencia.confirmacao.intervaloBytes || tempoDesdeAUltima >= transferencia.confirmacao.intervaloMs) {
      controle.enviar({
        tipo: 'confirmacao',
        idTransferencia: transferencia.idTransferencia,
        indiceDoArquivo: 0,
        bytesConfirmados: transferencia.bytesConfirmados,
      });
      transferencia.ultimoValorConfirmado = transferencia.bytesConfirmados;
      transferencia.ultimaConfirmacaoEm = performance.now();
      transferencia.confirmacoesEnviadas++;
    }
  }

  function encerrar(transferencia) {
    clearInterval(transferencia.temporizadorDeConfirmacao);
    if (atual === transferencia) {
      atual = null;
    }
  }

  async function falhar(transferencia, motivo) {
    if (atual !== transferencia) {
      return; // já encerrada
    }
    encerrar(transferencia);
    await transferencia.destino.descartar();
    controle.enviar({ tipo: 'erro-transferencia', idTransferencia: transferencia.idTransferencia, motivo });
    aoFalhar(new Error(motivo));
  }

  async function concluir(transferencia) {
    encerrar(transferencia);
    confirmarSeNecessario(transferencia, true);
    const blob = await transferencia.destino.finalizar();
    const duracaoMs = performance.now() - transferencia.inicio;
    controle.enviar({
      tipo: 'arquivo-recebido',
      idTransferencia: transferencia.idTransferencia,
      bytesRecebidos: transferencia.bytesConfirmados,
      duracaoMs,
    });
    aoConcluir({
      blob,
      nomeOriginal: transferencia.arquivo.nome,
      nomeSeguro: sanitizarNomeDeArquivo(transferencia.arquivo.nome),
      bytesRecebidos: transferencia.bytesConfirmados,
      blocos: transferencia.sequenciaEsperada,
      confirmacoesEnviadas: transferencia.confirmacoesEnviadas,
      duracaoMs,
      vazaoMiBs: transferencia.bytesConfirmados / (1024 * 1024) / (duracaoMs / 1000),
      destino: transferencia.destino.nome,
    });
  }

  controle.aoReceber('oferta-transferencia', async (mensagem) => {
    const arquivo = validarOferta(mensagem);
    if (!arquivo) {
      controle.enviar({ tipo: 'recusar-transferencia', idTransferencia: mensagem.idTransferencia, motivo: 'oferta inválida' });
      aoRegistrar('Oferta inválida recusada');
      return;
    }
    if (atual) {
      controle.enviar({ tipo: 'recusar-transferencia', idTransferencia: mensagem.idTransferencia, motivo: 'transferência em andamento' });
      aoRegistrar('Oferta recusada: já existe uma transferência em andamento');
      return;
    }
    const transferencia = {
      idTransferencia: mensagem.idTransferencia,
      arquivo,
      destino: criarDestino(),
      confirmacao: lerIntervalosDeConfirmacao(mensagem),
      sequenciaEsperada: 0,
      bytesRecebidos: 0,
      bytesConfirmados: 0,
      ultimoValorConfirmado: 0,
      ultimaConfirmacaoEm: performance.now(),
      confirmacoesEnviadas: 0,
      inicio: performance.now(),
      temporizadorDeConfirmacao: null,
    };
    // Confirmação por tempo: garante o envio mesmo quando param de chegar blocos
    // (ex.: remetente esperando a janela abrir).
    transferencia.temporizadorDeConfirmacao = setInterval(
      () => confirmarSeNecessario(transferencia),
      transferencia.confirmacao.intervaloMs,
    );
    atual = transferencia;
    aoRegistrar(`Oferta recebida: ${arquivo.tamanho} bytes; aceita automaticamente (protótipo); confirmações a cada ${transferencia.confirmacao.intervaloBytes} bytes ou ${transferencia.confirmacao.intervaloMs} ms`);
    controle.enviar({ tipo: 'aceitar-transferencia', idTransferencia: mensagem.idTransferencia, indicesAceitos: [0] });
    if (arquivo.tamanho === 0) {
      await concluir(transferencia);
    }
  });

  canalDeDados.addEventListener('message', async (evento) => {
    let bloco;
    try {
      bloco = lerBloco(evento.data);
    } catch (erro) {
      blocosDescartados++;
      aoRegistrar(erro.message);
      return;
    }
    const transferencia = atual;
    if (!transferencia || bloco.idTransferencia !== transferencia.idTransferencia) {
      blocosDescartados++; // ex.: blocos que chegam depois de um cancelamento (P7)
      return;
    }
    if (bloco.sequencia !== transferencia.sequenciaEsperada) {
      await falhar(transferencia, `bloco fora de ordem: esperado ${transferencia.sequenciaEsperada}, recebido ${bloco.sequencia}`);
      return;
    }
    const tamanho = bloco.conteudo.byteLength;
    if (tamanho > transferencia.arquivo.tamanho - transferencia.bytesRecebidos) {
      await falhar(transferencia, 'mais bytes recebidos do que o tamanho anunciado');
      return;
    }

    // Atualizações síncronas antes do primeiro await: preservam a ordem dos blocos,
    // pois o navegador dispara o próximo evento "message" sem esperar este terminar.
    transferencia.sequenciaEsperada++;
    transferencia.bytesRecebidos += tamanho;
    const gravacao = transferencia.destino.adicionar(bloco.conteudo); // o destino grava em ordem

    try {
      await gravacao;
    } catch (erro) {
      await falhar(transferencia, `falha ao gravar: ${erro.message}`);
      return;
    }
    if (atual !== transferencia) {
      return; // transferência encerrada enquanto gravava
    }
    transferencia.bytesConfirmados += tamanho;
    const completo = transferencia.bytesConfirmados === transferencia.arquivo.tamanho;
    informarProgresso(transferencia, completo);
    if (completo) {
      await concluir(transferencia);
    } else {
      confirmarSeNecessario(transferencia);
    }
  });

  return {
    get blocosDescartados() {
      return blocosDescartados;
    },
  };
}
