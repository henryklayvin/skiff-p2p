# Plano de desenvolvimento

O desenvolvimento é dividido em etapas pequenas e verificáveis. Cada etapa só começa depois da revisão e aprovação da anterior.

A ordem prioriza a **redução de risco**: primeiro se prova o que é incerto (WebRTC em dispositivos reais), depois se constrói em cima.

Ao final de cada etapa:
- os testes da etapa passam;
- a documentação afetada está atualizada (arquitetura, ADRs, modelo de ameaças, `CLAUDE.md`);
- os critérios de aceite estão conferidos.

## Visão geral

| # | Etapa | Situação |
|---|---|---|
| 0 | Fundação e documentação | Concluída |
| 1 | Experimento técnico de WebRTC | Planejada (obrigatória antes do backend completo) |
| 2 | Esqueletos do backend e do frontend, e CI | Planejada |
| 3 | Pareamento no backend | Planejada |
| 4 | Sinalização WebSocket | Planejada |
| 5 | Pareamento no frontend | Planejada |
| 6 | Conexão WebRTC com STUN | Planejada |
| 7 | TURN | Planejada |
| 8 | Transferência de um arquivo | Planejada |
| 9 | Integridade e múltiplos arquivos | Planejada |
| 10 | Robustez em dispositivos móveis | Planejada |
| 11 | Revisão de segurança e privacidade | Planejada |
| 12 | Disponibilização pública | Planejada (depende de decisão sobre hospedagem) |
| 13 | Pareamento por QR Code (v1.1) | Futura |

---

## Etapa 0 — Fundação e documentação

**Objetivo:** registrar a direção do projeto antes de qualquer código.

**Entregas:** `README.md`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `.editorconfig`, visão do produto, arquitetura geral, modelo de ameaças, este plano e os ADRs.

**Critérios de aceite:**
- [ ] Os documentos não se contradizem.
- [ ] As decisões aprovadas estão registradas em ADRs.
- [ ] Parâmetros experimentais estão identificados como tal.
- [ ] O README não afirma que existem funcionalidades implementadas.

## Etapa 1 — Experimento técnico de WebRTC

**Objetivo:** validar, em navegadores e dispositivos reais, as premissas de transferência antes de construir o backend completo.

**Entregas:**
- protótipo **descartável** em `experimentos/etapa-1-webrtc/`, versionado e identificado como descartável. Nada desse diretório é importado pelo código definitivo;
- relatório em `docs/experimentos/`.

### Decisões para esta etapa (2026-11-17)

| Tema | Decisão |
|---|---|
| Linguagem | JavaScript puro, **sem build, sem frameworks** |
| Servidor do protótipo | Servidor HTTPS estático com o módulo nativo `https` do Node.js, **sem dependências**. O `jwebserver` não será usado para HTTPS |
| HTTPS | Autoridade certificadora (CA) local criada com **OpenSSL**, com certificado do servidor válido para o IP da rede local, `localhost` e `127.0.0.1` |
| Conexão | Troca **manual** de SDP (copiar e colar), sem backend |
| Transporte do SDP entre aparelhos | Aplicativo de mensagens privado. **Sem publicação nem armazenamento permanente** dos textos, que contêm endereços IP |
| STUN | Primeiro teste com `stun:stun.l.google.com:19302`. Depois, coturn próprio local em Docker |
| TURN | coturn local com credenciais temporárias e **retransmissão forçada**. Sem VPS nem domínio; TURN entre redes diferentes fica para depois |
| Hash | **SHA-256 incremental**. `crypto.subtle.digest()` sobre o arquivo inteiro **não** é a estratégia principal, porque exige os dados completos na memória. `hash-wasm` será **avaliada** no protótipo, sem aprovação para o projeto definitivo |
| Referência móvel | **50 MB nos dois sentidos**: computador ↔ Android e computador ↔ iPhone |
| Android | **Emulador do Android Studio**, sem exigir aparelho físico (decisão de 2026-11-17). Valida conexão e funcionamento. **Memória, Wake Lock e segundo plano no Android não são validados em aparelho físico** nesta etapa, e o relatório registra essa limitação. Se um Android físico ficar disponível, esses testes são repetidos |
| Dispositivos | Modelos, versões do sistema e dos navegadores registrados **antes** da fase de testes móveis |

### Cuidados de segurança do experimento

- **Chaves fora do repositório.** As chaves privadas da CA e do servidor ficam fora do repositório (ex.: numa pasta no perfil do usuário). O `.gitignore` já cobre `*.key`, `*.pem`, `*.crt` e `*.p12` como proteção adicional.
- **CA restrita e temporária.** A CA local é instalada só nos aparelhos de teste e **removida ao final do experimento**. Quando houver suporte, ela será restrita por *name constraints* ao IP da rede local e a `localhost`, para limitar o dano caso a chave vaze.
- **Segredo do coturn.** Vem de variável de ambiente e é versionado apenas como arquivo `.exemplo`. As credenciais temporárias são geradas no terminal e coladas na página. O segredo nunca vai para o navegador.
- **SDP.** Os textos de SDP não são salvos em arquivos do repositório nem no relatório. O relatório registra apenas os tipos de candidato.

### Questões a responder

- Desempenho e comportamento com blocos de 16 KiB.
- Latência do canal `controle` enquanto o canal `dados` está carregado.
- Custo e comportamento das confirmações (1 MiB ou 250 ms) e da janela de 8 MiB.
- Limiares adequados de `bufferedAmount`.
- Tempo até a confirmação remota do cancelamento.
- Uso de memória **do remetente e do destinatário, medidos separadamente**, em cada estratégia de destino.
- Limite prático de Blob em memória, especialmente no iOS.
- Viabilidade do OPFS e da File System Access API em cada navegador testado.
- Desempenho e consumo de memória do SHA-256 incremental com `hash-wasm`.
- Comportamento da Wake Lock e da página em segundo plano no iOS e no Android.
- Conversão de HEIC para JPEG na seleção de fotos no iOS.
- Tentativa de conexão direta com o celular no 4G, usando STUN (só para registro).

### Fases de teste

| Fase | O que é testado | Ambiente |
|---|---|---|
| A | Conexão por SDP manual entre duas abas; mensagens no `controle`; tipos de candidato pelas estatísticas | Computador, STUN do Google |
| B | Transferência de 10 MB, 100 MB e 1 GB entre abas; memória do remetente e do destinatário medidas separadamente | Computador |
| C | Latência do `controle` sob carga; cancelamento local e remoto | Computador |
| D | Computador ↔ Android e computador ↔ iPhone nos dois sentidos, em tamanhos crescentes a partir de 50 MB; Wake Lock; troca de aplicativo no meio da transferência; HEIC; OPFS e File System Access | Mesma rede Wi-Fi, HTTPS, STUN do Google |
| E | coturn local; retransmissão forçada entre abas e entre computador e celular; recusa de credencial expirada | Docker, rede local |
| F | Relatório e propostas de revisão dos ADRs | — |

### Como medir memória

| Lado | Desktop (Chromium) | Android | iPhone |
|---|---|---|---|
| Remetente e destinatário, **sempre em registros separados** | Gerenciador de tarefas do navegador (*Shift+Esc*) por aba, no início, a cada 25% do progresso e no fim | Depuração remota pelo `chrome://inspect` do computador | Sem medição direta a partir do Windows. Registram-se os sinais indiretos: recarga ou encerramento da aba, conclusão ou falha |

### Como comprovar a retransmissão TURN

Uma transferência bem-sucedida **não** comprova retransmissão. A comprovação exige, nas estatísticas WebRTC (`getStats()`) de cada lado:
- o par de candidatos selecionado (`selectedCandidatePairId` do transporte) em estado `succeeded`;
- o candidato **local** desse par com `candidateType` igual a `relay`.

Os tipos de candidato local e remoto do par selecionado são registrados no relatório em todos os testes, e não só nos de TURN.

### Critérios de aceite

**Bloqueantes** (todos precisam ser atendidos):
- [ ] Os DataChannels abrem por SDP manual entre duas abas, entre computador e Android e entre computador e iPhone, na mesma rede.
- [ ] Todo arquivo concluído tem SHA-256 incremental idêntico ao do original. Um teste com bloco corrompido ou faltando, provocado de propósito, resulta em falha de integridade. Nenhum arquivo incorreto é oferecido para download.
- [ ] Arquivo de pelo menos 100 MB transferido entre duas abas, com **memória do remetente estável** (sem crescimento proporcional ao tamanho do arquivo).
- [ ] **Memória do destinatário medida e registrada separadamente**, para cada estratégia de destino testada.
- [ ] Nenhum fechamento de canal ou erro de buffer. A maior janela observada não excede 8 MiB.
- [ ] Transferência de **50 MB nos dois sentidos** entre computador e Android e entre computador e iPhone, via HTTPS.
- [ ] Cancelamento: nenhum bloco entregue ao `send()` depois do cancelamento local; confirmação remota recebida sempre que o canal estiver ativo, com o tempo registrado.
- [ ] Retransmissão forçada pelo coturn local funcionando com credenciais temporárias, **comprovada pelas estatísticas** (candidato local `relay` no par selecionado); credencial expirada recusada.
- [ ] Dispositivos registrados (modelo, versão do sistema, navegador e versão) antes dos testes móveis.
- [ ] Relatório responde a todas as questões acima, indicando o que foi medido e em quais dispositivos.

**Não bloqueantes** (registrados para calibrar parâmetros e decidir o destino dos arquivos):
- velocidade;
- latência do `controle`;
- custo das confirmações;
- eficiência de memória do destinatário em cada estratégia;
- limite prático no iOS;
- OPFS e File System Access;
- Wake Lock e segundo plano;
- HEIC;
- conexão direta via 4G.

**Possíveis resultados:**
- **Aprovado.**
- **Aprovado com ajustes:** parâmetros alterados por revisões nos ADRs.
- **Reprovado:** algum critério bloqueante falhou. Nesse caso, o escopo é revisto antes da Etapa 2.

**Ao final:**
- ADRs afetados atualizados ou substituídos com base nos resultados, incluindo a estratégia de destino dos arquivos recebidos;
- CA local removida dos aparelhos de teste.

## Etapa 2 — Esqueletos e CI

**Objetivo:** criar as bases técnicas do backend e do frontend, sem funcionalidades.

**Entregas:**
- projeto Spring Boot com Maven e verificação de saúde;
- projeto Vite + React + TypeScript;
- um teste em cada projeto;
- workflows de verificação no GitHub Actions;
- seção de comandos no `CLAUDE.md`.

**Critérios de aceite:**
- [ ] `./mvnw verify` e o build e os testes do frontend passam localmente e na CI.
- [ ] Um teste falhando torna a CI vermelha.

## Etapa 3 — Pareamento no backend

**Objetivo:** sessões, códigos, tokens, aprovação, expiração e limites de tentativas.

**Critérios de aceite:**
- [ ] Testes cobrem:
  - [ ] expiração do código (5 min) e da sessão (60 min após o pareamento) com `Clock` falso;
  - [ ] encerramento da sessão não pareada quando não houver código válido;
  - [ ] uso único do código;
  - [ ] recusa de terceiro participante;
  - [ ] recusa ou expiração do pedido invalida o código;
  - [ ] apenas um pedido pendente por sessão.
- [ ] Testes cobrem os limites:
  - [ ] por IP, com resposta 429 e `Retry-After`;
  - [ ] agrupamento IPv6 `/64`;
  - [ ] `X-Forwarded-For` ignorado quando não vem de proxy confiável;
  - [ ] endurecimento sob limiar global, sem bloqueio geral.
- [ ] Mensagem única "código inválido ou expirado".
- [ ] Tokens com pelo menos 128 bits, que não aparecem em logs.
- [ ] Sessões encerradas ou expiradas são removidas da memória.

## Etapa 4 — Sinalização WebSocket

**Objetivo:** repasse seguro de mensagens entre os dois participantes, com o WebSocket mantido durante a sessão.

**Critérios de aceite:**
- [ ] Teste de integração com dois clientes reais: mensagens chegam só ao outro participante da mesma sessão.
- [ ] Conexão sem autenticação no prazo é encerrada; `Origin` não permitido é recusado.
- [ ] Tipo desconhecido ou acima do tamanho máximo é rejeitado sem derrubar o servidor.
- [ ] Pulsação, reconexão com o mesmo token e substituição da conexão anterior funcionam.
- [ ] Saída de um participante é notificada ao outro.
- [ ] Protocolo de sinalização documentado em `docs/protocolo/`.

## Etapa 5 — Pareamento no frontend

**Critérios de aceite:**
- [ ] Fluxo completo (criar sessão, digitar código, aprovar, conectado) funciona em computador e celular.
- [ ] Mensagens claras para código inválido ou expirado, pedido recusado e limite de tentativas.
- [ ] Interface utilizável em telas de 360 px de largura.

## Etapa 6 — Conexão WebRTC com STUN

**Critérios de aceite:**
- [ ] DataChannels `controle` e `dados` abrem pela sinalização real, na mesma rede e em redes diferentes (quando o NAT permitir).
- [ ] A interface indica conectando, conectado, falha, e se a conexão é direta.

## Etapa 7 — TURN

**Critérios de aceite:**
- [ ] coturn em Docker com configuração documentada.
- [ ] Com retransmissão forçada (`iceTransportPolicy: "relay"`), a conexão funciona e a interface indica "retransmitida".
- [ ] Credencial expirada é recusada pelo coturn.
- [ ] Retransmissão para IPs privados, de loopback e *link-local* é bloqueada (testado).
- [ ] Segredo vem de variável de ambiente; nada sensível versionado.

## Etapa 8 — Transferência de um arquivo

**Critérios de aceite:**
- [ ] O destinatário vê nome, tamanho e tipo e precisa aceitar. Recusa não transmite nenhum bloco.
- [ ] Arquivo grande (tamanho de referência definido após o experimento) é transferido no computador com memória do remetente estável.
- [ ] A janela de bytes não confirmados nunca excede o limite configurado (teste com destinatário lento simulado).
- [ ] O progresso do remetente reflete os bytes **confirmados**.
- [ ] Ausência de confirmações além do prazo gera falha com mensagem clara.
- [ ] **Cancelamento local:**
  - [ ] após o comando, nenhum bloco novo é entregue ao `send()` (verificado em teste);
  - [ ] a interface indica "cancelando" imediatamente;
  - [ ] os recursos locais são liberados.
- [ ] **Cancelamento remoto:**
  - [ ] o destinatário descarta os dados parciais e confirma;
  - [ ] sem confirmação no prazo, o remetente mostra "cancelado sem confirmação do outro dispositivo";
  - [ ] a latência é medida e registrada como métrica, não como garantia.
- [ ] Testes unitários do núcleo com DataChannel simulado.

## Etapa 9 — Integridade e múltiplos arquivos

**Critérios de aceite:**
- [ ] O hash SHA-256 do destino confere com o da origem (comparado também com uma ferramenta externa, como `sha256sum`).
- [ ] Bloco faltando ou corrompido em teste resulta em falha de integridade, nunca em arquivo incorreto oferecido para download.
- [ ] Nomes maliciosos (`../`, U+202E, caracteres de controle) são sanitizados (testes unitários).
- [ ] Vários arquivos, com consentimento por arquivo e progresso individual e total.
- [ ] "Aceitar todos os arquivos" só aparece após a exibição da lista completa e exige confirmação explícita.
- [ ] Arquivos adicionados depois de uma oferta exigem nova oferta e novo consentimento (testado).

## Etapa 10 — Robustez em dispositivos móveis

**Critérios de aceite:**
- [ ] Matriz de dispositivos executada e registrada em `docs/testes/`: iOS Safari, Android Chrome e navegadores de desktop (Chrome, Firefox, Safari, Edge).
- [ ] A tela permanece ligada durante a transferência onde a Wake Lock é suportada.
- [ ] Ir para segundo plano gera aviso e falha controlada, nunca promessa de continuidade.
- [ ] Arquivo acima do limite da plataforma é bloqueado antes de começar, com explicação.

## Etapa 11 — Revisão de segurança e privacidade

**Critérios de aceite:**
- [ ] Cada ameaça do modelo de ameaças tem status atualizado.
- [ ] Cabeçalhos de segurança presentes (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`).
- [ ] Revisão de logs confirma a ausência de tokens, códigos, SDP, candidatos ICE e nomes de arquivos.
- [ ] Política de privacidade redigida, explicando a diferença entre conexão direta e TURN.

## Etapa 12 — Disponibilização pública

Depende da escolha da VPS e do domínio.

**Critérios de aceite:**
- [ ] Aplicação acessível por HTTPS; transferência entre celular e computador em redes diferentes funciona.
- [ ] Cotas do TURN configuradas; rotação do segredo documentada.
- [ ] Política de privacidade publicada.

## Etapa 13 — Pareamento por QR Code (v1.1)

**Critérios de aceite:**
- [ ] O QR Code contém um token forte no fragmento da URL (após `#`), que o navegador não envia ao servidor.
- [ ] Escanear com a câmera nativa abre o Skiff já pareando.
- [ ] O token não aparece em logs de acesso.
