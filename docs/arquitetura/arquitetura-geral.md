# Arquitetura geral

Este documento descreve os componentes do Skiff P2P, suas responsabilidades e como eles se comunicam. As justificativas de cada decisão estão nos [ADRs](../adr/README.md).

> **Convenção deste documento**
> - **Valor inicial experimental**: parâmetro que será calibrado no experimento técnico (Etapa 1) ou nas etapas seguintes. Não é definitivo.
> - **Nome preliminar**: endpoint ou mensagem cujo nome pode mudar até a especificação do protocolo na etapa correspondente.

## 1. Visão geral

```
              ┌─────────────────────────────────────────────┐
              │      Servidor de aplicação Skiff            │
              │      (Java 21 + Spring Boot)                │
              │                                             │
              │  REST: sessões e configuração ICE           │
              │  WebSocket: sinalização                     │
              │  Estado em memória com expiração            │
              │  NUNCA recebe bytes de arquivos             │
              └──────▲───────────────────────────▲──────────┘
         HTTPS/WSS   │                           │   HTTPS/WSS
                     │                           │
┌────────────────────┴───┐                  ┌────┴───────────────────┐
│ Dispositivo A          │                  │ Dispositivo B          │
│ Navegador + frontend   │════ WebRTC ═════▶│ Navegador + frontend   │
│                        │  DataChannels    │                        │
└──────────┬─────────────┘  (cifrado DTLS)  └──────────┬─────────────┘
           │                                           │
           │    ┌──────────┐         ┌──────────────┐  │
           └───▶│   STUN   │         │     TURN     │◀─┘
                │ descobre │         │ retransmite  │
                │ IP       │         │ quando não há│
                │ público  │         │ caminho      │
                └──────────┘         │ direto       │
                    (coturn: mesmo   └──────────────┘
                     serviço para STUN e TURN)
```

Há **três caminhos de comunicação** distintos:

| Caminho | Entre | Protocolo | O que trafega |
|---|---|---|---|
| Controle | Navegador ↔ backend | HTTPS (REST) | Criação e entrada em sessões, configuração ICE |
| Sinalização | Navegador ↔ backend ↔ navegador | WSS (WebSocket) | Mensagens pequenas de coordenação (SDP, candidatos ICE, presença) |
| Dados | Navegador ↔ navegador (direto ou via TURN) | WebRTC DataChannel (SCTP sobre DTLS) | Mensagens de controle da transferência e blocos dos arquivos |

## 2. Componentes e responsabilidades

### 2.1 Frontend (navegador)

Aplicação React + TypeScript + Vite, organizada em duas partes.

**Interface** (`aplicacao/`, `funcionalidades/`, `compartilhado/`): telas de criar sessão, entrar com código, aprovar pedido, escolher arquivos, aceitar recebimento, acompanhar progresso e cancelar. Estilos com CSS Modules.

**Núcleo** (`nucleo/`), em TypeScript puro e **sem React**:
- `nucleo/sinalizacao/`: cliente WebSocket, autenticação, pulsação e reconexão; tipos das mensagens de sinalização.
- `nucleo/webrtc/`: criação da `RTCPeerConnection`, dos DataChannels e troca de SDP e candidatos.
- `nucleo/transferencia/`: divisão em blocos, controle de fluxo, confirmações (ACK), hash SHA-256, cancelamento, sanitização de nomes e destino de gravação dos arquivos recebidos.

A interface só consome estados e eventos do núcleo. Isso permite testar o núcleo sem navegador e reaproveitá-lo no futuro.

### 2.2 Backend (Spring Boot)

O backend é um **monólito modular**: um único serviço, com pacotes separados por funcionalidade sob `io.github.henryklayvin.skiff`.

| Pacote | Responsabilidade |
|---|---|
| `pareamento` | Criar sessões, gerar códigos e tokens, controlar expiração, registrar pedidos de entrada, aprovação e recusa, encerramento e limpeza |
| `sinalizacao` | Manipulador WebSocket: autenticação pela primeira mensagem, validação das mensagens, repasse entre os dois participantes da mesma sessão, pulsação e presença |
| `ice` | Montar a configuração ICE (STUN/TURN) e emitir credenciais temporárias do TURN |
| `seguranca` | Limites de tentativas, verificação de `Origin`, cabeçalhos de segurança, obtenção correta do IP do cliente |
| `compartilhado` | Erros, configuração de parâmetros, `Clock` e utilitários comuns |

O que o backend **não faz**:
- não recebe, não retransmite e não armazena bytes de arquivos;
- não persiste nada em disco;
- não mantém contas de usuário.

### 2.3 coturn (STUN e TURN)

Servidor open source executado em Docker:
- **STUN:** informa a cada dispositivo seu endereço público visto de fora. Com isso, os dois lados tentam se conectar diretamente através dos NATs.
- **TURN:** quando a conexão direta falha, retransmite os pacotes entre os dois dispositivos.
  - Os pacotes continuam cifrados por DTLS entre os navegadores, e o TURN não consegue ler o conteúdo.
  - O TURN observa metadados (IPs, horários, volume).
  - O TURN só aceita **credenciais temporárias** emitidas pelo backend.

### 2.4 Por que STUN e TURN são necessários

A maioria dos dispositivos está atrás de **NAT**: o roteador doméstico ou a operadora móvel, que costuma usar **CGNAT**. O dispositivo tem um IP privado que não é alcançável de fora.

O **ICE** é o procedimento do WebRTC que reúne os caminhos possíveis (**candidatos**) e testa cada combinação até encontrar uma que funcione:
- o IP local;
- o endereço público descoberto via STUN;
- o endereço de retransmissão no TURN.

Em redes móveis e corporativas, a retransmissão pelo TURN é necessária com mais frequência.

## 3. Sessão de pareamento

### 3.1 Estados

```
                criar sessão
                     │
                     ▼
            ┌──────────────────┐  código expira ou é
            │ AGUARDANDO_PAR   │  invalidado, e o criador
            └──────────────────┘  não gera outro
               ▲     │ alguém informa o código ──────┐
       recusa  │     ▼                               │
   (código     │ ┌──────────────────┐                │
   invalidado; └─│ PEDIDO_PENDENTE  │                │
   criador pode  └──────────────────┘                │
   gerar outro)      │ criador aprova                │
                     ▼                               │
            ┌──────────────────┐                     │
            │ PAREADA          │ início da contagem  │
            └──────────────────┘ dos 60 minutos      │
                     │ saída, duração máxima, ou     │
                     │ desconexão além da tolerância │
                     ▼                               ▼
            ┌──────────────────────────────────────────┐
            │ ENCERRADA (estado removido da memória)   │
            └──────────────────────────────────────────┘
```

### 3.2 Regras

| Regra | Valor |
|---|---|
| Formato do código | 8 caracteres do alfabeto Crockford Base32, exibidos como `XXXX-XXXX` |
| Normalização da entrada | Aceita minúsculas, trata `O` como `0` e `I`/`L` como `1`, ignora hífens |
| Validade do código | 5 minutos (**valor inicial**) |
| Uso do código | Único: consumido na aprovação |
| Recusa ou expiração de um pedido | Invalida o código; o criador pode gerar outro |
| Pedidos pendentes simultâneos | 1 por sessão |
| Sessão antes do pareamento | Existe só enquanto houver código válido. Cada novo código conta no limite de criação de sessões por IP |
| Duração máxima da sessão | 60 minutos contados a partir do **pareamento bem-sucedido** (**valor inicial**), independente da validade do código |
| Participantes | Exatamente 2 |
| Token de sessão | Pelo menos 128 bits de entropia, gerado com `SecureRandom`, entregue a cada participante |
| Armazenamento do token no navegador | `sessionStorage` (inicial, sujeito a avaliação de segurança) |
| Mensagem de erro de código | Única: "código inválido ou expirado" |

O código **apenas localiza** a sessão. Quem autoriza a participação é o token, emitido somente após a aprovação do criador. Os limites de tentativas estão no [ADR 0007](../adr/0007-pareamento-e-autorizacao.md) e no [modelo de ameaças](../seguranca/modelo-de-ameacas.md).

## 4. Fluxo de pareamento e conexão

```
 A (criador)                    Backend                        B (convidado)
     │ POST /api/sessoes             │                                  │
     │──────────────────────────────▶│ cria sessão, código, token de A  │
     │◀──── código, token, validade ─│                                  │
     │ WS + {autenticar, token}      │                                  │
     │══════════════════════════════▶│                                  │
     │                               │◀── POST /api/sessoes/entrada ────│
     │◀═ {pedido-de-entrada} ════════│    (limites; código válido?)     │
     │ {aprovar-entrada} ═══════════▶│ consome código, gera token de B  │
     │                               │──────── token de B ─────────────▶│
     │                               │◀════ WS + {autenticar, token} ═══│
     │◀═ {par-pronto} ═══════════════│═══════════════ {par-pronto} ════▶│
     │ GET /api/ice/configuracao     │      GET /api/ice/configuracao   │
     │ cria RTCPeerConnection        │                                  │
     │ e DataChannels                │                                  │
     │ {oferta-sdp} ════════════════▶│══════════════ {oferta-sdp} ═════▶│
     │◀═ {resposta-sdp} ═════════════│◀═════════════ {resposta-sdp} ════│
     │ {candidato-ice} ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ │⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ {candidato-ice} │
     │                                                                  │
     │◀══════ DataChannels "controle" e "dados" abertos ═══════════════▶│
     │        (diretos ou via TURN)                                     │
     │◀═ WebSocket continua aberto: pulso, presença, encerramento ═════▶│
```

Endpoints e mensagens são **nomes preliminares**. A especificação completa do protocolo de sinalização será escrita na Etapa 4 (`docs/protocolo/`).

**Decisões que valem para o fluxo:**
- **Autenticação pela primeira mensagem.** A API de WebSocket do navegador não permite enviar cabeçalhos personalizados, e o token não pode ir na URL, porque ficaria registrado em logs.
- **Validação de `Origin`** no *handshake* do WebSocket.
- **Repasse restrito.** O backend só repassa mensagens de tipos permitidos, dentro do tamanho máximo, entre os dois participantes da mesma sessão.
- **Somente o criador gera ofertas SDP**, inclusive em renegociações futuras. Isso evita que os dois lados enviem ofertas ao mesmo tempo.
- **O WebSocket permanece aberto durante a sessão**, para:
  - pulsação (`pulso`) contra o encerramento de conexões ociosas por proxies e NATs;
  - detecção de saída do outro participante;
  - encerramento controlado;
  - renegociação (o *ICE restart* automático está planejado para versão futura).
- **Reconexão.** Se o WebSocket cair, o cliente reconecta com espera crescente, usando o mesmo token enquanto a sessão for válida. Há **uma conexão ativa por participante**: uma nova conexão substitui a anterior.

## 5. Protocolo de transferência

### 5.1 Canais

Dois DataChannels confiáveis e ordenados, na mesma `RTCPeerConnection`:

| Canal | Conteúdo |
|---|---|
| `controle` | Mensagens JSON: oferta de arquivos, consentimento, confirmações, hash, cancelamento, erros |
| `dados` | Mensagens binárias: blocos dos arquivos, cada um com um cabeçalho de identificação da transferência, do arquivo e do número de sequência |

A separação **reduz**, mas **não garante**, que mensagens de controle esperem atrás de dados já enfileirados. A latência real será medida no experimento técnico.

### 5.2 Mensagens (nomes preliminares)

| Mensagem | Direção | Função |
|---|---|---|
| `oferta-transferencia` | Remetente → destinatário | Lista os arquivos (identificador, nome, tamanho, tipo) |
| `aceitar-transferencia` / `recusar-transferencia` | Destinatário → remetente | Consentimento **por arquivo**. Somente arquivos aceitos são transmitidos (regras abaixo) |
| `confirmacao` | Destinatário → remetente | ACK com os bytes confirmados de um arquivo |
| `arquivo-concluido` | Remetente → destinatário | Fim do envio de um arquivo, com o hash SHA-256 calculado na origem |
| `arquivo-verificado` / `arquivo-falhou` | Destinatário → remetente | Resultado da comparação do hash |
| `cancelar-transferencia` | Qualquer lado | Pedido de cancelamento |
| `cancelamento-confirmado` | Lado que recebeu o pedido | Confirmação do cancelamento |
| `transferencia-concluida` | Remetente → destinatário | Fim de todos os arquivos aceitos |

**Regras de consentimento:**
- O destinatário vê a **lista completa** da oferta (nome, tamanho e tipo de cada arquivo) antes de decidir.
- Ele pode aceitar ou recusar cada arquivo individualmente, ou usar **"Aceitar todos os arquivos"**. Essa opção só fica disponível depois da exibição da lista completa e exige confirmação explícita.
- Arquivos adicionados depois de uma oferta **não** entram no consentimento já dado: exigem uma nova oferta e um novo consentimento.

### 5.3 Blocos

- Tamanho: **16 KiB** (**valor inicial experimental**).
- O arquivo é lido em partes (`Blob.slice()` ou `Blob.stream()`) e nunca é carregado inteiro na memória do remetente.
- O valor de `maxMessageSize` informado pelo outro lado **não** é tratado como confirmação de suporte a *intercalamento* de mensagens no SCTP (RFC 8260). Sem intercalamento, uma mensagem grande ocupa a associação SCTP até terminar e atrasa até o canal `controle`. Blocos pequenos limitam esse atraso.
- Qualquer aumento só acontece com medição e um novo ADR.

### 5.4 Confirmação (ACK) e contadores

| Contador | Medido em | Significado |
|---|---|---|
| `bytesEnviados` | Remetente | Entregues ao `send()` do DataChannel. **Não** significa que saíram do dispositivo: podem estar no buffer local (`bufferedAmount`) |
| `bytesRecebidos` | Destinatário | Chegaram pelo evento `message` |
| `bytesConfirmados` | Destinatário, informado ao remetente | Recebidos em sequência, gravados no destino e incluídos no cálculo do hash. Comunicados pela mensagem `confirmacao` |

- O destinatário envia `confirmacao` a cada **1 MiB** ou **250 ms**, o que ocorrer primeiro (**valores iniciais experimentais**).
- O progresso exibido ao remetente usa os bytes **confirmados**, e não os enviados.
- Se os bytes confirmados não avançarem por um prazo (a definir no experimento) com dados pendentes, a transferência falha com mensagem clara.
- Os bytes confirmados são a base para a retomada de transferências no futuro.

### 5.5 Controle de fluxo

Há dois níveis, ambos necessários:

1. **Local (`bufferedAmount`).** O `send()` não espera: apenas enfileira. O remetente pausa a leitura quando o buffer passa de uma marca alta e retoma no evento `bufferedamountlow`. Os limiares serão definidos no experimento. Os navegadores limitam o buffer de envio, e excedê-lo pode gerar erro ou fechar o canal.
2. **Ponta a ponta (janela).** No máximo **8 MiB** enviados e ainda não confirmados (**valor inicial experimental**). Isso protege um destinatário cuja gravação é mais lenta que a rede.

### 5.6 Integridade

- O DTLS já protege contra corrupção **em trânsito**. O hash de aplicação protege contra falhas **do próprio Skiff**: bloco perdido na remontagem, ordem errada, erro de gravação.
- SHA-256 calculado de forma **incremental**, bloco a bloco, na origem (durante a leitura) e no destino (durante a gravação).
- A Web Crypto API (`crypto.subtle.digest`) não oferece hash incremental, então será necessária uma biblioteca. A candidata é `hash-wasm`, **sem aprovação para inclusão**: o uso exige justificativa e aprovação explícita.
- Um arquivo só é considerado concluído após `arquivo-verificado`.

### 5.7 Cancelamento

O cancelamento acontece em dois momentos distintos:

1. **Encerramento local** (imediato, sob controle de quem cancela):
   - a leitura para;
   - nenhum bloco novo é entregue ao `send()`;
   - o estado muda para "cancelando";
   - os recursos locais são liberados.

   Blocos já enfileirados ainda podem ser enviados, e o destinatário os descarta pelo identificador da transferência.
2. **Confirmação remota** (depende da rede e da fila):
   - o outro lado interrompe, descarta os dados parciais e responde `cancelamento-confirmado`;
   - sem resposta dentro de um prazo (a definir no experimento), ou se o canal cair, o estado vira "cancelado sem confirmação do outro dispositivo";
   - o destinatário também descarta os dados parciais quando detecta queda ou travamento.

Se o destinatário já tiver verificado o arquivo quando o pedido chegar, o cancelamento não afeta aquele arquivo. O destinatário **nunca** oferece para download um arquivo cancelado ou não verificado.

### 5.8 Destino dos arquivos recebidos

A forma de gravar o arquivo recebido é o ponto **em aberto** mais importante, e será decidida pelo experimento técnico. O núcleo terá uma interface `DestinoDeRecebimento` com implementações trocáveis, escolhidas conforme o suporte do navegador:

| Estratégia | Observação |
|---|---|
| Blob em memória | Simples, mas limitado pela memória, especialmente no iOS |
| OPFS (*Origin Private File System*) | Grava em partes; o suporte varia por navegador e versão |
| File System Access API | Grava direto no disco; disponível só em navegadores Chromium de desktop |

Haverá um **limite de tamanho por plataforma**, definido por testes e comunicado ao usuário antes do início.

### 5.9 Segurança do conteúdo recebido

- O nome do arquivo é **sanitizado**: remoção de separadores de caminho (`../`), caracteres de controle e caracteres de inversão de direção de texto (ex.: U+202E).
- O arquivo é sempre oferecido como **download**. Nunca é aberto, renderizado ou pré-visualizado automaticamente.

## 6. Limitações de plataforma

- **iOS:** todos os navegadores usam o motor WebKit. A página pode ser suspensa em segundo plano, o que derruba o WebRTC e o WebSocket.
- **Wake Lock:** a Screen Wake Lock API só evita que a tela apague **enquanto a página está visível**, e é liberada quando a página fica oculta. Ela **não garante** transferência em segundo plano, nem no iOS nem no Android.
- **Resposta do produto:** aviso para manter a página aberta, detecção de `visibilitychange` e falha clara em vez de travamento.

## 7. Infraestrutura

| Ambiente | Composição |
|---|---|
| Desenvolvimento | Backend e frontend locais; coturn em Docker. HTTPS necessário para testar em celulares, porque o WebRTC exige contexto seguro (HTTPS ou `localhost`) |
| Disponibilização pública (futura) | VPS com IP público e portas UDP abertas (exigência do TURN), HTTPS, domínio próprio |

O backend roda como **uma única instância**, porque o estado das sessões fica em memória. Escalar horizontalmente exigiria estado compartilhado, o que só será considerado com necessidade comprovada (ver [ADR 0006](../adr/0006-ausencia-de-banco-de-dados-no-mvp.md)).

## 8. Organização prevista do código

```
backend/src/main/java/io/github/henryklayvin/skiff/
├── AplicacaoSkiff.java
├── pareamento/
├── sinalizacao/
├── ice/
├── seguranca/
└── compartilhado/

frontend/src/
├── aplicacao/
├── funcionalidades/
│   ├── pareamento/
│   └── transferencia/
├── nucleo/            # TypeScript puro, sem React
│   ├── sinalizacao/
│   ├── webrtc/
│   └── transferencia/
└── compartilhado/

infra/coturn/
```

## 9. Parâmetros iniciais

Todos os valores abaixo são configuráveis e centralizados no código. Os que estão marcados como experimentais serão calibrados por medições.

| Parâmetro | Valor inicial | Natureza |
|---|---|---|
| Tamanho do código de pareamento | 8 caracteres | Decisão (ADR 0007) |
| Validade do código | 5 min | Valor inicial |
| Duração máxima da sessão (após o pareamento) | 60 min | Valor inicial |
| Entropia do token | ≥ 128 bits | Requisito mínimo |
| Tamanho do bloco | 16 KiB | Experimental |
| Frequência de confirmação | 1 MiB ou 250 ms | Experimental |
| Janela de bytes não confirmados | 8 MiB | Experimental |
| Limiares de `bufferedAmount` | A definir | Experimental |
| Prazo para detectar travamento | A definir | Experimental |
| Prazo da confirmação de cancelamento | A definir | Experimental |
| Intervalo de pulsação do WebSocket | A definir (ordem de dezenas de segundos) | Experimental |
| Tolerância de desconexão da sessão | A definir | Experimental |
| Limites de tentativas | Ver ADR 0007 | Valores iniciais |
| Teto global de sessões ativas | A definir (hipótese não validada: ordem de 10.000) | Hipótese |

## 10. Glossário

- **NAT / CGNAT:** técnica que faz vários dispositivos compartilharem um IP público. No CGNAT, quem faz isso é a operadora, e muitos clientes compartilham o mesmo IP.
- **SDP:** texto que descreve as capacidades de conexão de um lado, incluindo a *fingerprint* do certificado DTLS.
- **Candidato ICE:** um endereço possível para alcançar um dispositivo.
- **DTLS:** versão do TLS para transporte sobre UDP. Cifra os DataChannels.
- **SCTP:** protocolo usado pelos DataChannels sobre DTLS. Oferece mensagens, canais múltiplos e entrega confiável.
- **ACK:** confirmação enviada por quem recebe.
- **Backpressure / controle de fluxo:** mecanismo para não produzir dados mais rápido do que podem ser consumidos.
