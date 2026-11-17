# 0005 — WebRTC e utilização de TURN

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O objetivo central do Skiff P2P é transferir arquivos **sem que o servidor de aplicação os receba ou armazene**. Os dispositivos estão, em geral, atrás de NAT. Em redes móveis, isso costuma ser CGNAT. Em parte das redes, a conexão direta entre dois dispositivos é impossível.

## Decisão

1. **A transferência usa WebRTC DataChannel**, diretamente entre os navegadores. O servidor de aplicação **nunca** recebe, retransmite ou armazena bytes de arquivos.
2. **O ICE escolhe o caminho**, usando:
   - **STUN**, para descobrir o endereço público;
   - **TURN**, como retransmissão quando a conexão direta falha.
3. **coturn** atende STUN e TURN.
4. **O TURN só aceita credenciais temporárias**, emitidas pelo backend apenas a participantes autenticados de uma sessão:
   - mecanismo de segredo compartilhado do coturn (`use-auth-secret`);
   - o usuário contém a data de expiração;
   - a senha é derivada por HMAC do usuário com o segredo;
   - a configuração ICE é obtida do backend (`/api/ice/configuracao`, nome preliminar), e não fixada no frontend.
5. **O TURN bloqueia retransmissão** para faixas de IP privadas, de loopback e *link-local* (`denied-peer-ip`) e terá cotas de uso.
6. **O segredo compartilhado** vem de variável de ambiente e nunca é versionado.
7. **A interface indica** se a conexão é direta ou retransmitida.
8. **O *ICE restart* automático** fica planejado para versão futura. O canal de sinalização já permanece aberto para permiti-lo ([ADR 0004](0004-comunicacao-por-websocket.md)).

### Modelo de confiança

| Caminho | Conteúdo dos arquivos | Metadados |
|---|---|---|
| Direto | Só nos dois dispositivos | O backend vê dados da sinalização (IPs, horários) |
| Via TURN | Passa **cifrado** (DTLS) pelo TURN, que não consegue lê-lo nem o armazena | O TURN vê IPs, horários e volume |

O servidor de sinalização é um **ponto de confiança**: ele repassa as *fingerprints* DTLS e, se comprometido, poderia tentar interceptar a conexão. Esse risco está aceito no MVP, e a verificação SAS está planejada para o futuro ([modelo de ameaças](../seguranca/modelo-de-ameacas.md), seção 3.7).

## Justificativa

- **DataChannel:** a criptografia DTLS é obrigatória e não pode ser desligada, e a API está disponível nos navegadores atuais, inclusive móveis.
- **Sem TURN, parte dos usuários simplesmente não conseguiria se conectar**, especialmente em redes móveis e corporativas.
- **Credenciais temporárias e bloqueio de IPs internos** são as proteções essenciais contra o uso do TURN como proxy aberto e contra acesso à rede interna.
- **coturn** é open source, maduro e suporta o mecanismo de credenciais temporárias sem banco de dados.

## Consequências

- A documentação e a interface **não podem afirmar** que os bytes nunca passam por servidores. Quando há retransmissão, eles passam pelo TURN, cifrados e sem armazenamento.
- O TURN tem **custo de banda** proporcional ao volume retransmitido e exige IP público e portas UDP abertas. Por isso a disponibilização pública requer uma VPS.
- O WebRTC exige contexto seguro (HTTPS ou `localhost`), inclusive para testes em celulares durante o desenvolvimento.
- O outro participante vê o IP público do dispositivo. O modo "somente retransmissão" está planejado para o futuro.

## Alternativas consideradas

- **Upload para o servidor e download pelo outro dispositivo:** contraria o princípio central do produto e exigiria armazenamento.
- **Só STUN, sem TURN:** mais barato, mas deixaria parte dos usuários sem conexão.
- **TURN com credenciais fixas:** fácil de vazar e de abusar.
- **Serviços de TURN gerenciados de terceiros:** possíveis no futuro, mas acrescentam dependência externa e um terceiro que observa metadados. O coturn próprio mantém o controle.

## Validação pendente

- Opções de cota do coturn e sua configuração (Etapa 7).
- **STUN no desenvolvimento (decidido em 2026-11-17):**
  - o primeiro teste do experimento técnico (Etapa 1) usa um STUN público;
  - em seguida, o experimento passa ao coturn próprio, local em Docker, incluindo teste com retransmissão TURN forçada;
  - o STUN público é aceitável só nesses testes iniciais, entre dispositivos do próprio desenvolvedor, porque ele vê os IPs consultados;
  - a disponibilização pública usará coturn próprio.
- Proporção de conexões que precisam de TURN em redes móveis reais (observação qualitativa nos testes).
