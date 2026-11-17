# 0007 — Pareamento e autorização

- **Status:** Aceito (valores numéricos dos limites sob validação)
- **Data:** 2026-11-17

## Contexto

Dois dispositivos sem conta precisam se encontrar de forma simples: digitar um código curto, e no futuro escanear um QR Code. Um código curto é fácil de digitar, mas **não é, por si só, um mecanismo de segurança suficiente**: ele pode ser adivinhado, observado ou repassado.

## Decisão

### Separação entre localizar e autorizar

| Elemento | Função |
|---|---|
| **Código de pareamento** | Apenas **localiza** a sessão |
| **Aprovação do criador** | Decide quem entra |
| **Token de sessão** | **Autoriza** o participante: WebSocket, reconexão, credenciais TURN |
| **Consentimento do destinatário** | Autoriza o recebimento de **cada arquivo** |

### Código de pareamento
- **8 caracteres** do alfabeto Crockford Base32, exibidos como `XXXX-XXXX`.
- A entrada é normalizada: aceita minúsculas, trata `O` como `0` e `I`/`L` como `1`, ignora hífens.
- Validade de **5 minutos** (valor inicial).
- Uso único: o código é consumido quando a entrada é aprovada.
- Recusa ou expiração de um pedido **invalida o código**. O criador pode gerar outro enquanto a sessão for válida.
- Códigos gerados não colidem com códigos ativos.
- Erro único para o usuário: "código inválido ou expirado".

### Sessão
- **Pareamento simétrico:** depois de pareados, qualquer participante pode enviar, e quem recebe consente.
- **No máximo dois participantes.**
- **Apenas um pedido de entrada pendente** por vez.
- **Antes do pareamento**, a sessão existe apenas enquanto houver um código válido. Se o código expirar ou for invalidado e o criador não gerar outro, a sessão é encerrada. Cada novo código gerado conta no limite de criação de sessões por IP.
- **Depois do pareamento**, a duração máxima é de **60 minutos**, contados a partir do **pareamento bem-sucedido** (valor inicial). A validade do código (5 minutos) é independente dessa duração.
- Qualquer participante pode encerrar a sessão. Encerrada ou expirada, a sessão é removida da memória.

### Token
- Pelo menos **128 bits** de entropia, gerado com `SecureRandom` e codificado em Base64url.
- Entregue somente após a aprovação (para o convidado) ou na criação (para o criador).
- Nunca em URLs nem em logs.
- Armazenado no navegador em **`sessionStorage`** (decisão inicial, sujeita a avaliação de segurança durante o desenvolvimento).
- Enviado explicitamente pelo código (corpo da requisição ou primeira mensagem do WebSocket), **nunca como cookie**.

### Limites de tentativas (valores iniciais, a calibrar)

| Nível | Regra |
|---|---|
| **Por IP** | Entrada com código: cerca de 10 tentativas por minuto e 30 falhas por hora. Criação de sessões: cerca de 20 por hora. Até cerca de 5 WebSockets simultâneos. Ao exceder: HTTP 429 com `Retry-After` |
| | IPv6 agrupado por prefixo `/64` |
| | IP do cliente lido de `X-Forwarded-For` somente quando a requisição vem de um proxy reverso confiável |
| | Limites mais tolerantes para operações bem-sucedidas e mais rígidos para falhas (CGNAT e redes compartilhadas) |
| **Por sessão** | Um pedido pendente por vez; recusa ou expiração do pedido invalida o código |
| | WebSocket com taxa e tamanho máximos de mensagem por conexão |
| **Global** | Teto de sessões ativas, com valor a definir. Hipótese inicial, **não validada**: ordem de 10.000 sessões |
| | Contador global de falhas: acima de um limiar, registra alerta e **endurece os limites por IP**, **sem bloquear todos os usuários** |

Biblioteca candidata para os limites: Bucket4j em memória. **Não aprovada para inclusão**: a inclusão exige justificativa e aprovação explícita na Etapa 3.

## Justificativa

- **8 em vez de 6 caracteres:** o cálculo usa os próprios limites desta decisão (detalhes no [modelo de ameaças](../seguranca/modelo-de-ameacas.md), seção 3.1).
  - Com 30 falhas por hora por IP, um atacante com 1.000 IPs faz no máximo 30.000 tentativas por hora.
  - Supondo 1.000 códigos válidos ao mesmo tempo (hipótese não validada), a chance de acertar algum código em uma hora é de cerca de 0,0027% com 8 caracteres, contra cerca de 2,8% com 6.
  - Em um dia de ataque contínuo: cerca de 0,065% contra cerca de 49%.
  - A aprovação manual não deve ser a única barreira, e o custo de digitar dois caracteres a mais é pequeno.
- **Aprovação e consentimento** fazem com que, mesmo acertando o código, um atacante não receba nada sem ação explícita do usuário.
- **Invalidar o código após recusa:** se alguém indesejado chegou até o código, ele está comprometido.
- **Mensagem de erro única:** não revela quais códigos existem ou existiram.
- **Endurecer em vez de bloquear globalmente:** um bloqueio global permitiria a um atacante negar o pareamento a todos os usuários.
- **Token fora de cookies:** elimina o CSRF clássico, que depende do envio automático de cookies. Os riscos que permanecem (principalmente XSS) estão no [modelo de ameaças](../seguranca/modelo-de-ameacas.md), seção 3.3.

## Consequências

- O criador precisa estar com a tela aberta para aprovar o pedido.
- Usuários atrás de CGNAT podem, raramente, atingir limites por IP. Os valores serão calibrados.
- A proteção contra XSS (CSP, proibição de `dangerouslySetInnerHTML`, download forçado) passa a ser também a proteção do token.
- Toda regra desta decisão precisa de teste automatizado (Etapa 3).

## Alternativas consideradas

- **Código de 6 caracteres:** mais fácil de digitar, mas com margem de segurança insuficiente contra ataques distribuídos.
- **Código como única credencial:** inseguro.
- **Token em cookie `HttpOnly`:** impediria a leitura por scripts, mas traria de volta o CSRF. Mesmo assim, um XSS ainda poderia agir em nome do usuário.
- **Token só em memória:** mais restrito, mas perde a sessão em qualquer recarga, inclusive as automáticas do iOS.
- **Bloqueio global sob ataque:** vetor de negação de serviço.
- **Papéis fixos (quem cria envia):** menos flexível, sem ganho de simplicidade relevante.

## Validação pendente

- Valores dos limites por IP e global, em uso real.
- Teto global de sessões ativas e número típico de códigos válidos simultâneos: hipóteses ainda não validadas.
- Avaliação contínua do armazenamento do token em `sessionStorage`.
- Pareamento por QR Code com token forte no fragmento da URL: futuro (v1.1).

## Revisões

- **2026-11-17 (revisão da Etapa 0, antes de qualquer implementação):**
  - a duração de 60 minutos passa a contar a partir do pareamento bem-sucedido;
  - o cálculo de segurança foi alinhado aos limites de tentativas;
  - o teto de 10.000 sessões ficou registrado como hipótese;
  - o Bucket4j ficou registrado como candidato sem aprovação.
