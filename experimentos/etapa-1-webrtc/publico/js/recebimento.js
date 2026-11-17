// Recebimento de arquivos (P4).
//
// No experimento o aceite é AUTOMÁTICO: o consentimento por arquivo é um requisito do
// produto (ADR 0008), mas não é objeto deste experimento técnico.

import { criarDestinoEmBlob } from './destinos.js';
import { lerBloco } from './protocolo-de-dados.js';
import { sanitizarNomeDeArquivo } from './nomes.js';

const TAMANHO_MAXIMO_DO_NOME_RECEBIDO = 1024;

function validarOferta(mensagem) {
  const arquivo = mensagem.arquivos?.[0];
  const valida = Number.isInteger(mensagem.idTransferencia)
    && Array.isArray(mensagem.arquivos) && mensagem.arquivos.length === 1
    && arquivo && arquivo.indice === 0
    && typeof arquivo.nome === 'string' && arquivo.nome.length <= TAMANHO_MAXIMO_DO_NOME_RECEBIDO
    && Number.isSafeInteger(arquivo.tamanho) && arquivo.tamanho >= 0;
  return valida ? arquivo : null;
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

  const informarProgresso = (forcar = false) => {
    const agora = performance.now();
    if (atual && (forcar || agora - ultimoProgresso >= 100)) {
      ultimoProgresso = agora;
      aoProgredir({ bytesRecebidos: atual.bytesRecebidos, total: atual.arquivo.tamanho, decorridoMs: agora - atual.inicio });
    }
  };

  async function falhar(motivo) {
    const transferencia = atual;
    atual = null;
    if (!transferencia) {
      return;
    }
    await transferencia.destino.descartar();
    controle.enviar({ tipo: 'erro-transferencia', idTransferencia: transferencia.idTransferencia, motivo });
    aoFalhar(new Error(motivo));
  }

  async function concluir() {
    const transferencia = atual;
    atual = null;
    const blob = await transferencia.destino.finalizar();
    const duracaoMs = performance.now() - transferencia.inicio;
    controle.enviar({
      tipo: 'arquivo-recebido',
      idTransferencia: transferencia.idTransferencia,
      bytesRecebidos: transferencia.bytesRecebidos,
      duracaoMs,
    });
    aoConcluir({
      blob,
      nomeOriginal: transferencia.arquivo.nome,
      nomeSeguro: sanitizarNomeDeArquivo(transferencia.arquivo.nome),
      bytesRecebidos: transferencia.bytesRecebidos,
      blocos: transferencia.sequenciaEsperada,
      duracaoMs,
      vazaoMiBs: transferencia.bytesRecebidos / (1024 * 1024) / (duracaoMs / 1000),
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
    atual = {
      idTransferencia: mensagem.idTransferencia,
      arquivo,
      destino: criarDestino(),
      sequenciaEsperada: 0,
      bytesRecebidos: 0,
      inicio: performance.now(),
    };
    aoRegistrar(`Oferta recebida: ${arquivo.tamanho} bytes; aceita automaticamente (protótipo)`);
    controle.enviar({ tipo: 'aceitar-transferencia', idTransferencia: mensagem.idTransferencia, indicesAceitos: [0] });
    if (arquivo.tamanho === 0) {
      await concluir();
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
    if (!atual || bloco.idTransferencia !== atual.idTransferencia) {
      blocosDescartados++; // ex.: blocos que chegam depois de um cancelamento (P7)
      return;
    }
    if (bloco.sequencia !== atual.sequenciaEsperada) {
      await falhar(`bloco fora de ordem: esperado ${atual.sequenciaEsperada}, recebido ${bloco.sequencia}`);
      return;
    }
    const restante = atual.arquivo.tamanho - atual.bytesRecebidos;
    if (bloco.conteudo.byteLength > restante) {
      await falhar('mais bytes recebidos do que o tamanho anunciado');
      return;
    }

    atual.sequenciaEsperada++;
    atual.bytesRecebidos += bloco.conteudo.byteLength;
    // A gravação no destino é registrada antes de qualquer await, para preservar a ordem dos blocos.
    const gravacao = atual.destino.adicionar(bloco.conteudo);
    const completo = atual.bytesRecebidos === atual.arquivo.tamanho;
    informarProgresso(completo);
    await gravacao;
    if (completo && atual) {
      await concluir();
    }
  });

  return {
    get blocosDescartados() {
      return blocosDescartados;
    },
  };
}
