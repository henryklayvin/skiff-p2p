// Servidor HTTPS estático do experimento da Etapa 1 (protótipo descartável).
// Usa apenas módulos nativos do Node.js, sem dependências.
//
// Uso:
//   node experimentos/etapa-1-webrtc/servidor.mjs
//
// Variáveis de ambiente opcionais:
//   SKIFF_ENDERECO      endereço de escuta (padrão: 0.0.0.0, todas as interfaces)
//   SKIFF_PORTA         porta (padrão: 8443)
//   SKIFF_CERTIFICADOS  pasta com servidor.crt e servidor.key
//                       (padrão: ~/skiff-experimento/certificados)

import { createServer } from 'node:https';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir, networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRETORIO_DO_SCRIPT = fileURLToPath(new URL('.', import.meta.url));

// Único diretório servido. Nada fora dele pode ser acessado.
export const RAIZ_PUBLICA = resolve(DIRETORIO_DO_SCRIPT, 'publico');

const TIPOS_DE_CONTEUDO = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Cabeçalhos aplicados a todas as respostas.
// COOP + COEP habilitam "crossOriginIsolated", necessário para medir memória com
// performance.measureUserAgentSpecificMemory() em navegadores Chromium (passo P8).
// 'wasm-unsafe-eval' permite compilar WebAssembly (hash-wasm, passo P6) sem liberar eval().
export const CABECALHOS_DE_SEGURANCA = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/**
 * Converte o caminho da URL em um caminho de arquivo dentro de RAIZ_PUBLICA.
 * Retorna null quando o caminho é inválido ou tenta sair da raiz (ex.: "../").
 */
export function resolverCaminho(caminhoDaUrl, raiz = RAIZ_PUBLICA) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(caminhoDaUrl);
  } catch {
    return null; // codificação percentual malformada
  }
  if (decodificado.includes('\0')) {
    return null;
  }
  const relativo = decodificado.endsWith('/') ? `${decodificado}index.html` : decodificado;
  const absoluto = resolve(raiz, `.${relativo.startsWith('/') ? '' : '/'}${relativo}`);
  if (absoluto !== raiz && !absoluto.startsWith(raiz + sep)) {
    return null;
  }
  return absoluto;
}

function responderErro(resposta, status, mensagem, extras = {}) {
  resposta.writeHead(status, {
    ...CABECALHOS_DE_SEGURANCA,
    'Content-Type': 'text/plain; charset=utf-8',
    ...extras,
  });
  resposta.end(`${status} ${mensagem}\n`);
}

async function tratarRequisicao(requisicao, resposta) {
  if (requisicao.method !== 'GET' && requisicao.method !== 'HEAD') {
    responderErro(resposta, 405, 'Método não permitido', { Allow: 'GET, HEAD' });
    return;
  }

  const caminhoDaUrl = new URL(requisicao.url, 'https://localhost').pathname;
  let arquivo = resolverCaminho(caminhoDaUrl);
  if (arquivo === null) {
    responderErro(resposta, 400, 'Caminho inválido');
    return;
  }

  try {
    let informacoes = await stat(arquivo);
    if (informacoes.isDirectory()) {
      arquivo = join(arquivo, 'index.html');
      informacoes = await stat(arquivo);
    }
    if (!informacoes.isFile()) {
      responderErro(resposta, 404, 'Não encontrado');
      return;
    }

    resposta.writeHead(200, {
      ...CABECALHOS_DE_SEGURANCA,
      'Content-Type': TIPOS_DE_CONTEUDO[extname(arquivo).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': informacoes.size,
    });
    if (requisicao.method === 'HEAD') {
      resposta.end();
      return;
    }
    createReadStream(arquivo)
      .on('error', () => resposta.destroy())
      .pipe(resposta);
  } catch {
    responderErro(resposta, 404, 'Não encontrado');
  }
}

/** Cria o servidor HTTPS sem iniciá-lo. */
export function criarServidor({ certificado, chave }) {
  const servidor = createServer({ cert: certificado, key: chave }, (requisicao, resposta) => {
    resposta.on('finish', () => {
      // Registro mínimo: sem IP do cliente, sem query string, sem cabeçalhos.
      const caminho = (requisicao.url ?? '').split('?')[0];
      console.log(`${requisicao.method} ${caminho} -> ${resposta.statusCode}`);
    });
    tratarRequisicao(requisicao, resposta).catch(() => {
      if (!resposta.headersSent) {
        responderErro(resposta, 500, 'Erro interno');
      } else {
        resposta.destroy();
      }
    });
  });
  return servidor;
}

function lerCertificados(pasta) {
  try {
    return {
      certificado: readFileSync(join(pasta, 'servidor.crt')),
      chave: readFileSync(join(pasta, 'servidor.key')),
    };
  } catch (erro) {
    console.error(`Não foi possível ler servidor.crt e servidor.key em: ${pasta}`);
    console.error('Gere os certificados conforme experimentos/etapa-1-webrtc/README.md (passo P0).');
    console.error(`Detalhe: ${erro.message}`);
    process.exit(1);
  }
}

function enderecosIPv4Locais() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((interfaceDeRede) => interfaceDeRede && interfaceDeRede.family === 'IPv4' && !interfaceDeRede.internal)
    .map((interfaceDeRede) => interfaceDeRede.address);
}

// Executa apenas quando chamado diretamente (não quando importado pelos testes).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const endereco = process.env.SKIFF_ENDERECO ?? '0.0.0.0';
  const porta = Number(process.env.SKIFF_PORTA ?? 8443);
  const pastaDeCertificados = process.env.SKIFF_CERTIFICADOS ?? join(homedir(), 'skiff-experimento', 'certificados');

  const servidor = criarServidor(lerCertificados(pastaDeCertificados));
  servidor.listen(porta, endereco, () => {
    console.log(`Servindo ${RAIZ_PUBLICA}`);
    console.log(`  https://localhost:${porta}/`);
    if (endereco === '0.0.0.0') {
      for (const ip of enderecosIPv4Locais()) {
        console.log(`  https://${ip}:${porta}/`);
      }
    }
    console.log('Ctrl+C para encerrar.');
  });
}
