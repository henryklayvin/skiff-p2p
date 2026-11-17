# Resultados parciais do experimento

Registro dos resultados de cada passo, para compor o relatório final em `docs/experimentos/`.

Os resultados manuais vêm das telas do protótipo, informados pelo desenvolvedor. Endereços IP e textos de SDP **não** são registrados.

## P2 — Conexão por troca manual de SDP (2026-11-17)

Configuração ICE em todos os testes: `stun:stun.l.google.com:19302`.

| Teste | Papéis | Resultado | Par selecionado (local / remoto) | Candidatos no SDP local | Observações |
|---|---|---|---|---|---|
| Duas abas no PC-1 (Chrome) | A e B no PC-1 | ✅ Conectado; canais `open`; mensagens nos dois sentidos | `host` / `host` (direta, UDP) | A: host 1, srflx 1. B: host 1, srflx 0 | Tempo de ida e volta do `getStats` não exibido no Chrome (ver pendências) |
| PC-1 (Chrome) ↔ IOS-1 (Safari) | A = PC-1, B = IOS-1 | ✅ Conectado; canais `open`; mensagens nos dois sentidos | `host` / `host` (direta, UDP) nos dois lados | PC-1: host 1, srflx 1. IOS-1: host 1, srflx 1 | Tempo de ida e volta de 8 ms no Safari. IOS-1 marcou `failed` antes de A aplicar a resposta e se recuperou sozinho. PC-1 teve uma desconexão de cerca de 5 s, com reconexão automática |
| AND-1 (emulador) ↔ PC-1 (Chrome) | A = AND-1, B = PC-1 | ❌ `failed`; canais ficaram em `connecting` | — | AND-1: host 2, srflx 1. PC-1: host 1, srflx 1 | Causa provável: candidatos mDNS (abaixo) |

### Constatações

1. **A coleta de candidatos pode passar de 10 s.** No IOS-1 e no AND-1, o protótipo seguiu com os candidatos já coletados quando o prazo de 10 s acabou, e a conexão funcionou mesmo assim no IOS-1.
   - **Consequência para o produto:** confirma a escolha de enviar os candidatos ICE **à medida que são encontrados** (`candidato-ice` pela sinalização, ADR 0004), em vez de esperar a coleta completa.

2. **A demora da troca manual afeta o ICE.** O IOS-1 declarou `failed` cerca de 15 s depois de receber a oferta, porque ainda não tinha a resposta, e se recuperou quando os testes de conectividade de A chegaram.
   - É um efeito da troca manual, que leva dezenas de segundos.
   - Com a sinalização por WebSocket, essa troca leva milissegundos.

3. **Interrupção curta entre PC-1 e IOS-1:** `disconnected` seguido de `connected` em cerca de 5 s, sem ação do usuário.
   - Causa provável, segundo o desenvolvedor: a saída do Safari para copiar e colar os textos em outro aplicativo. Ao sair do navegador, o iOS suspende a página.
   - É coerente com a limitação de segundo plano já documentada. Será observada nos testes de transferência da Fase D.

4. **O emulador não conecta ao PC-1 por conexão direta. Causa provável: mDNS.**
   - Por privacidade, o Chrome não publica o IP local no SDP: troca-o por um nome temporário do tipo `xxxx.local` (mDNS), que só pode ser resolvido na mesma rede local física.
   - O emulador fica numa rede virtual própria, atrás do PC-1. Ele não resolve esse nome, e o PC-1 não alcança o endereço interno do emulador.
   - Restaria o caminho pelo IP público dos dois lados (`srflx`), que depende de o roteador permitir *hairpin NAT*; neste caso, não funcionou.
   - **É uma limitação do emulador**, não do produto: um Android físico no mesmo Wi-Fi resolve mDNS, como aconteceu com o IOS-1.
   - **O TURN local (P10) deve resolver esse caso**, porque os dois lados alcançam o coturn no IP de rede do PC-1.

## P3 — Latência do canal `controle` com o canal ocioso (2026-11-17)

20 sondas, uma de cada vez, com intervalo de 100 ms. Tempo de ida e volta medido no relógio de quem envia.

| Par | Quem mediu | Respondidas | Mínimo | Mediana | p95 | Máximo |
|---|---|---|---|---|---|---|
| PC-1 ↔ IOS-1 (Wi-Fi, direta) | PC-1 | 20 de 20 | 4,4 ms | 5,0 ms | 10,3 ms | 12,3 ms |
| PC-1 ↔ IOS-1 (Wi-Fi, direta) | IOS-1 | 20 de 20 | 4,4 ms | 5,1 ms | 8,2 ms | 11,9 ms |
| Duas abas no PC-1 | Aba 1 | 20 de 20 | 0,5 ms | 0,6 ms | 0,7 ms | 1,5 ms |
| Duas abas no PC-1 | Aba 2 | 20 de 20 | 0,5 ms | 0,6 ms | 0,7 ms | 1,1 ms |
| Autoteste (Chrome headless, mesma página) | Lado A | 20 de 20 | 0,45 ms | 0,55 ms | 0,76 ms | 1,27 ms |

**Leitura:** são as referências de latência **sem carga** no canal `dados`. Entre PC e iPhone, a mediana fica em cerca de 5 ms, com picos de até cerca de 12 ms. Elas serão comparadas com a latência medida durante transferências, que é o que importa para cancelamentos e confirmações.

## P4 — Blocos de 16 KiB e controle de fluxo local (2026-11-17)

**Implementação:**
- Blocos de 16 KiB no total: cabeçalho de 16 bytes e 16.368 bytes de conteúdo.
- Leitura do arquivo em partes de 1 MiB.
- Controle de fluxo local: pausa acima de 1 MiB em `bufferedAmount`; retomada no evento `bufferedamountlow`, configurado em 256 KiB.
- A oferta e o aceite acontecem no canal `controle` **antes** do primeiro bloco, porque não há ordem garantida entre `controle` e `dados`.
- Destino: Blob.

**Testes automáticos** (Chrome 157 headless, duas abas no PC-1, conexão direta):

| Transferência na mesma conexão | Arquivo | Duração | Vazão | Maior `bufferedAmount` | Pausas | SHA-256 |
|---|---|---|---|---|---|---|
| 1ª | 10 MiB | 3,54 s | 2,8 MiB/s | 1,0 MiB | 11 | ✅ idêntico |
| 2ª | 10 MiB | 0,71 s | 14,2 MiB/s | 1,0 MiB | 11 | ✅ idêntico |
| 3ª | 100 MiB | 7,48 s | 13,4 MiB/s | 1,0 MiB | 120 | ✅ idêntico |
| 4ª | 10 MiB | 0,70 s | 14,3 MiB/s | 1,0 MiB | 11 | ✅ idêntico |

Nos testes, o SHA-256 é calculado sobre o arquivo inteiro já recebido, só para conferir. Não é a estratégia de hash do experimento, que é incremental e entra no P6.

**Constatações:**
1. **Integridade:** os arquivos de 10 MiB e 100 MiB chegaram idênticos ao original.
2. **O controle de fluxo funciona:** o buffer nunca passou do limiar alto e não houve erro nem fechamento de canal.
3. **A primeira transferência de cada conexão é bem mais lenta** (cerca de 3,5 s a mais).
   - A leitura do disco não explica: o arquivo de 100 MiB, lido pela primeira vez, teve a vazão normal.
   - Hipótese: aquecimento da conexão, como a janela de congestionamento do SCTP crescendo ou a otimização do JavaScript pelo navegador. A confirmar nos testes manuais.
4. **Vazão estável de cerca de 14 MiB/s** na mesma máquina, com limiares de 1 MiB / 256 KiB. Limiares maiores podem aumentar a vazão; isso será calibrado nos testes manuais.

**Memória medida pela própria aba** (`measureUserAgentSpecificMemory`, Chrome headless, ciclo contínuo de amostras durante a transferência):

| Arquivo | Remetente: inicial / máxima / final | Destinatário (só a aba): inicial / máxima / final |
|---|---|---|
| 10 MiB | 0,8 / 2,8 / 0,8 MiB (345 amostras) | 0,7 / 4,7 / 0,8 MiB (350 amostras) |
| 100 MiB | 0,8 / 2,7 / 0,8 MiB (498 amostras) | 1,3 / 4,8 / 0,8 MiB (579 amostras) |

- **Remetente estável:** enviou 100 MiB com no máximo cerca de 2 MiB acima do inicial, compatível com a leitura de 1 MiB mais o limiar de 1 MiB do buffer. **O critério bloqueante de memória do remetente foi atendido**, com verificação automática no teste (crescimento menor que 32 MiB).
- **Destinatário:** a aba fica perto de 4 MiB, que é o tamanho do lote antes de virar Blob. **Atenção:** essa medição **não inclui o conteúdo do Blob**, que fica no processo principal do navegador. A memória real do recebimento em Blob cresce com o arquivo; a comparação entre destinos é tarefa do P8.
- Verificação prévia: reter um `Uint8Array` de 100 MiB elevou a medição da página de 0,5 MiB para 100,5 MiB, e liberá-lo a fez voltar a 0,5 MiB. Isso confirma que a API enxerga os buffers da página.

**Testes manuais** (informados pelo desenvolvedor):

| Teste | Arquivo | Duração | Vazão | Maior buffer | Pausas | Resultado |
|---|---|---|---|---|---|---|
| Duas abas no PC-1 (janela normal → anônima) | 100 MiB | 9,63 s | 10,4 MiB/s | 1,0 MiB | 120 | ✅ concluído; 6.500 blocos |
| PC-1 → IOS-1 (Wi-Fi, direta) | 50 MiB | 1,77 s | 28,3 MiB/s | 1,0 MiB | 39 | ✅ concluído; 3.250 blocos; download normal no iPhone |

- A medição manual de memória pelo Gerenciador de Tarefas do Windows não foi possível, porque ele agrupa todos os processos do Chrome. Foi substituída pela medição da própria aba, acima.
- **PC-1 → IOS-1 foi mais rápido que entre duas abas do mesmo PC.** Hipótese: nas duas abas, remetente e destinatário disputam o mesmo processador, e o emulador Android também estava em execução.

## P5 — Confirmações (ACK) e janela ponta a ponta (2026-11-17)

**Implementação:**
- O destinatário confirma os bytes **gravados** a cada 1 MiB ou a cada 250 ms. Um temporizador garante a confirmação mesmo quando param de chegar blocos.
- O remetente nunca deixa mais de 8 MiB enviados e não confirmados.
- Sem avanço das confirmações por 15 s, a transferência falha.
- O progresso do remetente passou a usar os bytes **confirmados**.
- Os intervalos de confirmação vão na oferta, para os dois lados usarem a mesma configuração.

**Testes automáticos** (Chrome 157 headless, duas abas no PC-1):

| Teste | Duração | Vazão | Maior janela | Maior buffer | Pausas (buffer / janela) | Confirmações | SHA-256 |
|---|---|---|---|---|---|---|---|
| 10 MiB, 1ª transferência da conexão | 21,4 s | 0,5 MiB/s | 4,8 MiB | 1,0 MiB | 12 / 0 | 52 | ✅ |
| 100 MiB | 5,5 s | 18,1 MiB/s | 2,4 MiB | 1,0 MiB | 121 / 0 | 100 | ✅ |
| 50 MiB, destinatário lento (100 ms por MiB) | 5,5 s | 9,1 MiB/s | **8,0 MiB** | 1,0 MiB | 17 / **36** | 50 | ✅ |

- **A janela funciona:** com o destinatário lento, ela limitou o envio (36 pausas) e nunca passou de 8 MiB. A memória da aba do destinatário ficou em no máximo 12,2 MiB. Sem a janela, os blocos se acumulariam na memória do destinatário à espera da gravação.
- **Custo das confirmações:** cerca de 1 mensagem por MiB (100 confirmações em 100 MiB), desprezível diante dos dados.
- **Latência do `controle` durante a transferência de 100 MiB:** mediana de **15,4 ms**, p95 de 19,5 ms e máximo de 22,0 ms, contra 0,6 ms com o canal ocioso na mesma máquina. Esse é o atraso esperado para cancelamentos e confirmações com o canal `dados` carregado.

**Constatação: a primeira transferência de cada conexão trava na mesma máquina.**
- O travamento aparece com e sem a medição de memória: 18,6 s e 20,4 s para 10 MiB; as transferências seguintes levam cerca de 0,5 s (cerca de 21 MiB/s).
- A leitura do arquivo não é a causa: cerca de 2 ms por MiB, mesmo na primeira leitura.
- Rastreamento: cerca de 1,5 MiB passam em 0,5 s; depois os dados chegam a cerca de 70 KiB/s durante 18 s; em seguida, tudo flui em velocidade total.
- Limiares menores (256/64 e 128/32 KiB) não resolveram de forma consistente: de 6 s a 20 s.
- **Não observado no PC-1 → IOS-1 pelo Wi-Fi** (50 MiB em 1,77 s, no P4).
- **Hipótese:** perda de pacotes UDP no início da associação SCTP quando os dois lados estão na mesma máquina, com recuperação lenta por retransmissões. A confirmar em rede real nos testes manuais.
- **Consequência para os testes automáticos:** a vazão da primeira transferência na mesma máquina não é representativa. Medições de vazão devem considerar uma transferência de aquecimento.

**Testes manuais: PC-1 (Chrome 157) → IOS-1 (Safari, iOS 26.6.2), Wi-Fi, conexão direta e nova.**

| Teste | Duração | Vazão | Maior janela | Pausas (buffer / janela) | Confirmações | Memória do PC-1 (aba) |
|---|---|---|---|---|---|---|
| 1º envio de 50 MiB da conexão | 1,72 s | 29,1 MiB/s | 6,5 MiB | 59 / 0 | 50 | 1,8 / 2,1 / 0,8 MiB |
| 2º envio de 50 MiB, com medição de latência simultânea | 1,54 s | 32,5 MiB/s | 2,5 MiB | 60 / 0 | 50 | 1,8 / 1,9 / 0,9 MiB |
| 50 MiB com o iPhone lento (100 ms por MiB) | 5,88 s | 8,5 MiB/s | **8,0 MiB** | 25 / **31** | 50 | 3,1 / 3,1 / 0,9 MiB |

Latência do `controle` medida no PC-1 **durante** o 2º envio (20 sondas): 20 de 20 respondidas; mínimo de 3,2 ms, **mediana de 17,4 ms, p95 de 103,3 ms** e máximo de 103,9 ms. Com o canal ocioso, a mediana era de 5,0 ms (P3).

**Constatações:**
1. **A primeira transferência pelo Wi-Fi não travou:** 1,72 s, contra 1,54 s no segundo envio. Isso reforça a hipótese de que o travamento é um efeito de os dois lados estarem na mesma máquina, e não do protocolo.
2. **A janela funciona no iPhone real:** com o destinatário lento, ela limitou o envio (31 pausas) e parou em exatamente 8 MiB.
3. **Latência sob carga:** a mediana sobe de cerca de 5 ms para cerca de 17 ms e o p95 chega a cerca de 100 ms. Um cancelamento ou uma confirmação podem levar até cerca de 100 ms para atravessar o `controle` durante a transferência, valor aceitável para a interface. O tempo real do cancelamento é medido no P7.
4. No Safari, a memória da aba não pode ser medida (API indisponível), como previsto.

## P6 — SHA-256 incremental e falhas provocadas (2026-11-17)

**Implementação:**
- Biblioteca candidata `hash-wasm` 4.12.0, baixada com aprovação do desenvolvedor. Só o arquivo de SHA-256 entrou no repositório, em `publico/vendor/hash-wasm/`, com a origem e o SHA-256 registrados.
- O remetente calcula o hash **durante a leitura**, em partes de 1 MiB, e o envia em `arquivo-concluido`.
- O destinatário calcula o hash dos blocos na ordem em que chegam e compara.
- O arquivo só é oferecido para download depois de `arquivo-verificado`. Em caso de divergência: `arquivo-falhou`, descarte dos dados e nenhum download.
- Falhas provocadas, aplicadas ao bloco do meio: **corromper um bloco** (inverte o primeiro byte, depois de o conteúdo original entrar no hash) e **pular um bloco**.

**Testes automáticos:**

| Teste | Resultado |
|---|---|
| Vetores de teste do SHA-256 (vazio, "abc", 448 bits) e cálculo em partes igual ao cálculo de uma vez (Node) | ✅ |
| Arquivo de 10 MiB lido em blocos de 16.368 bytes, no Node | ✅ hash igual ao de referência |
| 10 MiB e 100 MiB entre duas abas | ✅ hash do remetente igual ao de referência; destinatário verificou |
| Velocidade do hash no Chrome (remetente) | 10 MiB em 40 ms (248 MiB/s); 100 MiB em 424 ms (236 MiB/s) |
| Bloco corrompido | ✅ detectado: "SHA-256 divergente"; nada oferecido para download |
| Bloco pulado | ✅ detectado: "bloco fora de ordem: esperado 320, recebido 321"; nada oferecido para download |
| Transferência normal depois das falhas | ✅ |

**Constatações:**
1. **O hash incremental não é gargalo:** cerca de 240 MiB/s no Chrome, contra 15 a 30 MiB/s de transferência.
2. **As duas camadas de verificação são complementares:** a sequência dos blocos detecta perda e desordem na hora; o SHA-256 detecta conteúdo alterado no fim.
3. A latência do `controle` durante a transferência de 100 MiB se manteve: mediana de 14,4 ms, p95 de 25,7 ms (mesma máquina).

### Pendências

- Confirmar a causa do item 4, desativando temporariamente a ocultação do IP local no Chrome do PC-1 (teste opcional) ou validando a conexão via TURN no P10.
- O tempo de ida e volta do par selecionado não apareceu no Chrome. A latência do canal `controle` será medida diretamente pela aplicação no P3, o que é mais confiável para o experimento.
