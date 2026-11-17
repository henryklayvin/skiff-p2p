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

### Pendências

- Confirmar a causa do item 4, desativando temporariamente a ocultação do IP local no Chrome do PC-1 (teste opcional) ou validando a conexão via TURN no P10.
- O tempo de ida e volta do par selecionado não apareceu no Chrome. A latência do canal `controle` será medida diretamente pela aplicação no P3, o que é mais confiável para o experimento.
