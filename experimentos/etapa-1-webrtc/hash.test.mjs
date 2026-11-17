// Testes do SHA-256 incremental (publico/js/hash.js) com a hash-wasm do diretório vendor.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let criarCalculadoraSha256;

before(async () => {
  // A biblioteca UMD expõe "hashwasm"; no navegador ela é carregada por <script>.
  globalThis.hashwasm = require('./publico/vendor/hash-wasm/sha256.umd.min.js');
  ({ criarCalculadoraSha256 } = await import('./publico/js/hash.js'));
});

async function sha256De(...partes) {
  const calculadora = await criarCalculadoraSha256();
  for (const parte of partes) {
    calculadora.atualizar(typeof parte === 'string' ? new TextEncoder().encode(parte) : parte);
  }
  return calculadora.finalizar();
}

describe('SHA-256 incremental', () => {
  // Vetores de teste do FIPS 180-2 / NIST.
  test('deveCalcularOVetorVazio', async () => {
    assert.equal(await sha256De(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('deveCalcularOVetorAbc', async () => {
    assert.equal(await sha256De('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('deveCalcularOVetorDe448Bits', async () => {
    assert.equal(
      await sha256De('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  test('deveDarOMesmoResultadoEmPartesOuDeUmaVez', async () => {
    const dados = new Uint8Array(100_000).map((_, indice) => indice % 251);
    const deUmaVez = await sha256De(dados);
    const emPartes = await sha256De(dados.subarray(0, 1), dados.subarray(1, 16_368), dados.subarray(16_368));
    assert.equal(emPartes, deUmaVez);
  });

  test('deveRegistrarBytesETempo', async () => {
    const calculadora = await criarCalculadoraSha256();
    calculadora.atualizar(new Uint8Array(1024));
    calculadora.finalizar();
    const { bytes, tempoMs } = calculadora.estatisticas();
    assert.equal(bytes, 1024);
    assert.ok(tempoMs >= 0);
  });

  const arquivo10 = join(homedir(), 'skiff-experimento', 'arquivos-de-teste', 'teste-10mib.bin');
  test('deveConferirOArquivoDe10MiBEmBlocosDe16KiB', { skip: !existsSync(arquivo10) && 'arquivo de teste não encontrado' }, async () => {
    const referencia = readFileSync(join(homedir(), 'skiff-experimento', 'arquivos-de-teste', 'sha256.txt'), 'utf8')
      .split('\n').find((linha) => linha.includes('teste-10mib.bin')).split(/\s+/)[0];
    const calculadora = await criarCalculadoraSha256();
    for await (const parte of createReadStream(arquivo10, { highWaterMark: 16_368 })) {
      calculadora.atualizar(parte);
    }
    assert.equal(calculadora.finalizar(), referencia);
  });
});
