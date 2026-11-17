// Sanitização de nomes de arquivos recebidos (modelo de ameaças, seção 3.11).
// Função pura: também é testada no Node.

const TAMANHO_MAXIMO_DO_NOME = 200;
const NOME_PADRAO = 'arquivo-recebido';

// Caracteres de controle (C0, DEL e C1).
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;
// Controles de direção de texto (ex.: U+202E faz "fotoexe.pdf" parecer outro tipo) e marcas invisíveis.
const CONTROLES_DE_DIRECAO = /[​-‏‪-‮⁦-⁩﻿]/g;
// Separadores de caminho e caracteres reservados no Windows.
const CARACTERES_PROIBIDOS = /[\\/:*?"<>|]/g;
// Nomes reservados do Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9), com ou sem extensão.
const NOMES_RESERVADOS_DO_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Devolve um nome seguro para salvar o arquivo.
 * Remove caracteres de controle e de direção de texto, troca separadores de caminho
 * e caracteres reservados por "_", remove pontos e espaços nas pontas e limita o tamanho.
 */
export function sanitizarNomeDeArquivo(nomeOriginal) {
  let nome = String(nomeOriginal ?? '')
    .normalize('NFC')
    .replace(CARACTERES_DE_CONTROLE, '')
    .replace(CONTROLES_DE_DIRECAO, '')
    // Trechos de caminho: descarta "", "." e ".." e junta o restante com "_".
    .split(/[\\/]+/)
    .filter((trecho) => trecho !== '' && trecho !== '.' && trecho !== '..')
    .join('_')
    .replace(CARACTERES_PROIBIDOS, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '');

  if (NOMES_RESERVADOS_DO_WINDOWS.test(nome)) {
    nome = `_${nome}`;
  }

  if (nome.length > TAMANHO_MAXIMO_DO_NOME) {
    const ponto = nome.lastIndexOf('.');
    const extensao = ponto > 0 && nome.length - ponto <= 16 ? nome.slice(ponto) : '';
    nome = nome.slice(0, TAMANHO_MAXIMO_DO_NOME - extensao.length) + extensao;
  }

  return nome.length > 0 ? nome : NOME_PADRAO;
}
