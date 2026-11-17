// Funções puras de métricas. Sem dependência do navegador: também são testadas no Node.

/** Percentil pelo método do "posto mais próximo" (nearest-rank), sobre valores já ordenados. */
export function percentil(valoresOrdenados, p) {
  if (valoresOrdenados.length === 0) {
    return null;
  }
  const posicao = Math.ceil((p / 100) * valoresOrdenados.length);
  return valoresOrdenados[Math.min(Math.max(posicao, 1), valoresOrdenados.length) - 1];
}

/**
 * Resume uma lista de amostras (ex.: tempos de ida e volta em ms).
 * @returns {{quantidade: number, minimo: number|null, mediana: number|null, p95: number|null, maximo: number|null, media: number|null}}
 */
export function resumirAmostras(amostras) {
  const ordenadas = [...amostras].sort((a, b) => a - b);
  const quantidade = ordenadas.length;
  if (quantidade === 0) {
    return { quantidade, minimo: null, mediana: null, p95: null, maximo: null, media: null };
  }
  const soma = ordenadas.reduce((total, valor) => total + valor, 0);
  return {
    quantidade,
    minimo: ordenadas[0],
    mediana: percentil(ordenadas, 50),
    p95: percentil(ordenadas, 95),
    maximo: ordenadas[quantidade - 1],
    media: soma / quantidade,
  };
}

/** Formata um valor em milissegundos com uma casa decimal, ou "—" se ausente. */
export function formatarMs(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? `${valor.toFixed(1)} ms` : '—';
}
