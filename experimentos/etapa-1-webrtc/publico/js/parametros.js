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
});

export const UNIDADES = Object.freeze({ KiB, MiB });
