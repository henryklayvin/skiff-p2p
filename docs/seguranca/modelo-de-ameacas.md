# Modelo de ameaças

Este documento identifica o que precisa ser protegido no Skiff P2P, quem pode atacar, quais ameaças existem e como cada uma é tratada. Ele deve ser revisado ao final de cada etapa que altere pareamento, sinalização, TURN ou transferência.

**Status das mitigações**
- **Planejada (MVP):** será implementada e testada no MVP.
- **Futura:** prevista para depois do MVP.
- **Risco aceito:** conhecido e documentado; não será mitigado no MVP.
- **A validar:** depende do experimento técnico ou de testes em dispositivos.

## 1. Escopo e premissas

**Componentes:**
- frontend no navegador;
- backend Spring Boot (REST e WebSocket);
- coturn (STUN e TURN);
- canal WebRTC entre os dois dispositivos.

**Premissas de confiança:**
1. Os usuários confiam no **próprio navegador** e no **próprio dispositivo**. Malware no dispositivo está fora do escopo.
2. O conteúdo dos arquivos é protegido em trânsito pelo **DTLS** do WebRTC, cifrado entre os dois navegadores.
3. O **servidor de sinalização é um ponto de confiança.** Ele repassa as *fingerprints* DTLS. Se estiver comprometido, pode tentar se colocar no meio da conexão (seção 3.7).
4. O **TURN não é confiável para conteúdo**, e não precisa ser: ele só vê dados cifrados. Mas ele **vê metadados**.

## 2. Ativos

| Ativo | Por que importa |
|---|---|
| Conteúdo dos arquivos | Pode ser pessoal ou sensível |
| Tokens de sessão | Quem tem o token participa da sessão |
| Códigos de pareamento | Permitem pedir entrada numa sessão |
| Segredo compartilhado do TURN | Permite emitir credenciais TURN válidas |
| Endereços IP e metadados de conexão | Dados pessoais; revelam localização aproximada e hábitos |
| Disponibilidade do serviço e banda do TURN | O TURN tem custo de banda e pode ser abusado |

## 3. Ameaças e mitigações

### 3.1 Abuso do código de pareamento (força bruta)

**Ameaça.** Um atacante tenta adivinhar códigos para entrar em sessões alheias.

**Análise.** 8 caracteres em Base32 resultam em 32⁸ ≈ 1,1 trilhão de combinações (6 caracteres: 32⁶ ≈ 1,07 bilhão).

Enquanto o resultado for pequeno, a chance de acerto é aproximadamente:

> **P ≈ T × N ÷ 32^L**
> - T = tentativas do atacante;
> - N = códigos válidos ao mesmo tempo. Só contam sessões aguardando pareamento: códigos já consumidos não podem ser acertados;
> - L = tamanho do código.

O cálculo usa os **limites iniciais** do [ADR 0007](../adr/0007-pareamento-e-autorizacao.md):
- até 10 tentativas por minuto e **30 falhas por hora** por IP;
- quase todas as tentativas de um atacante são falhas, então o teto efetivo é de **30 tentativas por hora por IP**.

**Cenário ilustrativo:**
- 1.000 IPs distintos (ou prefixos IPv6 `/64` distintos);
- N = 1.000 códigos válidos simultâneos (hipótese não validada);
- T = 1.000 × 30 = **30.000 tentativas por hora**.

| Situação | 8 caracteres | 6 caracteres |
|---|---|---|
| Acertar **algum** código em 1 hora | ≈ 0,0027% | ≈ 2,8% |
| Acertar **algum** código em 1 dia de ataque contínuo | ≈ 0,065% | ≈ 49% |
| Acertar **um código específico** durante seus 5 min de validade (no máximo 30 tentativas por IP nesse intervalo) | ≈ 0,0000027% | ≈ 0,0028% |

**Leitura dos resultados:**
- A chance cresce **linearmente** com o número de IPs do atacante e com o número de códigos válidos. Com 10.000 IPs, os valores de 8 caracteres ficam 10 vezes maiores.
- O endurecimento sob ataque global (abaixo) reduz T, mas não foi incluído na conta, que é conservadora.
- A diferença entre 6 e 8 caracteres motivou a escolha de 8.

**Mitigações (planejadas, MVP):**
- O código só **localiza** a sessão. Acertá-lo gera apenas um **pedido** que o criador precisa **aprovar**.
- Validade curta, uso único, e invalidação do código após recusa ou expiração do pedido.
- Um pedido pendente por sessão.
- Mensagem de erro única ("código inválido ou expirado"), que não revela se o código existiu.
- **Limites de tentativas em três níveis** (valores iniciais no [ADR 0007](../adr/0007-pareamento-e-autorizacao.md)):
  - **Por IP:** tentativas por minuto e falhas por hora.
  - **Por sessão:** pedidos pendentes e invalidação após recusa.
  - **Global:** teto de sessões ativas e endurecimento dos limites por IP sob ataque, **sem bloqueio geral** (um bloqueio geral permitiria ao atacante negar o serviço a todos).

**Risco residual.** Um atacante que acerte um código pode se disfarçar com um nome de dispositivo convincente para obter aprovação.
- MVP (risco aceito): a interface orienta o usuário a aprovar apenas quando estiver conectando o próprio dispositivo ou o de alguém presente.
- Futura: a verificação SAS (seção 3.7) e o QR Code com token forte reduzem esse risco.

### 3.2 CGNAT e IPs compartilhados

**Ameaça (dupla).**
- **Falso positivo:** sob CGNAT, em universidades ou empresas, muitos usuários legítimos compartilham o mesmo IP e podem ser bloqueados injustamente pelo limite por IP.
- **Evasão:** atacantes com muitos IPs, ou com IPv6, que oferece milhões de endereços por usuário, escapam do limite por IP.

**Mitigações (planejadas, MVP):**
- Limites mais tolerantes para operações bem-sucedidas e mais rígidos para falhas.
- IPv6 agrupado por prefixo `/64`.
- O limite global e a aprovação manual cobrem a evasão.
- O IP do cliente só é lido de `X-Forwarded-For` quando a requisição vem de um proxy reverso confiável. Caso contrário, o atacante falsificaria o cabeçalho para escapar dos limites.

**A validar:** os valores dos limites, em uso real.

O CGNAT também afeta a **conectividade**: em redes móveis, a conexão direta falha com mais frequência e o TURN é mais usado (ver 3.6 e 3.8).

### 3.3 Roubo de token

**Ameaça.** Quem obtiver o token de um participante pode se passar por ele: reconectar o WebSocket ou obter credenciais TURN.

**Mitigações (planejadas, MVP):**
- Token com pelo menos 128 bits de entropia (`SecureRandom`), válido só durante a sessão (no máximo 60 minutos após o pareamento, valor inicial).
- Tráfego somente por HTTPS e WSS.
- Token **nunca** em URLs nem em logs.
- Uma conexão ativa por participante: a nova substitui a anterior, e o participante legítimo percebe a desconexão.

**Por que o `sessionStorage` (decisão inicial, sujeita a avaliação):**
- **O que protege:** o CSRF clássico depende de o navegador anexar **cookies automaticamente** a requisições vindas de outros sites. Como o token não é cookie e é enviado explicitamente pelo código (no corpo ou na primeira mensagem do WebSocket), um site malicioso não consegue fazer o navegador enviá-lo. Isso vale igualmente para token em memória. Não é o `sessionStorage` em si que protege.
- **Por que `sessionStorage` e não só memória:** o token sobrevive a recargas da página, inclusive às que o iOS faz sozinho por falta de memória, e permite reconectar à sessão.
- **Riscos que permanecem:**
  - **XSS:** qualquer script executado na origem do Skiff lê o `sessionStorage` (ver 3.4).
  - **Extensões** do navegador com acesso à página podem ler o token.
  - **Abas duplicadas** copiam o `sessionStorage`. Isso é tratado pela regra de uma conexão por participante.
  - **Endpoints sem token** (criar sessão, entrar com código) continuam chamáveis a partir de outros sites. Mitigações: exigir `Content-Type: application/json` (força pré-verificação CORS), validar `Origin`, CORS restrito e limites de tentativas.

### 3.4 XSS (*Cross-Site Scripting*)

**Ameaça.** Injetar script na página do Skiff, por exemplo por meio de um nome de arquivo ou de dispositivo malicioso, para roubar o token ou agir em nome do usuário.

**Mitigações (planejadas, MVP):**
- O React escapa textos por padrão. `dangerouslySetInnerHTML` é proibido.
- Content-Security-Policy restritiva, sem scripts inline nem origens externas desnecessárias.
- Arquivos recebidos **nunca** são abertos, renderizados ou pré-visualizados na origem do Skiff. Um arquivo `.html` aberto nessa origem executaria scripts com acesso ao token. O recebimento é sempre por download.
- Poucas dependências no frontend, monitoradas quanto a vulnerabilidades.

### 3.5 CSWSH (*Cross-Site WebSocket Hijacking*)

**Ameaça.** Os navegadores não aplicam CORS ao WebSocket. Uma página maliciosa pode abrir uma conexão WebSocket com o backend do Skiff a partir do navegador da vítima.

**Mitigações (planejadas, MVP):**
- Validação do cabeçalho `Origin` no *handshake*, aceitando apenas as origens do Skiff.
- Autenticação pela primeira mensagem com o token: a página maliciosa não conhece o token.
- Conexões que não se autenticam dentro de um prazo curto são encerradas.

### 3.6 Credenciais TURN e abuso do TURN

**Ameaças:**
- **Proxy gratuito:** um TURN aberto ou com credenciais fixas pode ser usado por terceiros para retransmitir tráfego qualquer, gerando custo e risco legal.
- **Acesso à rede interna (SSRF):** um cliente pede ao TURN que retransmita dados para endereços internos da infraestrutura (faixas privadas, loopback, metadados da nuvem).
- **Vazamento do segredo compartilhado.**

**Mitigações (planejadas, MVP):**
- O TURN nunca funciona sem autenticação.
- Credenciais **temporárias**, emitidas pelo backend somente para participantes autenticados de uma sessão. O mecanismo é o de segredo compartilhado do coturn: usuário com data de expiração e senha derivada por HMAC.
- Bloqueio de retransmissão para faixas privadas, de loopback e *link-local* (`denied-peer-ip` no coturn), com teste.
- Cotas de banda e de alocações no coturn (opções a validar na Etapa 7).
- Segredo em variável de ambiente, nunca versionado, com procedimento de rotação documentado antes da disponibilização pública.

### 3.7 Servidor de sinalização comprometido

**Ameaça.** Se o backend for comprometido, ou operado de má-fé, ele pode substituir as *fingerprints* DTLS no SDP e se colocar no meio da conexão (*man-in-the-middle*). Com isso, conseguiria ler os arquivos.

**Situação:**
- **Risco aceito no MVP.** O risco é inerente a sistemas WebRTC com sinalização centralizada e fica documentado aqui.
- **Futura:** verificação SAS. Os dois aparelhos exibem um código curto derivado das *fingerprints* DTLS, e o usuário confere se são iguais. Se houver interceptação, os códigos diferem.

### 3.8 Exposição de IPs

**Ameaças:**
- O WebRTC revela ao **outro participante** o IP público do dispositivo, por meio dos candidatos ICE. Os navegadores modernos escondem o IP local usando endereços mDNS, mas o IP público continua visível.
- O backend e o TURN conhecem o IP dos participantes.

**Situação:**
- **Risco aceito no MVP**, documentado para o usuário. O pareamento exige aprovação, então o outro participante é alguém que o usuário aceitou.
- **Futura:** modo "somente retransmissão", que força tudo pelo TURN (`iceTransportPolicy: "relay"`). Cada participante passa a ver apenas o endereço do TURN, com custo maior de banda.

### 3.9 Metadados de conexão

**Ameaça.** Mesmo sem acesso ao conteúdo, os servidores observam metadados:
- o **backend** vê IPs, horários, duração das sessões, *user agent* e o nome do dispositivo derivado dele;
- o **TURN** vê IPs, horários e volume de dados retransmitidos.

A sinalização também carrega informações sensíveis: o SDP e os candidatos ICE contêm endereços IP.

**Mitigações (planejadas, MVP):**
- **Nunca registrar em logs:** tokens, códigos, SDP, candidatos ICE, nomes de arquivos e conteúdo de mensagens de sinalização.
- Logs mínimos, com retenção curta e definida.
- O estado das sessões fica só em memória e é removido ao encerrar.
- Nenhum analytics ou serviço de terceiros que receba dados de usuários.
- Os nomes, tamanhos e tipos dos arquivos trafegam só pelo DataChannel. O backend não os recebe.

### 3.10 Privacidade e LGPD

- Endereços IP e *user agents* podem ser considerados **dados pessoais** pela LGPD.
- Princípios aplicados: **minimização** (coletar só o necessário para operar e proteger o serviço), **finalidade** (usar só para estabelecer conexões e prevenir abuso) e **retenção limitada**.
- **Antes da disponibilização pública:** publicar uma política de privacidade que explique a diferença entre conexão direta e retransmissão pelo TURN, quais metadados são tratados, por quanto tempo e com qual finalidade. A definição da base legal e da redação final deve ser feita com cuidado e, idealmente, revisada por alguém com conhecimento jurídico.
- O Skiff não deve afirmar que "os dados nunca passam por servidores". O correto é: os arquivos **não são armazenados** e, quando há retransmissão, **passam cifrados pelo TURN**.

### 3.11 Arquivos maliciosos

**Ameaças:**
- Envio de executáveis ou documentos maliciosos.
- Nomes de arquivo enganosos:
  - `foto.jpg.exe`;
  - inversão de direção de texto com U+202E, que faz `fotoexe.pdf` parecer outro tipo;
  - tentativas de caminho como `../../`.

**Mitigações (planejadas, MVP):**
- Consentimento obrigatório **por arquivo**, exibindo nome, tamanho e tipo antes de qualquer transmissão.
  - A opção "Aceitar todos os arquivos" só existe depois que a lista completa é exibida, e exige confirmação explícita.
  - Arquivos adicionados depois exigem novo consentimento.
- Sanitização do nome: remoção de separadores de caminho, caracteres de controle e caracteres de controle de direção de texto. A extensão real é exibida.
- Download forçado, sem abertura automática.
- **Risco aceito:** o Skiff não verifica malware. A interface deve deixar claro que o usuário só deve aceitar arquivos de quem conhece.

### 3.12 Negação de serviço (DoS)

**Ameaças:**
- Criação massiva de sessões.
- Excesso de conexões WebSocket.
- Mensagens gigantes ou em alta frequência.
- Consumo de banda do TURN.

**Mitigações (planejadas, MVP):**
- Limites por IP para criar sessões e abrir WebSockets.
- Teto global de sessões ativas.
- Tamanho máximo e taxa máxima de mensagens por conexão.
- Encerramento de conexões não autenticadas no prazo.
- Cotas no TURN.

**Risco aceito:** ataques volumétricos de rede estão fora do alcance da aplicação. Eles dependem da infraestrutura de hospedagem.

### 3.13 Execução em segundo plano no iOS e no Android

Este é um risco de **disponibilidade**, não de confidencialidade, mas afeta diretamente a confiança no produto.

**Ameaça.** O sistema operacional suspende a página quando o usuário troca de aplicativo ou bloqueia a tela. O JavaScript para e as conexões WebRTC e WebSocket caem no meio da transferência.
- **No iOS**, todos os navegadores usam WebKit e estão sujeitos às mesmas regras.
- **No Android**, abas em segundo plano também são restringidas.

**Situação:**
- **Planejada (MVP):**
  - aviso visível para manter a página aberta;
  - uso da Screen Wake Lock API para evitar que a tela apague **enquanto a página está visível**;
  - detecção de `visibilitychange`;
  - falha clara e limpa, com descarte dos dados parciais.
- **Limitação explícita:** a Wake Lock é liberada quando a página fica oculta. Ela **não garante** transferência em segundo plano. O Skiff não promete continuidade em segundo plano.
- **A validar:** o comportamento de cada plataforma, no experimento técnico e na matriz de dispositivos.

### 3.14 Dependências e segredos no repositório

**Mitigações (planejadas, MVP):**
- Monitoramento de dependências vulneráveis.
- `.gitignore` cobre `.env` e certificados locais.
- Nenhum segredo em arquivos versionados; exemplos usam o sufixo `.exemplo`.

## 4. Resumo

| # | Ameaça | Status |
|---|---|---|
| 3.1 | Força bruta no código | Planejada (MVP); risco residual de engenharia social aceito |
| 3.2 | CGNAT e IPs compartilhados | Planejada (MVP); limites a validar |
| 3.3 | Roubo de token | Planejada (MVP); dependente da proteção contra XSS |
| 3.4 | XSS | Planejada (MVP) |
| 3.5 | CSWSH | Planejada (MVP) |
| 3.6 | Abuso do TURN e credenciais | Planejada (MVP); cotas a validar |
| 3.7 | Sinalização comprometida | Risco aceito no MVP; SAS futura |
| 3.8 | Exposição de IPs | Risco aceito no MVP; modo relay futuro |
| 3.9 | Metadados | Planejada (MVP) |
| 3.10 | Privacidade e LGPD | Planejada antes da disponibilização pública |
| 3.11 | Arquivos maliciosos | Planejada (MVP); ausência de antivírus aceita |
| 3.12 | DoS | Planejada (MVP); ataques volumétricos fora do escopo |
| 3.13 | Segundo plano em celulares | Planejada (MVP) como mitigação parcial; continuidade não garantida |
| 3.14 | Dependências e segredos | Planejada (MVP) |
