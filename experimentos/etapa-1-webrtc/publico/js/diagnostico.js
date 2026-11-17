// Diagnóstico do navegador para o experimento da Etapa 1.
// Verifica apenas a disponibilidade das APIs. Não abre conexões nem grava dados.

const verificacoes = [
  {
    item: 'Contexto seguro (HTTPS)',
    obrigatorio: true,
    avaliar: () => window.isSecureContext,
  },
  {
    item: 'RTCPeerConnection (WebRTC)',
    obrigatorio: true,
    avaliar: () => typeof RTCPeerConnection === 'function',
  },
  {
    item: 'RTCDataChannel',
    obrigatorio: true,
    avaliar: () => typeof RTCDataChannel === 'function',
  },
  {
    item: 'Leitura de arquivos em partes (Blob.slice / Blob.stream)',
    obrigatorio: true,
    avaliar: () => typeof Blob.prototype.slice === 'function' && typeof Blob.prototype.stream === 'function',
  },
  {
    item: 'WebAssembly (para hash-wasm)',
    obrigatorio: true,
    avaliar: () => typeof WebAssembly === 'object',
  },
  {
    item: 'Isolamento de origem (crossOriginIsolated)',
    obrigatorio: false,
    avaliar: () => window.crossOriginIsolated === true,
  },
  {
    item: 'Medição de memória (measureUserAgentSpecificMemory)',
    obrigatorio: false,
    avaliar: () => typeof performance.measureUserAgentSpecificMemory === 'function',
  },
  {
    item: 'OPFS (navigator.storage.getDirectory)',
    obrigatorio: false,
    avaliar: () => typeof navigator.storage?.getDirectory === 'function',
  },
  {
    item: 'File System Access (showSaveFilePicker)',
    obrigatorio: false,
    avaliar: () => typeof window.showSaveFilePicker === 'function',
  },
  {
    item: 'Screen Wake Lock (navigator.wakeLock)',
    obrigatorio: false,
    avaliar: () => typeof navigator.wakeLock?.request === 'function',
  },
];

function descreverResultado(disponivel, obrigatorio) {
  if (disponivel) {
    return { texto: 'Disponível', classe: 'ok' };
  }
  return obrigatorio
    ? { texto: 'Indisponível (obrigatório)', classe: 'falha' }
    : { texto: 'Indisponível', classe: 'neutro' };
}

function renderizarDiagnostico() {
  const tabela = document.getElementById('tabela-diagnostico');

  for (const { item, obrigatorio, avaliar } of verificacoes) {
    let disponivel = false;
    try {
      disponivel = Boolean(avaliar());
    } catch {
      disponivel = false;
    }
    const { texto, classe } = descreverResultado(disponivel, obrigatorio);

    const linha = document.createElement('tr');
    const celulaItem = document.createElement('td');
    const celulaResultado = document.createElement('td');
    celulaItem.textContent = item;
    celulaResultado.textContent = texto;
    celulaResultado.className = classe;
    linha.append(celulaItem, celulaResultado);
    tabela.append(linha);
  }

  document.getElementById('agente-do-usuario').textContent = navigator.userAgent;
}

renderizarDiagnostico();
