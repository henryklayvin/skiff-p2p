// Recebimento de arquivos.
//
// P4: validação da oferta e dos blocos (ordem e tamanho) e gravação no destino.
// P5: confirmações (ACK) dos bytes efetivamente gravados.
// P6: SHA-256 incremental dos bytes recebidos, comparado com o hash enviado pelo remetente.
//     O arquivo só é oferecido para download depois de verificado.
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
import { FORMATO_SHA256, criarCalculadoraSha256 } from './hash.js';

const TAMANHO_MAXIMO_DO_NOME_RECEBIDO = 1024;
// Prazo para o hash do remetente chegar depois que todos os bytes foram gravados.
const PRAZO_DO_HASH_ESPERADO_MS = 15_000;

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
    clearTimeout(transferencia.temporizadorDoHash);
    if (atual === transferencia) {
      atual = null;
    }
  }

  /** Falha de protocolo (ordem, tamanho, gravação): descarta os dados e avisa o remetente. */
  async function falhar(transferencia, motivo, tipoDaMensagem = 'erro-transferencia') {
    if (atual !== transferencia) {
      return; // já encerrada
    }
    encerrar(transferencia);
    await transferencia.destino.descartar();
    controle.enviar({ tipo: tipoDaMensagem, idTransferencia: transferencia.idTransferencia, motivo });
    aoFalhar(new Error(motivo));
  }

  /** Espera o hash do remetente ("arquivo-concluido"), que pode chegar antes ou depois do último bloco. */
  function aguardarHashEsperado(transferencia) {
    if (transferencia.sha256Esperado) {
      return Promise.resolve(transferencia.sha256Esperado);
    }
    return new Promise((receber) => {
      transferencia.aoReceberHashEsperado = receber;
      transferencia.temporizadorDoHash = setTimeout(() => receber(null), PRAZO_DO_HASH_ESPERADO_MS);
    });
  }

  async function concluir(transferencia) {
    clearInterval(transferencia.temporizadorDeConfirmacao);
    confirmarSeNecessario(transferencia, true);

    const sha256Calculado = transferencia.hash.finalizar();
    const sha256Esperado = await aguardarHashEsperado(transferencia);
    if (atual !== transferencia) {
      return; // encerrada enquanto aguardava
    }
    if (!sha256Esperado) {
      await falhar(transferencia, 'o hash do remetente não chegou a tempo', 'arquivo-falhou');
      return;
    }
    if (sha256Esperado !== sha256Calculado) {
      await falhar(transferencia, `SHA-256 divergente: esperado ${sha256Esperado.slice(0, 12)}…, calculado ${sha256Calculado.slice(0, 12)}…`, 'arquivo-falhou');
      return;
    }

    encerrar(transferencia);
    const blob = await transferencia.destino.finalizar();
    const duracaoMs = performance.now() - transferencia.inicio;
    controle.enviar({
      tipo: 'arquivo-verificado',
      idTransferencia: transferencia.idTransferencia,
      bytesRecebidos: transferencia.bytesConfirmados,
      sha256: sha256Calculado,
      duracaoMs,
    });
    aoConcluir({
      blob,
      nomeOriginal: transferencia.arquivo.nome,
      nomeSeguro: sanitizarNomeDeArquivo(transferencia.arquivo.nome),
      bytesRecebidos: transferencia.bytesConfirmados,
      blocos: transferencia.sequenciaEsperada,
      confirmacoesEnviadas: transferencia.confirmacoesEnviadas,
      sha256: sha256Calculado,
      hash: transferencia.hash.estatisticas(),
      duracaoMs,
      vazaoMiBs: transferencia.bytesConfirmados / (1024 * 1024) / (duracaoMs / 1000),
      destino: transferencia.destino.nome,
    });
  }

  controle.aoReceber('arquivo-concluido', (mensagem) => {
    const transferencia = atual;
    if (!transferencia || mensagem.idTransferencia !== transferencia.idTransferencia) {
      return;
    }
    if (typeof mensagem.sha256 !== 'string' || !FORMATO_SHA256.test(mensagem.sha256)) {
      falhar(transferencia, 'hash do remetente em formato inválido', 'arquivo-falhou');
      return;
    }
    transferencia.sha256Esperado = mensagem.sha256;
    transferencia.aoReceberHashEsperado?.(mensagem.sha256);
  });

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
    let hash;
    try {
      hash = await criarCalculadoraSha256();
    } catch (erro) {
      controle.enviar({ tipo: 'recusar-transferencia', idTransferencia: mensagem.idTransferencia, motivo: 'hash indisponível' });
      aoRegistrar(`Oferta recusada: ${erro.message}`);
      return;
    }
    if (atual) {
      controle.enviar({ tipo: 'recusar-transferencia', idTransferencia: mensagem.idTransferencia, motivo: 'transferência em andamento' });
      return;
    }
    const transferencia = {
      idTransferencia: mensagem.idTransferencia,
      arquivo,
      hash,
      sha256Esperado: null,
      aoReceberHashEsperado: null,
      temporizadorDoHash: null,
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
    transferencia.hash.atualizar(bloco.conteudo); // hash incremental, na ordem dos blocos
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
