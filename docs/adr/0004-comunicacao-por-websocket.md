# 0004 — Comunicação por WebSocket

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

Para abrir uma conexão WebRTC, os dois navegadores precisam trocar **ofertas e respostas SDP** e **candidatos ICE**. O WebRTC não define como essa troca acontece: cabe à aplicação fornecer um canal de **sinalização**.

Esse canal precisa permitir que o servidor **avise** um dispositivo, em tempo real, que o outro enviou algo. Também é útil durante a sessão inteira:
- presença;
- encerramento;
- renegociação futura (*ICE restart*).

## Decisão

1. **WebSocket do Spring, sem STOMP e sem SockJS**, com um **protocolo JSON próprio e versionado**:
   - cada mensagem tem um campo `tipo`;
   - a versão do protocolo é informada na autenticação.
2. **Autenticação pela primeira mensagem** (`autenticar`, com o token da sessão), dentro de um prazo curto. Sem autenticação, a conexão é encerrada.
3. **Validação do cabeçalho `Origin`** no *handshake*, aceitando só as origens do Skiff.
4. **Validação de todas as mensagens:**
   - lista de tipos permitidos;
   - esquema;
   - tamanho máximo;
   - taxa máxima por conexão.
5. **Repasse restrito:** mensagens só vão para o outro participante da mesma sessão.
6. **O WebSocket permanece aberto durante toda a sessão**, com:
   - pulsação (`pulso`);
   - reconexão do cliente com espera crescente, usando o mesmo token enquanto a sessão for válida;
   - **uma conexão ativa por participante** (a nova substitui a anterior);
   - encerramento da sessão quando os participantes ficam desconectados além de uma tolerância.
7. **Somente o criador da sessão gera ofertas SDP**, inclusive em renegociações futuras.

Os nomes de mensagens usados na documentação (`autenticar`, `pedido-de-entrada`, `oferta-sdp`, `candidato-ice`, `pulso` etc.) são **preliminares**. A especificação completa será escrita na Etapa 4.

## Justificativa

- **WebSocket em vez de HTTP com consultas repetidas:** comunicação bidirecional imediata, sem desperdício de requisições.
- **Sem STOMP:** o STOMP é um protocolo de mensageria com destinos e assinaturas, pensado para *broadcast* e *brokers*. Aqui só há repasse entre dois participantes, e um protocolo próprio pequeno é mais simples, explícito e testável.
- **Sem SockJS:** é uma alternativa para navegadores sem WebSocket, cenário irrelevante para quem já precisa suportar WebRTC.
- **Autenticação pela primeira mensagem:** a API de WebSocket do navegador não permite cabeçalhos personalizados, e o token na URL acabaria em logs.
- **Validação de `Origin`:** os navegadores não aplicam CORS ao WebSocket. Sem essa checagem, páginas maliciosas poderiam abrir conexões (CSWSH).
- **Manter o WebSocket aberto:** a sinalização continua necessária depois da conexão inicial (renegociação, presença, encerramento). Fechar e reabrir aumentaria a complexidade e a latência.
- **Somente o criador oferta:** evita que os dois lados enviem ofertas ao mesmo tempo (*glare*), sem a complexidade do padrão *perfect negotiation*.

## Consequências

- O servidor mantém conexões abertas durante as sessões: até 5 minutos aguardando o pareamento, por código, e no máximo 60 minutos após o pareamento (valores iniciais). O custo é baixo com Spring MVC e *virtual threads* na carga prevista.
- É preciso implementar e testar pulsação, reconexão e substituição de conexões.
- Proxies reversos na disponibilização pública precisam estar configurados para WebSocket.
- O protocolo precisa de versionamento e documentação própria.

## Alternativas consideradas

- **STOMP sobre WebSocket:** abstração maior do que o problema.
- **SockJS:** desnecessário.
- **Server-Sent Events + REST:** comunicação só do servidor para o cliente; exigiria dois canais.
- **Fechar o WebSocket após abrir o DataChannel:** impediria renegociação e detecção de presença pelo servidor.
- **Token no cabeçalho `Sec-WebSocket-Protocol`:** contorno possível, mas usa o cabeçalho para algo diferente do seu propósito. A primeira mensagem é mais clara.

## Validação pendente

- Intervalo da pulsação e tolerância de desconexão: a definir por testes, principalmente em redes móveis.
- Prazo para a autenticação inicial.
