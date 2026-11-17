// Canal "controle": mensagens JSON pequenas, cada uma com um campo "tipo".
// Este módulo valida as mensagens recebidas e as entrega à função registrada para o tipo.

const TAMANHO_MAXIMO_DA_MENSAGEM = 64 * 1024; // caracteres

/**
 * @param {RTCDataChannel} canal
 * @param {(aviso: string) => void} [aoAvisar] chamado para mensagens inválidas ou sem destinatário
 */
export function criarCanalDeControle(canal, aoAvisar = () => {}) {
  const tratadores = new Map();

  canal.addEventListener('message', (evento) => {
    if (typeof evento.data !== 'string' || evento.data.length > TAMANHO_MAXIMO_DA_MENSAGEM) {
      aoAvisar('Mensagem descartada no "controle": formato ou tamanho inválido');
      return;
    }
    let mensagem;
    try {
      mensagem = JSON.parse(evento.data);
    } catch {
      aoAvisar('Mensagem descartada no "controle": JSON inválido');
      return;
    }
    const tratador = typeof mensagem?.tipo === 'string' ? tratadores.get(mensagem.tipo) : undefined;
    if (!tratador) {
      aoAvisar(`Mensagem descartada no "controle": tipo desconhecido "${String(mensagem?.tipo).slice(0, 40)}"`);
      return;
    }
    tratador(mensagem);
  });

  return {
    canal,
    /** Registra a função que trata as mensagens de um tipo. */
    aoReceber(tipo, tratador) {
      tratadores.set(tipo, tratador);
    },
    /** Envia uma mensagem; retorna false se o canal não estiver aberto. */
    enviar(mensagem) {
      if (canal.readyState !== 'open') {
        return false;
      }
      canal.send(JSON.stringify(mensagem));
      return true;
    },
  };
}
