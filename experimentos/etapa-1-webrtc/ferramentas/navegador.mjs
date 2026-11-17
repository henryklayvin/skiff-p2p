// Controle mínimo do Chrome em modo headless pelo Chrome DevTools Protocol (CDP).
// Usa apenas recursos nativos do Node.js 22+ (WebSocket e fetch globais), sem dependências.
// Usado pelos testes automáticos do experimento para executar páginas em um navegador real.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

/** Localiza o Chrome: variável SKIFF_CHROME ou caminhos padrão do Windows. Retorna null se não houver. */
export function localizarChrome() {
  const candidatos = [
    process.env.SKIFF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidatos.find((caminho) => existsSync(caminho)) ?? null;
}

function conectarCdp(urlDoWebSocket) {
  return new Promise((pronto, falhar) => {
    const socket = new WebSocket(urlDoWebSocket);
    let proximoId = 1;
    const pendentes = new Map();

    socket.addEventListener('message', (evento) => {
      const mensagem = JSON.parse(evento.data);
      const pendente = pendentes.get(mensagem.id);
      if (!pendente) {
        return;
      }
      pendentes.delete(mensagem.id);
      if (mensagem.error) {
        pendente.falhar(new Error(mensagem.error.message));
      } else {
        pendente.concluir(mensagem.result);
      }
    });
    socket.addEventListener('error', () => falhar(new Error(`Falha ao conectar ao CDP: ${urlDoWebSocket}`)), { once: true });
    socket.addEventListener('open', () => pronto({
      enviar(metodo, parametros = {}) {
        return new Promise((concluir, falharEnvio) => {
          const id = proximoId++;
          pendentes.set(id, { concluir, falhar: falharEnvio });
          socket.send(JSON.stringify({ id, method: metodo, params: parametros }));
        });
      },
      fechar: () => socket.close(),
    }), { once: true });
  });
}

/** Operações sobre uma página (aba) controlada pelo CDP. */
function criarPagina(cdp) {
  return {
    navegar: (url) => cdp.enviar('Page.navigate', { url }),

    async avaliar(expressao) {
      const { result, exceptionDetails } = await cdp.enviar('Runtime.evaluate', {
        expression: expressao,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value;
    },

    /** Avalia a expressão repetidamente até ela retornar algo diferente de null/undefined. */
    async aguardarValor(expressao, limiteMs = 30_000) {
      const fim = Date.now() + limiteMs;
      while (Date.now() < fim) {
        const valor = await this.avaliar(expressao);
        if (valor !== null && valor !== undefined) {
          return valor;
        }
        await esperar(200);
      }
      throw new Error(`Tempo esgotado aguardando: ${expressao}`);
    },

    /** Anexa arquivos do disco a um <input type="file">, como se o usuário os tivesse escolhido. */
    async definirArquivos(seletor, caminhos) {
      const { root } = await cdp.enviar('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.enviar('DOM.querySelector', { nodeId: root.nodeId, selector: seletor });
      if (!nodeId) {
        throw new Error(`Elemento não encontrado: ${seletor}`);
      }
      await cdp.enviar('DOM.setFileInputFiles', { nodeId, files: caminhos });
    },

    fechar: () => cdp.fechar(),
  };
}

/**
 * Abre o Chrome headless com um perfil temporário. Devolve a página inicial
 * (navegar, avaliar, aguardarValor, definirArquivos), abrirPagina() para abas extras e fechar().
 */
export async function abrirNavegador(caminhoDoChrome) {
  const perfilTemporario = await mkdtemp(join(tmpdir(), 'skiff-chrome-'));
  const processo = spawn(caminhoDoChrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${perfilTemporario}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Abas em segundo plano não devem ser desaceleradas durante os testes de transferência.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // Faz measureUserAgentSpecificMemory() medir na hora, sem esperar a próxima coleta de lixo.
    '--enable-blink-features=ForceEagerMeasureMemory',
    'about:blank',
  ], { stdio: 'ignore' });
  const saida = new Promise((encerrado) => processo.once('exit', encerrado));

  // Com a porta 0, o Chrome escolhe uma porta livre e a registra neste arquivo.
  let porta = null;
  for (let tentativa = 0; tentativa < 100 && !porta; tentativa++) {
    try {
      porta = (await readFile(join(perfilTemporario, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim() || null;
    } catch {
      await esperar(100);
    }
  }
  if (!porta) {
    processo.kill();
    throw new Error('O Chrome não iniciou a depuração remota a tempo.');
  }

  const versao = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json();
  const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
  const pagina = alvos.find((alvo) => alvo.type === 'page');
  const cdpDoNavegador = await conectarCdp(versao.webSocketDebuggerUrl);
  const paginaInicial = criarPagina(await conectarCdp(pagina.webSocketDebuggerUrl));
  const paginasExtras = [];

  return {
    ...paginaInicial,
    versao: versao.Browser,

    /** Abre uma nova aba no mesmo navegador (mesmo perfil) e devolve suas operações. */
    async abrirPagina(url = 'about:blank') {
      const { targetId } = await cdpDoNavegador.enviar('Target.createTarget', { url });
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      const alvo = lista.find((item) => item.id === targetId);
      const novaPagina = criarPagina(await conectarCdp(alvo.webSocketDebuggerUrl));
      paginasExtras.push(novaPagina);
      return novaPagina;
    },

    async fechar() {
      for (const extra of paginasExtras) {
        extra.fechar();
      }
      paginaInicial.fechar();
      await cdpDoNavegador.enviar('Browser.close').catch(() => {});
      cdpDoNavegador.fechar();
      await Promise.race([saida, esperar(5_000)]);
      if (processo.exitCode === null) {
        processo.kill();
      }
      await rm(perfilTemporario, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}
