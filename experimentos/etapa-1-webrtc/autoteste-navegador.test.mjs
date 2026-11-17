// Testes que executam as páginas do protótipo num Chrome real (headless).
// Execução: node --test "experimentos/etapa-1-webrtc/**/*.test.mjs"
//
// Requisitos: Chrome instalado e certificados do P0 com a CA local confiável no Windows.
// Sem eles, os testes são ignorados.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { criarServidor } from './servidor.mjs';
import { abrirNavegador, localizarChrome } from './ferramentas/navegador.mjs';

const PASTA_CERTIFICADOS = join(homedir(), 'skiff-experimento', 'certificados');
const PASTA_ARQUIVOS_DE_TESTE = join(homedir(), 'skiff-experimento', 'arquivos-de-teste');

/** Lê os SHA-256 de referência gerados no P0 (sha256.txt). */
function lerHashesDeReferencia() {
  const caminho = join(PASTA_ARQUIVOS_DE_TESTE, 'sha256.txt');
  if (!existsSync(caminho)) {
    return {};
  }
  return Object.fromEntries(readFileSync(caminho, 'utf8').trim().split('\n').map((linha) => {
    const [hash, nome] = linha.trim().split(/\s+\*?/);
    return [nome.replace(/^\*/, ''), hash];
  }));
}

const porId = (id) => `document.getElementById(${JSON.stringify(id)})`;

/** Conecta duas abas pelo protótipo manual, copiando oferta e resposta como o usuário faria. */
async function conectarPeloPrototipo(paginaA, paginaB, origem) {
  await Promise.all([paginaA.navegar(`${origem}/prototipo.html`), paginaB.navegar(`${origem}/prototipo.html`)]);
  for (const pagina of [paginaA, paginaB]) {
    await pagina.aguardarValor(`${porId('configuracao-ice')}?.value || null`, 10_000);
  }
  await paginaA.avaliar(`${porId('botao-papel-a')}.click(); ${porId('botao-gerar-oferta')}.click(); true`);
  const oferta = await paginaA.aguardarValor(`${porId('texto-oferta-a')}.value || null`, 20_000);
  await paginaB.avaliar(`${porId('botao-papel-b')}.click(); ${porId('texto-oferta-b')}.value = ${JSON.stringify(oferta)}; ${porId('botao-gerar-resposta')}.click(); true`);
  const resposta = await paginaB.aguardarValor(`${porId('texto-resposta-b')}.value || null`, 20_000);
  await paginaA.avaliar(`${porId('texto-resposta-a')}.value = ${JSON.stringify(resposta)}; ${porId('botao-aplicar-resposta')}.click(); true`);
  for (const pagina of [paginaA, paginaB]) {
    await pagina.aguardarValor(`${porId('estado-canal-dados')}.textContent === 'open' || null`, 20_000);
  }
}

// Calcula, na página de destino, o SHA-256 do arquivo oferecido para download.
// (Verificação do teste; não é a estratégia de hash do experimento, que é incremental — P6.)
const HASH_DO_DOWNLOAD = `(async () => {
  const recebido = window.ultimoArquivoRecebido;
  if (!recebido) return null;
  const dados = await recebido.blob.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', dados));
  return { tamanho: dados.byteLength, sha256: [...hash].map((b) => b.toString(16).padStart(2, '0')).join(''), nome: recebido.nome };
})()`;

/** Envia um arquivo do disco de A para B pela interface e devolve o que B recebeu e as métricas de A. */
async function transferirPeloPrototipo(paginaA, paginaB, caminhoDoArquivo, limiteMs) {
  await paginaB.avaliar('window.ultimoArquivoRecebido = null; true');
  await paginaA.definirArquivos('#arquivo-para-enviar', [caminhoDoArquivo]);
  await paginaA.avaliar(`${porId('botao-enviar-arquivo')}.click(); true`);
  const estadoDoEnvio = await paginaA.aguardarValor(
    `(() => { const t = ${porId('envio-estado')}.textContent; return t.startsWith('concluído') || t.startsWith('falhou') ? t : null; })()`,
    limiteMs,
  );
  const recebido = estadoDoEnvio.startsWith('concluído') ? await paginaB.aguardarValor(HASH_DO_DOWNLOAD, 30_000) : null;
  const metricas = await paginaA.avaliar(`({
    vazao: ${porId('envio-vazao')}.textContent,
    buffer: ${porId('envio-buffer')}.textContent,
    pausas: ${porId('envio-pausas')}.textContent,
  })`);
  // Memória medida separadamente: A mede a si mesma como remetente; B, como destinatário.
  const memoria = {
    remetente: await paginaA.aguardarValor('window.ultimaMemoria?.envio ?? null', 60_000),
    destinatario: await paginaB.aguardarValor('window.ultimaMemoria?.recebimento ?? null', 60_000),
  };
  return { estadoDoEnvio, recebido, metricas, memoria };
}

const emMiB = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
const descreverMemoriaEmMiB = (resumo) => ({
  inicial: emMiB(resumo.inicialBytes), maxima: emMiB(resumo.maximaBytes), final: emMiB(resumo.finalBytes), amostras: resumo.amostras,
});
const caminhoDoChrome = localizarChrome();
const certificadosDisponiveis = existsSync(join(PASTA_CERTIFICADOS, 'servidor.crt'));
const motivoParaIgnorar = (!caminhoDoChrome && 'Chrome não encontrado')
  || (!certificadosDisponiveis && 'certificados do P0 não encontrados');

describe('autoteste no navegador', { skip: motivoParaIgnorar, timeout: 300_000 }, () => {
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
      latenciaMedida: true,
    });
    assert.equal(resultado.aprovado, true);
    // Na mesma máquina a latência deve ser baixa; o limite é folgado para não falhar por oscilação.
    assert.ok(resultado.latenciaDoControle.mediana < 50, `mediana alta: ${resultado.latenciaDoControle.mediana} ms`);
    assert.ok(resultado.candidatosNaOferta.host + resultado.candidatosNaOferta.srflx > 0, 'a oferta deveria conter candidatos');
    assert.ok(resultado.parSelecionado.ladoA.local.tipo, 'o par selecionado deveria informar o tipo do candidato local');
  });

  describe('transferência entre duas abas (P4)', () => {
    const hashes = lerHashesDeReferencia();
    let paginaA;
    let paginaB;

    before(async () => {
      paginaA = navegador;
      paginaB = await navegador.abrirPagina();
      await conectarPeloPrototipo(paginaA, paginaB, origem);
    });

    for (const [nome, limiteMs] of [['teste-10mib.bin', 60_000], ['teste-100mib.bin', 180_000]]) {
      const caminho = join(PASTA_ARQUIVOS_DE_TESTE, nome);
      test(`deveTransferir ${nome} com conteudo identico ao original`, { skip: !existsSync(caminho) && `${nome} não encontrado` }, async (contexto) => {
        const { estadoDoEnvio, recebido, metricas, memoria } = await transferirPeloPrototipo(paginaA, paginaB, caminho, limiteMs);
        contexto.diagnostic(`${nome}: ${JSON.stringify(metricas)}`);
        contexto.diagnostic(`${nome} memória (MiB): remetente ${JSON.stringify(descreverMemoriaEmMiB(memoria.remetente))}, destinatário ${JSON.stringify(descreverMemoriaEmMiB(memoria.destinatario))}`);

        assert.match(estadoDoEnvio, /^concluído/, estadoDoEnvio);
        assert.equal(recebido.nome, nome);
        assert.equal(recebido.tamanho, statSync(caminho).size);
        assert.equal(recebido.sha256, hashes[nome], 'o SHA-256 recebido deveria ser igual ao de referência do P0');

        // Critério da Etapa 1: memória do remetente estável, sem crescer na proporção do arquivo.
        // Margem: limiar alto do buffer (1 MiB) + leitura (1 MiB) + folga do navegador, bem abaixo do tamanho do arquivo.
        const crescimentoDoRemetente = memoria.remetente.maximaBytes - memoria.remetente.inicialBytes;
        assert.ok(crescimentoDoRemetente < 32 * 1024 * 1024, `remetente cresceu ${emMiB(crescimentoDoRemetente)} MiB`);
      });
    }
  });
});
