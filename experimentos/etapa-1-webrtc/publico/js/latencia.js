// Medição de latência do canal "controle" (P3).
//
// Um lado envia "sonda" com um número de sequência; o outro devolve "resposta-sonda".
// O tempo de ida e volta é medido só no relógio de quem enviou (performance.now()),
// então não depende de os relógios dos dois aparelhos estarem sincronizados.
// Os dois lados respondem a sondas automaticamente.

import { resumirAmostras } from './metricas.js';

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

/** @param {ReturnType<import('./controle.js').criarCanalDeControle>} controle */
export function criarMedidorDeLatencia(controle) {
  const pendentes = new Map(); // sequencia -> { enviadaEm, concluir }
  let proximaSequencia = 1;

  controle.aoReceber('sonda', (mensagem) => {
    if (Number.isInteger(mensagem.sequencia)) {
      controle.enviar({ tipo: 'resposta-sonda', sequencia: mensagem.sequencia });
    }
  });

  controle.aoReceber('resposta-sonda', (mensagem) => {
    const pendente = pendentes.get(mensagem.sequencia);
    if (pendente) {
      pendentes.delete(mensagem.sequencia);
      pendente.concluir(performance.now() - pendente.enviadaEm);
    }
  });

  /** Envia uma sonda e resolve com o tempo de ida e volta (ms), ou null se não houver resposta no prazo. */
  function sondar(limiteMs) {
    const sequencia = proximaSequencia++;
    return new Promise((concluir) => {
      const temporizador = setTimeout(() => {
        pendentes.delete(sequencia);
        concluir(null);
      }, limiteMs);
      pendentes.set(sequencia, {
        enviadaEm: performance.now(),
        concluir: (tempo) => {
          clearTimeout(temporizador);
          concluir(tempo);
        },
      });
      if (!controle.enviar({ tipo: 'sonda', sequencia })) {
        clearTimeout(temporizador);
        pendentes.delete(sequencia);
        concluir(null);
      }
    });
  }

  return {
    /**
     * Envia `quantidade` sondas, uma de cada vez, com `intervaloMs` entre elas.
     * @returns {Promise<{resumo: ReturnType<typeof resumirAmostras>, perdidas: number, amostras: number[]}>}
     */
    async medir({ quantidade = 20, intervaloMs = 100, limiteMs = 5_000 } = {}) {
      const amostras = [];
      let perdidas = 0;
      for (let indice = 0; indice < quantidade; indice++) {
        const tempo = await sondar(limiteMs);
        if (tempo === null) {
          perdidas++;
        } else {
          amostras.push(tempo);
        }
        if (indice < quantidade - 1) {
          await esperar(intervaloMs);
        }
      }
      return { resumo: resumirAmostras(amostras), perdidas, amostras };
    },
  };
}
