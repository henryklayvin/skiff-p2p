# CLAUDE.md — Orientações para o Claude Code no Skiff P2P

Este arquivo orienta todas as sessões do Claude Code neste repositório. Ele resume as regras do projeto. Os detalhes e as justificativas estão nos documentos listados em "Fontes de verdade".

## Sobre o projeto

O **Skiff P2P** é uma aplicação web responsiva, sem instalação e sem conta, para transferir arquivos entre dispositivos diferentes (computadores, Android e iOS).

- Os arquivos trafegam **diretamente entre os navegadores** por WebRTC DataChannel.
- Quando a conexão direta não é possível, um servidor **TURN** (coturn) **retransmite** os dados. Eles continuam cifrados (DTLS) e não são armazenados.
- O servidor de aplicação (Spring Boot) **nunca recebe bytes de arquivos**. Ele só coordena: sessões, pareamento, autorização, sinalização e credenciais temporárias do TURN.

O projeto também é um portfólio de desenvolvimento Backend Java. Clareza, segurança e decisões justificadas valem mais do que quantidade de funcionalidades.

## Sobre o desenvolvedor

O desenvolvedor é estudante de Análise e Desenvolvimento de Sistemas e ainda está construindo experiência em backend.

- Explique decisões técnicas em **português do Brasil**, de forma clara e didática, com exemplos quando ajudar.
- Não presuma conhecimento prévio de tecnologias que ainda não apareceram no projeto.
- Diferencie sempre: o que está **decidido**, o que é **recomendação**, o que precisa de **validação experimental** e o que é **futuro**.

## Estado atual

- Etapa 0 (fundação e documentação) concluída. Próxima: Etapa 1 (experimento técnico de WebRTC). **Nenhuma funcionalidade foi implementada.**
- Ainda não existem `backend/`, `frontend/`, `infra/`, comandos de build nem CI. Eles serão criados nas etapas definidas em `docs/plano-de-desenvolvimento.md`.
- Ao concluir uma etapa, atualize esta seção.

## Fontes de verdade (consultar antes de propor mudanças)

| Documento | Conteúdo |
|---|---|
| `docs/adr/` | Decisões arquiteturais (ADRs). **Leia os ADRs relevantes antes de propor qualquer mudança de arquitetura, tecnologia ou protocolo.** |
| `docs/arquitetura/arquitetura-geral.md` | Componentes, responsabilidades, fluxos e protocolos |
| `docs/seguranca/modelo-de-ameacas.md` | Ameaças, mitigações e riscos aceitos |
| `docs/produto/visao-do-produto.md` | Escopo do MVP, o que é futuro e o que está fora do escopo |
| `docs/plano-de-desenvolvimento.md` | Etapas, entregas e critérios de aceite |

Se uma tarefa contradizer um ADR, **pare e aponte a contradição**.
- Mudanças de direção, ou em decisões já implementadas, exigem um **novo ADR** que substitua o anterior.
- Refinamentos feitos antes da implementação podem entrar no próprio ADR, registrados na seção "Revisões" (ver `docs/adr/README.md`).

## Arquitetura aprovada (resumo)

- **Monorepo**: `backend/`, `frontend/`, `infra/`, `docs/`.
- **Backend**:
  - Java 21, Spring Boot (versão estável compatível com Java 21), Maven.
  - Spring MVC, WebSocket do Spring sem STOMP e sem SockJS.
  - **Monólito modular** com pacotes por funcionalidade sob `io.github.henryklayvin.skiff`.
- **Estado**: em memória, com expiração automática. **Sem banco de dados, Redis, Kafka, MinIO ou microsserviços no MVP.**
- **Sinalização**:
  - WebSocket com mensagens JSON versionadas.
  - O WebSocket permanece aberto durante toda a sessão.
  - Somente o criador da sessão gera ofertas SDP.
- **Frontend**:
  - React, TypeScript, Vite e CSS Modules.
  - O motor de WebRTC e de transferência fica em **TypeScript puro, sem React** (`frontend/src/nucleo/`).
- **Conectividade**: STUN e TURN com coturn em Docker. O TURN só aceita credenciais temporárias emitidas pelo backend.

## Restrições arquiteturais

- **Não introduza tecnologias, bibliotecas, serviços ou camadas sem necessidade demonstrada.**
  - Antes de adicionar qualquer dependência, explique o problema que ela resolve e as alternativas, e peça aprovação.
  - Mudanças estruturais exigem ADR.
- Não armazene arquivos transferidos em lugar nenhum do servidor.
- Não faça o backend participar do caminho dos dados de arquivo, nem como *proxy*.
- Não adicione contas de usuário, histórico de transferências ou persistência sem ADR.
- Não adicione analytics nem serviços de terceiros que recebam dados de usuários.
- **Parâmetros de transferência e de limites são valores iniciais experimentais**: blocos de 16 KiB, confirmação a cada 1 MiB ou 250 ms, janela de 8 MiB e limites de tentativas.
  - Não os trate como definitivos.
  - Mantenha-os configuráveis e centralizados, nunca espalhados pelo código.

## Idioma e nomenclatura

Todo conteúdo produzido pela equipe deve estar em **português do Brasil**:
- documentação, interface, comentários e mensagens de log;
- mensagens de commit;
- pacotes, classes, métodos, variáveis, arquivos próprios, endpoints, tipos de mensagem do protocolo e nomes de testes.

**Identificadores usam ASCII, sem acentos nem cedilha.** Exemplos: `SessaoDePareamento`, `codigoDePareamento`, `/api/sessoes`, `oferta-sdp`, `deveInvalidarCodigoAposRecusa()`. Textos livres (documentação, interface, commits) usam acentuação normal.

**Exceções obrigatórias** (preservar o nome original):
- palavras-chave das linguagens;
- APIs, classes, anotações e métodos de terceiros que sobrescrevemos (`WebSocketHandler`, `handleTextMessage`, `RTCPeerConnection`, `@Configuration`);
- arquivos e diretórios convencionais (`README.md`, `CLAUDE.md`, `LICENSE`, `pom.xml`, `package.json`, `application.yml`, `src/main/java`, `.github/workflows`);
- nomes de tecnologias (WebRTC, ICE, SDP, STUN, TURN, DTLS);
- o texto legal da licença MIT, que permanece no original em inglês.

## Convenções de código

**Java (backend)**
- Pacotes **por funcionalidade**, não por camada: `pareamento`, `sinalizacao`, `ice`, `seguranca`, `compartilhado`.
- Injeção de dependências por construtor. Nunca por atributo (`@Autowired` em campo).
- Prefira `record` para dados imutáveis e `sealed interface` para modelar tipos de mensagem.
- Não use Lombok (os `record` cobrem o caso principal); introduzi-lo exigiria ADR.
- Tempo sempre via `java.time.Clock` injetado, para que expirações sejam testáveis.
- Segredos e tokens são gerados com `SecureRandom`.
- Valide toda entrada externa (REST e WebSocket): tipo de mensagem, esquema e tamanho máximo.

**TypeScript (frontend)**
- `strict` ativado. Evite `any`.
- Mensagens do protocolo modeladas como uniões discriminadas pelo campo `tipo`.
- `src/nucleo/` **não importa React** nem nada de interface. A UI apenas consome eventos e estados do núcleo.
- Estilos com CSS Modules.

## Regras de segurança (invioláveis)

- **Nunca registre em logs**: tokens, códigos de pareamento, SDP, candidatos ICE, nomes de arquivos, conteúdo de mensagens de sinalização ou segredos.
- Segredos (ex.: segredo compartilhado do TURN) vêm de variáveis de ambiente. **Nunca** os versione. Arquivos de exemplo usam o sufixo `.exemplo`.
- Tokens nunca vão em URLs (query string). O WebSocket se autentica pela **primeira mensagem**, com prazo curto.
- Valide o cabeçalho `Origin` no *handshake* do WebSocket (proteção contra CSWSH).
- O código de pareamento só **localiza** a sessão. A autorização vem do token, da aprovação do criador e do consentimento do destinatário.
- Erros de pareamento usam mensagem única ("código inválido ou expirado"), sem revelar se o código existiu.
- O TURN nunca funciona sem autenticação e deve bloquear retransmissão para faixas de IP privadas, de loopback e *link-local*.
- No frontend:
  - nunca use `dangerouslySetInnerHTML`;
  - nunca renderize nem abra automaticamente arquivos recebidos (sempre forçar o download);
  - sanitize nomes de arquivos.
- Não prometa na interface nem na documentação: transferências ilimitadas, execução em segundo plano no celular, ou que os bytes nunca passam por servidores (eles passam pelo TURN quando há retransmissão).

## Estratégia de testes

- **Backend**:
  - testes unitários do domínio com JUnit 5, AssertJ e Mockito, usando `Clock` falso para expiração;
  - testes de integração com Spring Boot Test e clientes WebSocket reais.
- **Frontend**: Vitest para o núcleo de transferência, com DataChannel simulado.
- **Ponta a ponta**: Playwright. O WebKit do Playwright **não substitui** o Safari real do iPhone.
- **Testes manuais em dispositivos reais**, registrados numa matriz de dispositivos (iOS Safari, Android Chrome e navegadores de desktop).
- Nomes de testes descrevem o comportamento esperado em português: `deveRecusarTerceiroParticipante()`.
- Toda regra de segurança (expiração, uso único, limites, autorização) precisa de teste automatizado.

## Git e commits

- **Conventional Commits**, com o tipo da convenção e a descrição em português, no imperativo.
  - Exemplos: `feat: implementar criação de sessões`, `docs: registrar ADR de pareamento`, `fix: invalidar código após recusa`.
  - Tipos usuais: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
- Commits e branches seguem as regras da seção "Autonomia e fluxo de trabalho" (abaixo). **Push, exclusão de trabalho, reescrita de histórico e operações destrutivas exigem autorização explícita.**
- Nunca versione segredos, certificados locais ou arquivos `.env`.

## Forma de trabalhar

- Siga as etapas de `docs/plano-de-desenvolvimento.md`, uma por vez. Não avance de etapa sem aprovação.
- O **experimento técnico de WebRTC (Etapa 1)** é obrigatório antes da implementação completa do backend.
- Faça mudanças pequenas e verificáveis. Ao final, informe o que foi feito, como foi verificado e o que ficou pendente.
- Quando houver dúvida de produto ou de arquitetura, pergunte em vez de presumir.
- Ao criar ou alterar comportamento, atualize a documentação correspondente no mesmo conjunto de mudanças.

## Autonomia e fluxo de trabalho

O Claude Code é o **agente principal** do desenvolvimento do Skiff P2P. Ele conduz as etapas aprovadas sem depender de outro assistente para organizar tarefas ou escrever instruções.

### 1. Autonomia de execução
- Ao receber aprovação para uma etapa, analise o trabalho necessário e execute **todas as subtarefas pertinentes**.
- Não peça autorização para cada arquivo, edição, comando de leitura ou teste rotineiro.
- Execute as verificações, identifique falhas e tente corrigi-las antes de reportar.
- Tome decisões técnicas pequenas e reversíveis por conta própria, respeitando a arquitetura e os ADRs.
- Diante de um impedimento, investigue alternativas antes de interromper o trabalho.

### 2. Git
- Use Git de forma autônoma para consultar status, histórico e diferenças, e para validar alterações.
- Crie branches quando necessário e organize os commits de acordo com os marcos do projeto (Conventional Commits, descrição em português).
- **Não faça push, não exclua trabalho, não reescreva histórico e não execute operações destrutivas sem autorização explícita.**
- Nunca inclua segredos, chaves ou certificados privados, nem arquivos temporários, no repositório. Confira o `git status` e o conteúdo preparado antes de cada commit.

### 3. Testes do usuário
- Quando uma validação depender de interação humana, de dispositivo físico ou de avaliação visual, **interrompa a execução naquele ponto**.
- Explique exatamente o que o desenvolvedor precisa fazer, onde acessar, o que observar e qual resultado informar.
- **Nunca afirme que um teste manual foi aprovado sem a confirmação do desenvolvedor.**

### 4. Decisões
- Resolva de forma autônoma os detalhes de implementação que não alterem decisões arquiteturais.
- **Peça aprovação** para mudanças de arquitetura, segurança, escopo, dependências relevantes ou decisões difíceis de reverter.
- Ao pedir aprovação, apresente a recomendação com os motivos e as alternativas.

### 5. Encerramento de etapa
Ao concluir cada etapa:
- informe o que foi implementado;
- apresente os testes executados e seus resultados;
- informe problemas encontrados, limitações e pendências;
- liste as ações que dependem do desenvolvedor;
- recomende a próxima etapa do plano;
- **aguarde a decisão do desenvolvedor antes de iniciar outra etapa.**

### 6. Didática
- O desenvolvedor é estudante de ADS e está aprendendo desenvolvimento backend.
- Explique as decisões técnicas importantes em linguagem simples, sem transformar cada execução numa aula extensa.
- Não esconda decisões importantes nem implemente soluções que o desenvolvedor não consiga compreender minimamente.
