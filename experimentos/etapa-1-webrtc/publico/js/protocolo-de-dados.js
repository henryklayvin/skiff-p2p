// Formato binário das mensagens do canal "dados" (versão 1).
//
// Cada mensagem tem um cabeçalho fixo de 16 bytes seguido do conteúdo do bloco:
//
//   byte 0       versão do formato (1)
//   bytes 1-3    reservados (zero)
//   bytes 4-7    idTransferencia   (uint32, big-endian)
//   bytes 8-11   indiceDoArquivo   (uint32, big-endian)
//   bytes 12-15  sequencia         (uint32, big-endian; 0, 1, 2...)
//   bytes 16-... conteúdo
//
// Funções puras: também são testadas no Node.

export const VERSAO_DO_FORMATO = 1;
export const TAMANHO_DO_CABECALHO = 16;

/** Quantos bytes de conteúdo cabem numa mensagem do tamanho informado. */
export function conteudoPorBloco(tamanhoDoBloco) {
  const conteudo = tamanhoDoBloco - TAMANHO_DO_CABECALHO;
  if (!Number.isInteger(conteudo) || conteudo <= 0) {
    throw new Error(`Tamanho de bloco inválido: ${tamanhoDoBloco}`);
  }
  return conteudo;
}

/**
 * Monta uma mensagem do canal "dados".
 * @param {{idTransferencia: number, indiceDoArquivo: number, sequencia: number, conteudo: Uint8Array}} bloco
 * @returns {ArrayBuffer}
 */
export function montarBloco({ idTransferencia, indiceDoArquivo, sequencia, conteudo }) {
  const mensagem = new ArrayBuffer(TAMANHO_DO_CABECALHO + conteudo.byteLength);
  const visao = new DataView(mensagem);
  visao.setUint8(0, VERSAO_DO_FORMATO);
  visao.setUint32(4, idTransferencia);
  visao.setUint32(8, indiceDoArquivo);
  visao.setUint32(12, sequencia);
  new Uint8Array(mensagem, TAMANHO_DO_CABECALHO).set(conteudo);
  return mensagem;
}

/**
 * Lê uma mensagem do canal "dados". Lança erro se ela for inválida.
 * @param {ArrayBuffer} mensagem
 */
export function lerBloco(mensagem) {
  if (!(mensagem instanceof ArrayBuffer) || mensagem.byteLength < TAMANHO_DO_CABECALHO) {
    throw new Error('Bloco inválido: menor que o cabeçalho ou não binário.');
  }
  const visao = new DataView(mensagem);
  const versao = visao.getUint8(0);
  if (versao !== VERSAO_DO_FORMATO) {
    throw new Error(`Bloco inválido: versão ${versao} não suportada.`);
  }
  return {
    versao,
    idTransferencia: visao.getUint32(4),
    indiceDoArquivo: visao.getUint32(8),
    sequencia: visao.getUint32(12),
    conteudo: new Uint8Array(mensagem, TAMANHO_DO_CABECALHO),
  };
}

/** Gera um identificador de transferência aleatório de 32 bits (não é segredo; só evita confusão). */
export function gerarIdDeTransferencia() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
