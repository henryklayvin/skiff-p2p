// Testes das funções puras de métricas (publico/js/metricas.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatarMs, percentil, resumirAmostras } from './publico/js/metricas.js';

describe('percentil', () => {
  const valores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  test('deveCalcularMedianaPeloPostoMaisProximo', () => {
    assert.equal(percentil(valores, 50), 5);
  });

  test('deveCalcularP95PeloPostoMaisProximo', () => {
    assert.equal(percentil(valores, 95), 10);
  });

  test('deveRetornarOMenorValorNoPercentilZero', () => {
    assert.equal(percentil(valores, 0), 1);
  });

  test('deveRetornarNullSemValores', () => {
    assert.equal(percentil([], 50), null);
  });
});

describe('resumirAmostras', () => {
  test('deveResumirAmostrasForaDeOrdem', () => {
    assert.deepEqual(resumirAmostras([30, 10, 20, 40]), {
      quantidade: 4,
      minimo: 10,
      mediana: 20,
      p95: 40,
      maximo: 40,
      media: 25,
    });
  });

  test('naoDeveAlterarAListaOriginal', () => {
    const amostras = [3, 1, 2];
    resumirAmostras(amostras);
    assert.deepEqual(amostras, [3, 1, 2]);
  });

  test('deveRetornarValoresNulosSemAmostras', () => {
    assert.deepEqual(resumirAmostras([]), {
      quantidade: 0, minimo: null, mediana: null, p95: null, maximo: null, media: null,
    });
  });
});

describe('formatarMs', () => {
  test('deveFormatarComUmaCasaDecimal', () => {
    assert.equal(formatarMs(8), '8.0 ms');
  });

  test('deveExibirTracoParaValorAusente', () => {
    assert.equal(formatarMs(null), '—');
    assert.equal(formatarMs(Number.NaN), '—');
  });
});
