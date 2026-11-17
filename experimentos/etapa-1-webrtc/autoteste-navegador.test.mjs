// Testes que executam as páginas do protótipo num Chrome real (headless).
// Execução: node --test "experimentos/etapa-1-webrtc/**/*.test.mjs"
//
// Requisitos: Chrome instalado e certificados do P0 com a CA local confiável no Windows.
// Sem eles, os testes são ignorados.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { criarServidor } from './servidor.mjs';
import { abrirNavegador, localizarChrome } from './ferramentas/navegador.mjs';

const PASTA_CERTIFICADOS = join(homedir(), 'skiff-experimento', 'certificados');
const caminhoDoChrome = localizarChrome();
const certificadosDisponiveis = existsSync(join(PASTA_CERTIFICADOS, 'servidor.crt'));
const motivoParaIgnorar = (!caminhoDoChrome && 'Chrome não encontrado')
  || (!certificadosDisponiveis && 'certificados do P0 não encontrados');

describe('autoteste no navegador', { skip: motivoParaIgnorar, timeout: 90_000 }, () => {
  let servidor;
  let navegador;
  let origem;

  before(async () => {
    servidor = criarServidor({
      certificado: readFileSync(join(PASTA_CERTIFICADOS, 'servidor.crt')),
      chave: readFileSync(join(PASTA_CERTIFICADOS, 'servidor.key')),
    });
    await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto));
    origem = `https://localhost:${servidor.address().port}`;
    navegador = await abrirNavegador(caminhoDoChrome);
  });

  after(async () => {
    await navegador?.fechar();
    await new Promise((encerrado) => servidor.close(encerrado));
  });

  test('deveAbrirPaginaComCertificadoConfiavelEContextoSeguro', async () => {
    await navegador.navegar(`${origem}/index.html`);
    const contexto = await navegador.aguardarValor(
      "document.readyState === 'complete' ? { seguro: window.isSecureContext, isolado: window.crossOriginIsolated, titulo: document.title } : null",
    );
    assert.equal(contexto.seguro, true, 'a página deveria estar em contexto seguro');
    assert.equal(contexto.isolado, true, 'COOP/COEP deveriam habilitar crossOriginIsolated');
    assert.match(contexto.titulo, /Experimento da Etapa 1/);
  });

  test('deveCarregarPrototipoManualComConfiguracaoIcePadrao', async () => {
    await navegador.navegar(`${origem}/prototipo.html`);
    // O script do protótipo preenche a configuração ICE ao carregar; se houver erro de JavaScript, o campo fica vazio.
    const configuracao = await navegador.aguardarValor(
      "document.getElementById('configuracao-ice')?.value || null",
      10_000,
    );
    assert.deepEqual(JSON.parse(configuracao), { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  });

  test('deveConectarDoisLadosPorSdpSerializadoEAbrirOsDoisCanais', async (contexto) => {
    await navegador.navegar(`${origem}/autoteste.html`);
    const resultado = await navegador.aguardarValor('window.resultadoDoAutoteste ?? null', 60_000);
    contexto.diagnostic(`Chrome: ${navegador.versao}`);
    contexto.diagnostic(`Resultado: ${JSON.stringify({ ...resultado, navegador: undefined })}`);

    assert.equal(resultado.erro, undefined, resultado.erro);
    assert.deepEqual(resultado.verificacoes, {
      canaisAbertos: true,
      controleDeAParaB: true,
      controleDeBParaA: true,
      dadosBinarios: true,
      parSelecionadoEmA: true,
      parSelecionadoEmB: true,
    });
    assert.equal(resultado.aprovado, true);
    assert.ok(resultado.candidatosNaOferta.host + resultado.candidatosNaOferta.srflx > 0, 'a oferta deveria conter candidatos');
    assert.ok(resultado.parSelecionado.ladoA.local.tipo, 'o par selecionado deveria informar o tipo do candidato local');
  });
});
