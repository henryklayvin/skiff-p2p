// Medição de memória da própria aba (P4/P8), com performance.measureUserAgentSpecificMemory().
//
// - Só existe em navegadores Chromium e exige crossOriginIsolated (COOP + COEP, enviados pelo servidor).
// - Inclui o heap JavaScript e os ArrayBuffers da página (verificado: reter 100 MiB aparece como +100 MiB).
// - NÃO inclui o conteúdo de Blobs já criados: ele fica no processo principal do navegador.
// - Cada medição espera a próxima coleta de lixo e pode levar de menos de 1 s a cerca de 20 s.
//   Por isso a amostragem roda em ciclo contínuo enquanto a transferência acontece.

export function medicaoDeMemoriaDisponivel() {
  // "?sem-memoria" na URL desliga a medição (usado para avaliar o custo da própria medição).
  const desligadaPelaUrl = typeof location !== 'undefined' && new URLSearchParams(location.search).has('sem-memoria');
  return !desligadaPelaUrl
    && globalThis.crossOriginIsolated === true
    && typeof performance.measureUserAgentSpecificMemory === 'function';
}

async function medirBytes() {
  const resultado = await performance.measureUserAgentSpecificMemory();
  return resultado.bytes;
}

/**
 * Amostra a memória da aba continuamente entre iniciar() e parar().
 * @param {() => number} lerProgresso fração de 0 a 1 do andamento da transferência (para rotular as amostras)
 */
export function criarAmostradorDeMemoria(lerProgresso = () => 0) {
  const amostras = [];
  let ativo = false;
  let ciclo = null;

  async function amostrar() {
    const progressoNoPedido = lerProgresso();
    const bytes = await medirBytes();
    amostras.push({ bytes, progressoNoPedido, progressoNaResposta: lerProgresso() });
  }

  return {
    disponivel: medicaoDeMemoriaDisponivel(),

    iniciar() {
      if (!this.disponivel || ativo) {
        return;
      }
      ativo = true;
      ciclo = (async () => {
        while (ativo) {
          await amostrar().catch(() => { ativo = false; });
        }
      })();
    },

    /** Interrompe o ciclo, faz uma medição final e devolve o resumo. */
    async parar() {
      if (!this.disponivel) {
        return null;
      }
      ativo = false;
      await ciclo;
      await amostrar().catch(() => {});
      return resumirMemoria(amostras);
    },
  };
}

export function resumirMemoria(amostras) {
  if (amostras.length === 0) {
    return null;
  }
  const valores = amostras.map((amostra) => amostra.bytes);
  return {
    amostras: amostras.length,
    inicialBytes: valores[0],
    maximaBytes: Math.max(...valores),
    finalBytes: valores[valores.length - 1],
  };
}
