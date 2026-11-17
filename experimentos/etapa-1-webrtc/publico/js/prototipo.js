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
import { formatarBytes, formatarMs } from './metricas.js';
import { PARAMETROS_PADRAO, UNIDADES } from './parametros.js';
import { enviarArquivo } from './envio.js';
import { criarRecebedor } from './recebimento.js';
import { criarAmostradorDeMemoria } from './memoria.js';
import { criarDestinoComAtraso, criarDestinoEmBlob } from './destinos.js';

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
      if (nome === 'dados') {
        elemento('botao-enviar-arquivo').disabled = false;
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
  prepararRecebimento();

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

// ---------- transferência de arquivo (P4) ----------

const porcentagem = (parte, total) => (total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '100%');
const descreverVazao = (duracaoMs, vazaoMiBs) => `${(duracaoMs / 1000).toFixed(2)} s / ${vazaoMiBs.toFixed(1)} MiB/s`;
let urlDoUltimoArquivo = null;
window.ultimaMemoria = { envio: null, recebimento: null }; // lido pelos testes automáticos

function descreverMemoria(resumo) {
  if (!resumo) {
    return 'indisponível neste navegador';
  }
  return `${formatarBytes(resumo.inicialBytes)} / ${formatarBytes(resumo.maximaBytes)} / ${formatarBytes(resumo.finalBytes)} (${resumo.amostras} amostras)`;
}

async function encerrarAmostragem(amostrador, lado) {
  const resumo = await amostrador.parar();
  window.ultimaMemoria[lado] = resumo;
  elemento(`${lado}-memoria`).textContent = descreverMemoria(resumo);
  if (resumo) {
    registrar(`Memória da aba (${lado}): inicial ${formatarBytes(resumo.inicialBytes)}, máxima ${formatarBytes(resumo.maximaBytes)}, final ${formatarBytes(resumo.finalBytes)}`);
  }
}

function prepararRecebimento() {
  let progressoDoRecebimento = 0;
  let amostrador = null;
  const iniciarAmostragem = () => {
    if (!amostrador) {
      progressoDoRecebimento = 0;
      amostrador = criarAmostradorDeMemoria(() => progressoDoRecebimento);
      elemento('recebimento-memoria').textContent = amostrador.disponivel ? 'medindo...' : 'indisponível neste navegador';
      window.ultimaMemoria.recebimento = null;
      amostrador.iniciar();
    }
  };
  const finalizarAmostragem = () => {
    const atual = amostrador;
    amostrador = null;
    if (atual) {
      encerrarAmostragem(atual, 'recebimento');
    }
  };

  criarRecebedor({
    canalDeDados: sessao.canais.dados,
    controle: sessao.controle,
    aoRegistrar: registrar,
    criarDestino: () => {
      const atrasoMsPorMiB = lerInteiro('atraso-de-gravacao', 0, 10_000);
      const destino = criarDestinoEmBlob();
      return atrasoMsPorMiB > 0 ? criarDestinoComAtraso(destino, atrasoMsPorMiB) : destino;
    },
    aoProgredir: ({ bytesRecebidos, bytesConfirmados, total }) => {
      iniciarAmostragem();
      progressoDoRecebimento = total > 0 ? bytesConfirmados / total : 1;
      elemento('recebimento-estado').textContent = 'recebendo';
      elemento('progresso-recebimento').value = progressoDoRecebimento;
      elemento('recebimento-bytes').textContent = `${formatarBytes(bytesRecebidos)} de ${formatarBytes(total)} (${porcentagem(bytesRecebidos, total)})`;
      elemento('recebimento-confirmados').textContent = `${formatarBytes(bytesConfirmados)} (${porcentagem(bytesConfirmados, total)})`;
    },
    aoConcluir: (resultado) => {
      elemento('recebimento-estado').textContent = 'concluído';
      elemento('progresso-recebimento').value = 1;
      elemento('recebimento-bytes').textContent = `${formatarBytes(resultado.bytesRecebidos)} em ${resultado.blocos} blocos`;
      elemento('recebimento-confirmados').textContent = formatarBytes(resultado.bytesRecebidos);
      elemento('recebimento-confirmacoes').textContent = String(resultado.confirmacoesEnviadas);
      elemento('recebimento-vazao').textContent = descreverVazao(resultado.duracaoMs, resultado.vazaoMiBs);
      if (urlDoUltimoArquivo) {
        URL.revokeObjectURL(urlDoUltimoArquivo);
      }
      urlDoUltimoArquivo = URL.createObjectURL(resultado.blob);
      // Acesso para os testes automáticos conferirem o conteúdo (a CSP não permite fetch de blob:).
      window.ultimoArquivoRecebido = { blob: resultado.blob, nome: resultado.nomeSeguro };
      const link = elemento('link-download');
      link.href = urlDoUltimoArquivo;
      link.download = resultado.nomeSeguro;
      link.textContent = `Baixar ${resultado.nomeSeguro} (${formatarBytes(resultado.bytesRecebidos)})`;
      link.hidden = false;
      registrar(`Arquivo recebido: ${formatarBytes(resultado.bytesRecebidos)}, ${descreverVazao(resultado.duracaoMs, resultado.vazaoMiBs)}, destino ${resultado.destino}`);
      finalizarAmostragem();
    },
    aoFalhar: (erro) => {
      elemento('recebimento-estado').textContent = `falhou: ${erro.message}`;
      registrar(`Recebimento falhou: ${erro.message}`);
      finalizarAmostragem();
    },
  });
}

function lerParametrosDeEnvio() {
  const limiarAltoDoBuffer = lerInteiro('limiar-alto', 16, 16 * 1024) * UNIDADES.KiB;
  const limiarBaixoDoBuffer = lerInteiro('limiar-baixo', 0, 16_000) * UNIDADES.KiB;
  if (limiarBaixoDoBuffer >= limiarAltoDoBuffer) {
    throw new Error('O limiar baixo deve ser menor que o limiar alto.');
  }
  return {
    ...PARAMETROS_PADRAO,
    limiarAltoDoBuffer,
    limiarBaixoDoBuffer,
    janelaDeBytesNaoConfirmados: lerInteiro('janela', 16, 262_144) * UNIDADES.KiB,
    intervaloDeConfirmacaoBytes: lerInteiro('confirmacao-bytes', 64, 65_536) * UNIDADES.KiB,
    intervaloDeConfirmacaoMs: lerInteiro('confirmacao-ms', 10, 5_000),
    prazoSemConfirmacaoMs: lerInteiro('prazo-sem-confirmacao', 1, 600) * 1000,
  };
}

elemento('botao-enviar-arquivo').addEventListener('click', () => executar(async () => {
  const arquivo = elemento('arquivo-para-enviar').files?.[0];
  if (!arquivo) {
    throw new Error('Escolha um arquivo.');
  }
  const parametros = lerParametrosDeEnvio();
  elemento('botao-enviar-arquivo').disabled = true;
  elemento('envio-estado').textContent = 'aguardando aceite';
  elemento('progresso-envio').value = 0;
  registrar(`Enviando ${formatarBytes(arquivo.size)} (limiares do buffer: ${formatarBytes(parametros.limiarAltoDoBuffer)} / ${formatarBytes(parametros.limiarBaixoDoBuffer)})`);
  let progressoDoEnvio = 0;
  const amostrador = criarAmostradorDeMemoria(() => progressoDoEnvio);
  window.ultimaMemoria.envio = null;
  elemento('envio-memoria').textContent = amostrador.disponivel ? 'medindo...' : 'indisponível neste navegador';
  amostrador.iniciar();
  try {
    const resultado = await enviarArquivo({
      arquivo,
      canalDeDados: sessao.canais.dados,
      controle: sessao.controle,
      parametros,
      aoRegistrar: registrar,
      aoProgredir: ({ bytesEnviados, bytesConfirmados, total, bufferAtual, maiorBufferObservado, janelaAtual, maiorJanelaObservada }) => {
        progressoDoEnvio = total > 0 ? bytesConfirmados / total : 1;
        elemento('envio-estado').textContent = 'enviando';
        elemento('progresso-envio').value = progressoDoEnvio;
        elemento('envio-bytes').textContent = `${formatarBytes(bytesEnviados)} de ${formatarBytes(total)} (${porcentagem(bytesEnviados, total)})`;
        elemento('envio-confirmados').textContent = `${formatarBytes(bytesConfirmados)} (${porcentagem(bytesConfirmados, total)})`;
        elemento('envio-buffer').textContent = `${formatarBytes(bufferAtual)} / ${formatarBytes(maiorBufferObservado)}`;
        elemento('envio-janela').textContent = `${formatarBytes(janelaAtual)} / ${formatarBytes(maiorJanelaObservada)}`;
      },
    });
    elemento('progresso-envio').value = 1;
    elemento('envio-confirmados').textContent = `${formatarBytes(resultado.bytesConfirmados)} (100.0%)`;
    elemento('envio-janela').textContent = `maior: ${formatarBytes(resultado.maiorJanelaObservada)}`;
    elemento('envio-confirmacoes').textContent = String(resultado.confirmacoesRecebidas);
    // Acesso para os testes automáticos coletarem as métricas completas do envio.
    window.ultimoEnvio = resultado;
    elemento('envio-estado').textContent = 'concluído (destinatário confirmou o recebimento)';
    elemento('envio-buffer').textContent = `maior: ${formatarBytes(resultado.maiorBufferObservado)}`;
    elemento('envio-pausas').textContent = `${resultado.pausasPorBufferCheio} / ${resultado.pausasPorJanelaCheia}`;
    elemento('envio-vazao').textContent = descreverVazao(resultado.duracaoMs, resultado.vazaoMiBs);
    registrar(`Envio concluído: ${resultado.blocos} blocos, ${descreverVazao(resultado.duracaoMs, resultado.vazaoMiBs)}, maior buffer ${formatarBytes(resultado.maiorBufferObservado)}, maior janela ${formatarBytes(resultado.maiorJanelaObservada)}, pausas ${resultado.pausasPorBufferCheio}/${resultado.pausasPorJanelaCheia}, ${resultado.confirmacoesRecebidas} confirmações`);
  } catch (erro) {
    elemento('envio-estado').textContent = `falhou: ${erro.message}`;
    throw erro;
  } finally {
    elemento('botao-enviar-arquivo').disabled = sessao.canais.dados.readyState !== 'open';
    encerrarAmostragem(amostrador, 'envio');
  }
}, 'enviar o arquivo'));

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
