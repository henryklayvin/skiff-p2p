# 0008 — Transferência e integridade

- **Status:** Aceito (parâmetros numéricos experimentais)
- **Data:** 2026-11-17

## Contexto

O Skiff P2P precisa transferir arquivos potencialmente grandes entre navegadores, inclusive em celulares, com:
- memória estável;
- progresso real;
- cancelamento pelos dois lados;
- garantia de que o arquivo recebido é idêntico ao enviado.

O `send()` do DataChannel apenas enfileira dados. Sem controle, o remetente pode esgotar a memória ou estourar o buffer do navegador.

## Decisão

### Canais
Dois DataChannels confiáveis e ordenados:
- **`controle`**: mensagens JSON;
- **`dados`**: blocos binários, cada um com cabeçalho de identificação da transferência, do arquivo e do número de sequência.

### Blocos
- Tamanho inicial de **16 KiB** (**experimental**).
- O valor de `maxMessageSize` **não** é tratado como confirmação de suporte a intercalamento de mensagens no SCTP (RFC 8260).
- Aumentos só com medição e novo ADR.
- O arquivo é lido em partes e nunca é carregado inteiro na memória.

### Confirmações (ACK) e contadores
- **Três contadores distintos:**
  - **bytes enviados** (entregues ao `send()`);
  - **bytes recebidos** (chegaram ao destinatário);
  - **bytes confirmados** (recebidos em sequência, gravados e incluídos no hash, informados ao remetente).
- O destinatário envia `confirmacao` a cada **1 MiB** ou **250 ms**, o que ocorrer primeiro (**experimental**).
- O progresso exibido ao remetente usa os **bytes confirmados**.
- A falta de avanço das confirmações por um prazo (a definir) gera falha com mensagem clara.

### Controle de fluxo
- **Local:** pausa quando `bufferedAmount` ultrapassa uma marca alta e retomada no evento `bufferedamountlow`. Limiares a definir no experimento.
- **Ponta a ponta:** janela de no máximo **8 MiB** enviados e ainda não confirmados (**experimental**).

### Integridade
- **SHA-256 incremental** por arquivo, calculado na origem durante a leitura e no destino durante a gravação.
- Biblioteca candidata: `hash-wasm`. **Não aprovada para inclusão**: o uso, inclusive no experimento técnico, exige justificativa e aprovação explícita.
- Um arquivo só é **concluído após a validação do hash** (`arquivo-verificado`).
- Arquivos não verificados nunca são oferecidos para download.

### Consentimento
- O remetente oferece a lista de arquivos (nome, tamanho, tipo).
- O destinatário vê a **lista completa** e aceita ou recusa **cada arquivo**.
- A opção **"Aceitar todos os arquivos"** é permitida, desde que:
  - fique disponível só depois da exibição da lista completa;
  - exija confirmação explícita.
- **Arquivos adicionados depois** de uma oferta exigem nova oferta e novo consentimento.
- Somente arquivos aceitos são transmitidos.

### Cancelamento em dois momentos
1. **Encerramento local:** a leitura para, nenhum bloco novo é entregue ao `send()` e os recursos locais são liberados.
2. **Confirmação remota:**
   - o outro lado descarta os dados parciais e responde `cancelamento-confirmado`;
   - sem resposta no prazo (a definir), ou com queda do canal, o estado vira "cancelado sem confirmação do outro dispositivo";
   - o destinatário também descarta os dados parciais quando detecta queda ou travamento;
   - um arquivo já verificado antes da chegada do pedido não é afetado.

### Segurança do conteúdo
- Nomes de arquivos sanitizados.
- Recebimento sempre por download, sem abertura nem pré-visualização automática.

### Limitações de plataforma
- Haverá limite de tamanho por plataforma, definido por testes e informado antes do início.
- A Screen Wake Lock API será usada para evitar que a tela apague **enquanto a página está visível**. Ela **não garante** transferência em segundo plano no iOS nem no Android.
- A página orienta o usuário a mantê-la aberta e trata a suspensão como falha controlada.

### Em aberto
- **Destino dos arquivos recebidos:** Blob em memória, OPFS ou File System Access API, atrás de uma interface `DestinoDeRecebimento` com implementações trocáveis. Decisão após o experimento técnico (Etapa 1).

## Justificativa

- **Blocos pequenos:**
  - sem intercalamento, uma mensagem grande ocupa a associação SCTP e atrasa as mensagens de controle;
  - 16 KiB é um tamanho historicamente interoperável entre navegadores.
- **Dois canais:** reduzem a espera das mensagens de controle atrás dos dados (sem garantir prioridade).
- **ACK explícito:** `bufferedAmount` só informa o que saiu da fila local, não o que o outro lado recebeu e gravou. Só a confirmação permite progresso real, janela ponta a ponta, conclusão confiável e, no futuro, retomada.
- **Dois níveis de controle de fluxo:** o local protege a memória do remetente; a janela protege um destinatário lento.
- **Hash de aplicação, além do DTLS:** o DTLS protege o trânsito; o hash detecta erros de remontagem e gravação do próprio Skiff.
- **Cancelamento em dois momentos:** o encerramento local pode ser imediato, mas a confirmação depende da rede e da fila. Prometer um prazo fixo seria incorreto.

## Consequências

- O protocolo de transferência precisa de especificação própria, testes do núcleo com DataChannel simulado e versionamento.
- Os parâmetros devem ser configuráveis e centralizados para facilitar a calibração.
- A Web Crypto API não oferece hash incremental, o que torna necessária uma biblioteca adicional (candidata `hash-wasm`, ainda sem aprovação).
- Arquivos muito grandes podem ficar indisponíveis em algumas plataformas até que o destino em fluxo (OPFS ou File System Access) seja viável.

## Alternativas consideradas

- **Blocos maiores (ex.: 64 KiB ou mais) com base em `maxMessageSize`:** maior risco de atrasar o canal de controle sem intercalamento. Só com medição.
- **Um único canal para controle e dados:** cancelamentos e confirmações ficariam atrás dos dados enfileirados.
- **Progresso baseado em bytes enviados:** mostraria 100% antes de o destinatário ter recebido tudo.
- **Hash do arquivo inteiro com `crypto.subtle.digest`:** exigiria o arquivo inteiro na memória.
- **Confiar só no DTLS:** não detecta erros da aplicação.

## Validação pendente (experimento técnico e etapas 8 a 10)

- Tamanho de bloco, frequência de confirmação e janela.
- Limiares de `bufferedAmount`, prazos de travamento e de confirmação de cancelamento.
- Estratégia de destino e limites por plataforma.
- Desempenho do hash incremental.
- Comportamento da Wake Lock e do segundo plano por plataforma.

## Revisões

- **2026-11-17 (revisão da Etapa 0, antes de qualquer implementação):**
  - regra de "Aceitar todos os arquivos" e de novo consentimento para arquivos adicionados;
  - `hash-wasm` registrada como candidata sem aprovação.
