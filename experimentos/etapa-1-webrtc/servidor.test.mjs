// Testes do servidor HTTPS do experimento, com o executor nativo do Node.js.
// Execução: node --test experimentos/etapa-1-webrtc/
//
// Os testes de integração usam os certificados gerados no passo P0
// (~/skiff-experimento/certificados) e são ignorados se eles não existirem.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { criarServidor, resolverCaminho, RAIZ_PUBLICA } from './servidor.mjs';

describe('resolverCaminho', () => {
  test('deveServirIndexNaRaiz', () => {
    assert.equal(resolverCaminho('/'), join(RAIZ_PUBLICA, 'index.html'));
  });

  test('deveResolverArquivoDentroDaRaiz', () => {
    assert.equal(resolverCaminho('/js/diagnostico.js'), join(RAIZ_PUBLICA, 'js', 'diagnostico.js'));
  });

  const caminhosInvalidos = {
    'subida de diretório': '/../servidor.mjs',
    'subida codificada com barra codificada': '/..%2fservidor.mjs',
    'subida com barra invertida codificada': '/..%5cservidor.mjs',
    'subida profunda': '/js/../../servidor.mjs',
    'byte nulo': '/index.html%00.js',
    'codificação malformada': '/%E0%A4%A',
  };
  for (const [descricao, caminho] of Object.entries(caminhosInvalidos)) {
    test(`deveRecusar ${descricao}`, () => {
      assert.equal(resolverCaminho(caminho), null);
    });
  }

  test('naoDeveSairDaRaizComCaminhoAbsolutoDoWindows', () => {
    const resultado = resolverCaminho('/C:/Windows/win.ini');
    assert.ok(resultado === null || resultado.startsWith(RAIZ_PUBLICA), `escapou da raiz: ${resultado}`);
  });
});

const PASTA_CERTIFICADOS = join(homedir(), 'skiff-experimento', 'certificados');
const certificadosDisponiveis = ['servidor.crt', 'servidor.key', 'ca-skiff-experimento.crt']
  .every((arquivo) => existsSync(join(PASTA_CERTIFICADOS, arquivo)));

describe('servidor HTTPS', { skip: !certificadosDisponiveis && 'certificados do P0 não encontrados' }, () => {
  let servidor;
  let porta;
  let autoridade;

  before(async () => {
    autoridade = readFileSync(join(PASTA_CERTIFICADOS, 'ca-skiff-experimento.crt'));
    servidor = criarServidor({
      certificado: readFileSync(join(PASTA_CERTIFICADOS, 'servidor.crt')),
      chave: readFileSync(join(PASTA_CERTIFICADOS, 'servidor.key')),
    });
    await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto));
    porta = servidor.address().port;
  });

  after(() => new Promise((encerrado) => servidor.close(encerrado)));

  // Faz uma requisição validando o certificado contra a CA local (sem desativar a verificação TLS).
  function requisitar(caminho, metodo = 'GET') {
    return new Promise((concluir, falhar) => {
      const requisicao = request(
        { host: '127.0.0.1', port: porta, path: caminho, method: metodo, ca: autoridade },
        (resposta) => {
          const partes = [];
          resposta.on('data', (parte) => partes.push(parte));
          resposta.on('end', () => concluir({
            status: resposta.statusCode,
            cabecalhos: resposta.headers,
            corpo: Buffer.concat(partes).toString('utf8'),
          }));
        },
      );
      requisicao.on('error', falhar);
      requisicao.end();
    });
  }

  test('deveServirIndexComCertificadoValidoECabecalhosDeSeguranca', async () => {
    const { status, cabecalhos, corpo } = await requisitar('/');
    assert.equal(status, 200);
    assert.match(cabecalhos['content-type'], /^text\/html/);
    assert.match(corpo, /Experimento da Etapa 1/);
    assert.match(cabecalhos['content-security-policy'], /default-src 'self'/);
    assert.equal(cabecalhos['cross-origin-opener-policy'], 'same-origin');
    assert.equal(cabecalhos['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(cabecalhos['x-content-type-options'], 'nosniff');
  });

  test('deveServirJavaScriptComTipoCorreto', async () => {
    const { status, cabecalhos } = await requisitar('/js/diagnostico.js');
    assert.equal(status, 200);
    assert.match(cabecalhos['content-type'], /^text\/javascript/);
  });

  test('deveResponder404ParaArquivoInexistente', async () => {
    assert.equal((await requisitar('/nao-existe.html')).status, 404);
  });

  test('deveRecusarSubidaDeDiretorioCodificada', async () => {
    const { status, corpo } = await requisitar('/..%2fservidor.mjs');
    assert.equal(status, 400);
    assert.doesNotMatch(corpo, /createServer/);
  });

  test('naoDeveExporArquivosForaDaPastaPublica', async () => {
    // O cliente envia o caminho sem normalizar; o servidor não pode entregar servidor.mjs.
    const { status, corpo } = await requisitar('/../servidor.mjs');
    assert.notEqual(status, 200);
    assert.doesNotMatch(corpo, /createServer/);
  });

  test('deveRecusarMetodosDiferentesDeGetEHead', async () => {
    const { status, cabecalhos } = await requisitar('/', 'POST');
    assert.equal(status, 405);
    assert.equal(cabecalhos.allow, 'GET, HEAD');
  });

  test('deveResponderHeadSemCorpo', async () => {
    const { status, corpo, cabecalhos } = await requisitar('/', 'HEAD');
    assert.equal(status, 200);
    assert.equal(corpo, '');
    assert.ok(Number(cabecalhos['content-length']) > 0);
  });
});
