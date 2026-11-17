// Interface do protótipo de conexão (P2). Liga os botões aos módulos de conexão e estatísticas.

import {
  CONFIGURACAO_ICE_PADRAO,
  aplicarResposta,
  contarCandidatos,
  criarConexao,
  gerarOferta,
  responderOferta,
} from './conexao.js';
import { classificarCaminho, obterParSelecionado } from './estatisticas.js';
import { criarCanalDeControle } from './controle.js';
import { criarMedidorDeLatencia } from './latencia.js';
import { formatarMs } from './metricas.js';

const elemento = (id) => document.getElementById(id);

let sessao = null; // { conexao, canais, controle, medidorDeLatencia }
let atualizacaoPeriodica = null;

// ---------- registro de eventos (sem SDP e sem endereços IP) ----------

function registrar(mensagem) {
  const item = document.createElement('li');
  const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  item.textContent = `${horario} — ${mensagem}`;
  elemento('registro').prepend(item);
}

// ---------- estado ----------

function exibirEstados(estados) {
  elemento('estado-conexao').textContent = estados.conexao;
  elemento('estado-ice').textContent = estados.conexaoIce;
  elemento('estado-coleta').textContent = estados.coletaIce;
  elemento('estado-sinalizacao').textContent = estados.sinalizacao;
}

function exibirEstadoDoCanal(nome, canal) {
  elemento(`estado-canal-${nome}`).textContent = canal.readyState;
}

function descreverCandidato(candidato) {
  if (!candidato) {
    return '—';
  }
  const relay = candidato.protocoloAteOTurn ? `, até o TURN por ${candidato.protocoloAteOTurn}` : '';
  return `${candidato.tipo} (${candidato.protocolo}${relay})`;
}

async function atualizarParSelecionado() {
  if (!sessao) {
    return;
  }
  const par = await obterParSelecionado(sessao.conexao);
  elemento('par-caminho').textContent = classificarCaminho(par);
  elemento('par-local').textContent = descreverCandidato(par?.local);
  elemento('par-remoto').textContent = descreverCandidato(par?.remoto);
  elemento('par-rtt').textContent = par?.tempoDeIdaEVoltaMs != null ? `${par.tempoDeIdaEVoltaMs.toFixed(1)} ms` : '—';
  return par;
}

// ---------- criação da conexão ----------

function lerConfiguracaoIce() {
  try {
    return JSON.parse(elemento('configuracao-ice').value);
  } catch {
    throw new Error('A configuração ICE não é um JSON válido.');
  }
}

function iniciarSessao() {
  if (sessao) {
    return sessao;
  }
  const configuracao = lerConfiguracaoIce();
  elemento('configuracao-ice').readOnly = true;

  sessao = criarConexao(configuracao, (evento, estados) => {
    exibirEstados(estados);
    if (evento === 'connectionstatechange') {
      registrar(`Conexão: ${estados.conexao}`);
      if (estados.conexao === 'connected') {
        atualizarParSelecionado().then((par) => {
          registrar(`Par selecionado: local ${par?.local?.tipo ?? '?'}, remoto ${par?.remoto?.tipo ?? '?'} → ${classificarCaminho(par)}`);
        });
        atualizacaoPeriodica ??= setInterval(atualizarParSelecionado, 2000);
      }
    }
  });
  exibirEstados({
    conexao: sessao.conexao.connectionState,
    conexaoIce: sessao.conexao.iceConnectionState,
    coletaIce: sessao.conexao.iceGatheringState,
    sinalizacao: sessao.conexao.signalingState,
  });

  for (const [nome, canal] of Object.entries(sessao.canais)) {
    exibirEstadoDoCanal(nome, canal);
    canal.addEventListener('open', () => {
      exibirEstadoDoCanal(nome, canal);
      registrar(`Canal "${nome}" aberto`);
      if (nome === 'controle') {
        elemento('botao-enviar-mensagem').disabled = false;
        elemento('botao-atualizar-par').disabled = false;
        elemento('botao-medir-latencia').disabled = false;
      }
    });
    canal.addEventListener('close', () => {
      exibirEstadoDoCanal(nome, canal);
      registrar(`Canal "${nome}" fechado`);
    });
  }

  sessao.controle = criarCanalDeControle(sessao.canais.controle, registrar);
  sessao.medidorDeLatencia = criarMedidorDeLatencia(sessao.controle);
  sessao.controle.aoReceber('mensagem-de-teste', (mensagem) => {
    if (typeof mensagem.texto === 'string') {
      registrar(`Recebido no "controle": "${mensagem.texto.slice(0, 200)}"`);
    }
  });

  registrar(`Conexão criada com ${configuracao.iceServers?.length ?? 0} servidor(es) ICE`);
  return sessao;
}

function exibirCandidatosLocais() {
  const contagem = contarCandidatos(sessao.conexao.localDescription.sdp);
  elemento('candidatos-locais').textContent = Object.entries(contagem)
    .map(([tipo, quantidade]) => `${tipo}: ${quantidade}`)
    .join(', ');
  return contagem;
}

// ---------- ações dos botões ----------

async function executar(acao, descricao) {
  try {
    await acao();
  } catch (erro) {
    registrar(`Erro ao ${descricao}: ${erro.message}`);
  }
}

function escolherPapel(papel) {
  elemento('painel-a').hidden = papel !== 'A';
  elemento('painel-b').hidden = papel !== 'B';
  elemento('botao-papel-a').disabled = true;
  elemento('botao-papel-b').disabled = true;
  registrar(`Papel escolhido: ${papel}`);
}

async function copiar(idDoTexto) {
  const texto = elemento(idDoTexto).value;
  try {
    await navigator.clipboard.writeText(texto);
    registrar('Texto copiado para a área de transferência');
  } catch {
    elemento(idDoTexto).select();
    registrar('Cópia automática indisponível: o texto foi selecionado para cópia manual');
  }
}

function avisarSeColetaIncompleta(coletaConcluida) {
  if (!coletaConcluida) {
    registrar('Atenção: a coleta de candidatos não terminou no prazo; o SDP contém só os candidatos já coletados');
  }
}

elemento('configuracao-ice').value = JSON.stringify(CONFIGURACAO_ICE_PADRAO, null, 2);

elemento('botao-papel-a').addEventListener('click', () => executar(async () => {
  escolherPapel('A');
}, 'escolher o papel'));

elemento('botao-papel-b').addEventListener('click', () => executar(async () => {
  escolherPapel('B');
}, 'escolher o papel'));

elemento('botao-gerar-oferta').addEventListener('click', () => executar(async () => {
  const { conexao } = iniciarSessao();
  elemento('botao-gerar-oferta').disabled = true;
  registrar('Gerando oferta e coletando candidatos...');
  const { texto, coletaConcluida } = await gerarOferta(conexao);
  avisarSeColetaIncompleta(coletaConcluida);
  elemento('texto-oferta-a').value = texto;
  elemento('botao-copiar-oferta').disabled = false;
  elemento('botao-aplicar-resposta').disabled = false;
  const contagem = exibirCandidatosLocais();
  registrar(`Oferta pronta (candidatos: host ${contagem.host}, srflx ${contagem.srflx}, relay ${contagem.relay})`);
}, 'gerar a oferta'));

elemento('botao-copiar-oferta').addEventListener('click', () => copiar('texto-oferta-a'));

elemento('botao-aplicar-resposta').addEventListener('click', () => executar(async () => {
  await aplicarResposta(sessao.conexao, elemento('texto-resposta-a').value);
  elemento('botao-aplicar-resposta').disabled = true;
  registrar('Resposta aplicada; aguardando a conexão');
}, 'aplicar a resposta'));

elemento('botao-gerar-resposta').addEventListener('click', () => executar(async () => {
  const { conexao } = iniciarSessao();
  elemento('botao-gerar-resposta').disabled = true;
  registrar('Gerando resposta e coletando candidatos...');
  try {
    const { texto, coletaConcluida } = await responderOferta(conexao, elemento('texto-oferta-b').value);
    avisarSeColetaIncompleta(coletaConcluida);
    elemento('texto-resposta-b').value = texto;
    elemento('botao-copiar-resposta').disabled = false;
    const contagem = exibirCandidatosLocais();
    registrar(`Resposta pronta (candidatos: host ${contagem.host}, srflx ${contagem.srflx}, relay ${contagem.relay})`);
  } catch (erro) {
    // Se a oferta colada era inválida, nada foi aplicado: permite tentar de novo.
    elemento('botao-gerar-resposta').disabled = sessao.conexao.remoteDescription !== null;
    throw erro;
  }
}, 'gerar a resposta'));

elemento('botao-copiar-resposta').addEventListener('click', () => copiar('texto-resposta-b'));

elemento('botao-atualizar-par').addEventListener('click', () => executar(atualizarParSelecionado, 'ler as estatísticas'));

elemento('botao-enviar-mensagem').addEventListener('click', () => executar(async () => {
  const texto = elemento('texto-mensagem').value.slice(0, 200);
  sessao.controle.enviar({ tipo: 'mensagem-de-teste', texto });
  registrar(`Enviado no "controle": "${texto}"`);
}, 'enviar a mensagem'));

function lerInteiro(id, minimo, maximo) {
  const valor = Number.parseInt(elemento(id).value, 10);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`"${elemento(id).labels?.[0]?.textContent ?? id}" deve estar entre ${minimo} e ${maximo}.`);
  }
  return valor;
}

elemento('botao-medir-latencia').addEventListener('click', () => executar(async () => {
  const quantidade = lerInteiro('quantidade-de-sondas', 1, 500);
  const intervaloMs = lerInteiro('intervalo-entre-sondas', 0, 5_000);
  elemento('botao-medir-latencia').disabled = true;
  registrar(`Medindo latência: ${quantidade} sondas, intervalo de ${intervaloMs} ms...`);
  try {
    const { resumo, perdidas } = await sessao.medidorDeLatencia.medir({ quantidade, intervaloMs });
    elemento('latencia-amostras').textContent = `${resumo.quantidade} respondidas, ${perdidas} sem resposta`;
    elemento('latencia-minimo').textContent = formatarMs(resumo.minimo);
    elemento('latencia-mediana').textContent = formatarMs(resumo.mediana);
    elemento('latencia-p95').textContent = formatarMs(resumo.p95);
    elemento('latencia-maximo').textContent = formatarMs(resumo.maximo);
    registrar(`Latência do "controle": mediana ${formatarMs(resumo.mediana)}, p95 ${formatarMs(resumo.p95)}, máximo ${formatarMs(resumo.maximo)}, ${perdidas} sem resposta`);
  } finally {
    elemento('botao-medir-latencia').disabled = false;
  }
}, 'medir a latência'));
