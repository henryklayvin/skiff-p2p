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
   - Possível causa: economia de energia do Wi-Fi no iPhone ou tela bloqueando.
   - A observar nos testes de transferência da Fase D.

4. **O emulador não conecta ao PC-1 por conexão direta. Causa provável: mDNS.**
   - Por privacidade, o Chrome não publica o IP local no SDP: troca-o por um nome temporário do tipo `xxxx.local` (mDNS), que só pode ser resolvido na mesma rede local física.
   - O emulador fica numa rede virtual própria, atrás do PC-1. Ele não resolve esse nome, e o PC-1 não alcança o endereço interno do emulador.
   - Restaria o caminho pelo IP público dos dois lados (`srflx`), que depende de o roteador permitir *hairpin NAT*; neste caso, não funcionou.
   - **É uma limitação do emulador**, não do produto: um Android físico no mesmo Wi-Fi resolve mDNS, como aconteceu com o IOS-1.
   - **O TURN local (P10) deve resolver esse caso**, porque os dois lados alcançam o coturn no IP de rede do PC-1.

### Pendências

- Confirmar a causa do item 4, desativando temporariamente a ocultação do IP local no Chrome do PC-1 (teste opcional) ou validando a conexão via TURN no P10.
- O tempo de ida e volta do par selecionado não apareceu no Chrome. A latência do canal `controle` será medida diretamente pela aplicação no P3, o que é mais confiável para o experimento.
