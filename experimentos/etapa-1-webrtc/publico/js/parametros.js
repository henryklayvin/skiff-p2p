// Parâmetros da transferência, centralizados num único lugar.
// TODOS são valores iniciais EXPERIMENTAIS (ADR 0008): o experimento existe para calibrá-los.

const KiB = 1024;
const MiB = 1024 * KiB;

export const PARAMETROS_PADRAO = Object.freeze({
  // Tamanho TOTAL de cada mensagem do canal "dados" (cabeçalho + conteúdo). Decisão: 16 KiB.
  tamanhoDoBloco: 16 * KiB,

  // Quanto do arquivo é lido do disco de cada vez (depois dividido em blocos).
  tamanhoDaLeitura: 1 * MiB,

  // Controle de fluxo local: pausa acima do limiar alto; retoma quando o
  // bufferedAmount cai até o limiar baixo (evento "bufferedamountlow").
  limiarAltoDoBuffer: 1 * MiB,
  limiarBaixoDoBuffer: 256 * KiB,

  // Prazo para o destinatário aceitar a oferta.
  prazoDeAceiteMs: 10_000,

  // Confirmações (ACK) do destinatário: a cada 1 MiB gravado ou a cada 250 ms, o que vier primeiro.
  // O remetente envia esses valores na oferta, para os dois lados usarem a mesma configuração.
  intervaloDeConfirmacaoBytes: 1 * MiB,
  intervaloDeConfirmacaoMs: 250,

  // Janela ponta a ponta: máximo de bytes enviados e ainda não confirmados.
  janelaDeBytesNaoConfirmados: 8 * MiB,

  // Sem avanço das confirmações por este prazo, com dados pendentes, a transferência falha.
  prazoSemConfirmacaoMs: 15_000,
});

// Limites aceitos pelo destinatário para os intervalos de confirmação recebidos na oferta.
export const LIMITES_DE_CONFIRMACAO = Object.freeze({
  bytesMinimo: 64 * KiB,
  bytesMaximo: 64 * MiB,
  msMinimo: 10,
  msMaximo: 5_000,
});

export const UNIDADES = Object.freeze({ KiB, MiB });
