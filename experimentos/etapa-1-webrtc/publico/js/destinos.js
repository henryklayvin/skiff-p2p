// Destinos de gravação dos arquivos recebidos ("DestinoDeRecebimento").
// P4: apenas o destino em Blob. OPFS e File System Access entram no P8.
//
// Interface comum:
//   adicionar(conteudo: Uint8Array): Promise<void>
//   finalizar(): Promise<Blob>
//   descartar(): Promise<void>

const TAMANHO_DO_LOTE = 4 * 1024 * 1024; // agrupa partes antes de compor o Blob

/**
 * Acumula os blocos em um Blob. As partes são agrupadas em lotes de 4 MiB e
 * incorporadas ao Blob, para não manter milhares de pequenos buffers na lista.
 * O navegador decide onde guardar o conteúdo do Blob (memória ou disco).
 */
export function criarDestinoEmBlob() {
  let blob = new Blob([]);
  let lote = [];
  let tamanhoDoLote = 0;

  const incorporarLote = () => {
    if (lote.length > 0) {
      blob = new Blob([blob, ...lote]);
      lote = [];
      tamanhoDoLote = 0;
    }
  };

  return {
    nome: 'blob',

    async adicionar(conteudo) {
      // Cada evento "message" entrega um ArrayBuffer novo, então a visão pode ser guardada sem cópia.
      lote.push(conteudo);
      tamanhoDoLote += conteudo.byteLength;
      if (tamanhoDoLote >= TAMANHO_DO_LOTE) {
        incorporarLote();
      }
    },

    async finalizar() {
      incorporarLote();
      // Tipo genérico: o arquivo nunca deve ser interpretado ou exibido pelo navegador.
      return new Blob([blob], { type: 'application/octet-stream' });
    },

    async descartar() {
      blob = new Blob([]);
      lote = [];
      tamanhoDoLote = 0;
    },
  };
}
