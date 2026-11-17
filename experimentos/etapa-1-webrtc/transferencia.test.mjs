// Testes unitários das partes puras da transferência: formato dos blocos e nomes de arquivo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAMANHO_DO_CABECALHO,
  conteudoPorBloco,
  gerarIdDeTransferencia,
  lerBloco,
  montarBloco,
} from './publico/js/protocolo-de-dados.js';
import { sanitizarNomeDeArquivo } from './publico/js/nomes.js';
import { formatarBytes } from './publico/js/metricas.js';
import { PARAMETROS_PADRAO } from './publico/js/parametros.js';

describe('protocolo do canal "dados"', () => {
  test('deveCaberCabecalhoEConteudoEm16KiB', () => {
    assert.equal(PARAMETROS_PADRAO.tamanhoDoBloco, 16 * 1024);
    assert.equal(conteudoPorBloco(PARAMETROS_PADRAO.tamanhoDoBloco), 16 * 1024 - TAMANHO_DO_CABECALHO);
  });

  test('deveMontarELerUmBlocoSemPerderDados', () => {
    const conteudo = new Uint8Array([0, 1, 2, 250, 255]);
    const mensagem = montarBloco({ idTransferencia: 0xfedcba98, indiceDoArquivo: 3, sequencia: 123456, conteudo });
    assert.equal(mensagem.byteLength, TAMANHO_DO_CABECALHO + conteudo.byteLength);

    const bloco = lerBloco(mensagem);
    assert.equal(bloco.versao, 1);
    assert.equal(bloco.idTransferencia, 0xfedcba98);
    assert.equal(bloco.indiceDoArquivo, 3);
    assert.equal(bloco.sequencia, 123456);
    assert.deepEqual([...bloco.conteudo], [...conteudo]);
  });

  test('deveAceitarBlocoComConteudoVazio', () => {
    const bloco = lerBloco(montarBloco({ idTransferencia: 1, indiceDoArquivo: 0, sequencia: 0, conteudo: new Uint8Array(0) }));
    assert.equal(bloco.conteudo.byteLength, 0);
  });

  test('deveRecusarMensagemMenorQueOCabecalho', () => {
    assert.throws(() => lerBloco(new ArrayBuffer(TAMANHO_DO_CABECALHO - 1)), /menor que o cabeçalho/);
  });

  test('deveRecusarMensagemQueNaoEhBinaria', () => {
    assert.throws(() => lerBloco('texto'), /não binário/);
  });

  test('deveRecusarVersaoDesconhecida', () => {
    const mensagem = montarBloco({ idTransferencia: 1, indiceDoArquivo: 0, sequencia: 0, conteudo: new Uint8Array(1) });
    new DataView(mensagem).setUint8(0, 9);
    assert.throws(() => lerBloco(mensagem), /versão 9/);
  });

  test('deveRecusarTamanhoDeBlocoQueNaoComportaConteudo', () => {
    assert.throws(() => conteudoPorBloco(TAMANHO_DO_CABECALHO), /inválido/);
  });

  test('deveGerarIdDeTransferenciaDe32Bits', () => {
    const id = gerarIdDeTransferencia();
    assert.ok(Number.isInteger(id) && id >= 0 && id <= 0xffffffff);
  });
});

describe('sanitizarNomeDeArquivo', () => {
  const casos = {
    'deveManterNomeComum': ['foto.jpg', 'foto.jpg'],
    'deveManterAcentos': ['relatório de ação.pdf', 'relatório de ação.pdf'],
    'deveTrocarSeparadoresDeCaminho': ['../../etc/passwd', 'etc_passwd'],
    'deveTrocarBarraInvertida': ['..\\..\\windows\\win.ini', 'windows_win.ini'],
    'deveRemoverControleDeDirecao': ['foto‮gnp.exe', 'fotognp.exe'],
    'deveRemoverCaracteresDeControle': ['ar\u0000qu\u0007ivo\n.txt', 'arquivo.txt'],
    'deveTrocarCaracteresReservadosDoWindows': ['a:b*c?d"e<f>g|h.txt', 'a_b_c_d_e_f_g_h.txt'],
    'deveRemoverPontosEEspacosNasPontas': ['  .oculto.txt. ', 'oculto.txt'],
    'deveProtegerNomeReservadoDoWindows': ['CON.txt', '_CON.txt'],
    'deveUsarNomePadraoQuandoFicarVazio': ['...', 'arquivo-recebido'],
    'deveUsarNomePadraoParaValorAusente': [undefined, 'arquivo-recebido'],
  };
  for (const [nomeDoTeste, [entrada, esperado]] of Object.entries(casos)) {
    test(nomeDoTeste, () => {
      assert.equal(sanitizarNomeDeArquivo(entrada), esperado);
    });
  }

  test('deveLimitarTamanhoPreservandoAExtensao', () => {
    const nome = sanitizarNomeDeArquivo(`${'a'.repeat(300)}.pdf`);
    assert.equal(nome.length, 200);
    assert.ok(nome.endsWith('.pdf'));
  });
});

describe('formatarBytes', () => {
  test('deveFormatarUnidadesBinarias', () => {
    assert.equal(formatarBytes(512), '512 B');
    assert.equal(formatarBytes(16 * 1024), '16.0 KiB');
    assert.equal(formatarBytes(1.5 * 1024 * 1024), '1.5 MiB');
    assert.equal(formatarBytes(1024 ** 3), '1.0 GiB');
  });

  test('deveExibirTracoParaValorInvalido', () => {
    assert.equal(formatarBytes(undefined), '—');
  });
});
