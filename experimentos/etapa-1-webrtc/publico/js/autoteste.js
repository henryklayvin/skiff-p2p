// Autoteste da conexão (P2): os lados A e B rodam na mesma página.
// O SDP passa pelos mesmos textos serializados da troca manual, então o teste
// cobre gerarOferta -> responderOferta -> aplicarResposta de ponta a ponta.
// O resultado fica em window.resultadoDoAutoteste (lido pelos testes automáticos)
// e não contém SDP nem endereços IP.

import {
  CONFIGURACAO_ICE_PADRAO,
  aplicarResposta,
  contarCandidatos,
  criarConexao,
  gerarOferta,
  responderOferta,
} from './conexao.js';
import { classificarCaminho, obterParSelecionado } from './estatisticas.js';

const comPrazo = (promessa, ms, descricao) => Promise.race([
  promessa,
  new Promise((_, falhar) => setTimeout(() => falhar(new Error(`Tempo esgotado: ${descricao}`)), ms)),
]);

const aguardarAbertura = (canal) => (canal.readyState === 'open'
  ? Promise.resolve()
  : new Promise((abrir, falhar) => {
    canal.addEventListener('open', abrir, { once: true });
    canal.addEventListener('error', () => falhar(new Error(`Erro no canal "${canal.label}"`)), { once: true });
  }));

const receberMensagem = (canal) => new Promise((receber) => {
  canal.addEventListener('message', (evento) => receber(evento.data), { once: true });
});

async function executarAutoteste() {
  const inicio = performance.now();
  const ladoA = criarConexao(CONFIGURACAO_ICE_PADRAO);
  const ladoB = criarConexao(CONFIGURACAO_ICE_PADRAO);

  const oferta = await gerarOferta(ladoA.conexao);
  const resposta = await responderOferta(ladoB.conexao, oferta.texto);
  await aplicarResposta(ladoA.conexao, resposta.texto);

  const todosOsCanais = [ladoA.canais.controle, ladoA.canais.dados, ladoB.canais.controle, ladoB.canais.dados];
  await comPrazo(Promise.all(todosOsCanais.map(aguardarAbertura)), 15_000, 'abertura dos canais');
  const tempoAteAberturaMs = performance.now() - inicio;

  // Mensagens nos dois sentidos no "controle" e um bloco binário no "dados".
  const recebidaEmB = receberMensagem(ladoB.canais.controle);
  const recebidaEmA = receberMensagem(ladoA.canais.controle);
  const binarioEmB = receberMensagem(ladoB.canais.dados);
  ladoA.canais.controle.send(JSON.stringify({ tipo: 'mensagem-de-teste', texto: 'de A para B' }));
  ladoB.canais.controle.send(JSON.stringify({ tipo: 'mensagem-de-teste', texto: 'de B para A' }));
  ladoA.canais.dados.send(new Uint8Array([1, 2, 3, 4]).buffer);
  const [textoEmB, textoEmA, bytesEmB] = await comPrazo(
    Promise.all([recebidaEmB, recebidaEmA, binarioEmB]),
    5_000,
    'troca de mensagens',
  );

  const parA = await obterParSelecionado(ladoA.conexao);
  const parB = await obterParSelecionado(ladoB.conexao);

  const verificacoes = {
    canaisAbertos: todosOsCanais.every((canal) => canal.readyState === 'open'),
    controleDeAParaB: JSON.parse(textoEmB).texto === 'de A para B',
    controleDeBParaA: JSON.parse(textoEmA).texto === 'de B para A',
    dadosBinarios: bytesEmB instanceof ArrayBuffer && new Uint8Array(bytesEmB).join(',') === '1,2,3,4',
    parSelecionadoEmA: parA?.estado === 'succeeded',
    parSelecionadoEmB: parB?.estado === 'succeeded',
  };

  for (const lado of [ladoA, ladoB]) {
    lado.conexao.close();
  }

  return {
    aprovado: Object.values(verificacoes).every(Boolean),
    verificacoes,
    tempoAteAberturaMs: Math.round(tempoAteAberturaMs),
    coletaConcluida: { oferta: oferta.coletaConcluida, resposta: resposta.coletaConcluida },
    candidatosNaOferta: contarCandidatos(JSON.parse(oferta.texto).sdp),
    candidatosNaResposta: contarCandidatos(JSON.parse(resposta.texto).sdp),
    parSelecionado: { ladoA: parA, ladoB: parB },
    caminho: classificarCaminho(parA),
    navegador: navigator.userAgent,
  };
}

executarAutoteste()
  .catch((erro) => ({ aprovado: false, erro: erro.message }))
  .then((resultado) => {
    window.resultadoDoAutoteste = resultado;
    document.getElementById('resultado').textContent = JSON.stringify(resultado, null, 2);
  });
