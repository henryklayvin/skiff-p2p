// SHA-256 incremental (P6), com a biblioteca candidata hash-wasm (publico/vendor/hash-wasm).
//
// Incremental = o hash é alimentado bloco a bloco, sem carregar o arquivo inteiro na memória.
// A Web Crypto API (crypto.subtle.digest) não oferece isso: exigiria o arquivo completo.
//
// A biblioteca é carregada por <script> (UMD) e expõe o global "hashwasm".

/** Cria uma calculadora de SHA-256 incremental que também mede o tempo gasto. */
export async function criarCalculadoraSha256() {
  const biblioteca = globalThis.hashwasm;
  if (typeof biblioteca?.createSHA256 !== 'function') {
    throw new Error('A biblioteca hash-wasm não foi carregada.');
  }
  const calculadora = await biblioteca.createSHA256();
  calculadora.init();
  let bytes = 0;
  let tempoMs = 0;

  return {
    /** @param {Uint8Array} dados */
    atualizar(dados) {
      const inicio = performance.now();
      calculadora.update(dados);
      tempoMs += performance.now() - inicio;
      bytes += dados.byteLength;
    },

    /** Encerra o cálculo e devolve o hash em hexadecimal minúsculo. */
    finalizar() {
      const inicio = performance.now();
      const hex = calculadora.digest('hex');
      tempoMs += performance.now() - inicio;
      return hex;
    },

    estatisticas() {
      return { bytes, tempoMs, vazaoMiBs: tempoMs > 0 ? bytes / (1024 * 1024) / (tempoMs / 1000) : null };
    },
  };
}

export const FORMATO_SHA256 = /^[0-9a-f]{64}$/;
