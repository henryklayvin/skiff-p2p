# 0006 — Ausência de banco de dados no MVP

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O backend precisa guardar o estado das sessões:
- código de pareamento;
- tokens;
- participantes;
- pedidos de entrada;
- conexões WebSocket;
- datas de expiração;
- contadores de tentativas.

Esse estado dura **minutos**: o código vale 5 minutos e a sessão dura no máximo 60 minutos após o pareamento (valores iniciais). Não existem contas, histórico nem arquivos armazenados.

## Decisão

1. **Sem banco de dados no MVP.** O estado fica **em memória**, em estruturas concorrentes (ex.: `ConcurrentHashMap`).
2. O acesso ao estado passa por uma **interface de repositório** (ex.: `RepositorioDeSessoes`), com uma implementação em memória.
3. **A expiração é automática**, por limpeza periódica e por verificação da validade em cada acesso.
4. **O tempo é sempre obtido de um `java.time.Clock` injetado**, para que expirações sejam testadas sem esperar.
5. **Redis, Kafka, MinIO** ou outros componentes de infraestrutura também não fazem parte do MVP.

## Justificativa

- Um banco de dados resolve persistência e consultas sobre dados duráveis. **Nada no Skiff precisa sobreviver a um reinício**: uma sessão perdida é recriada em segundos.
- Menos componentes significa menos superfície de ataque, menos custo e menos dados pessoais guardados (minimização, LGPD).
- A interface de repositório permite trocar a implementação no futuro sem reescrever o domínio.

## Consequências

- **Um reinício do backend encerra todas as sessões ativas.** Risco aceito: os usuários precisam parear novamente.
- **O backend roda como uma única instância.** Com várias instâncias, cada uma teria um estado diferente, e os dois participantes de uma sessão poderiam estar conectados a instâncias distintas.
- O consumo de memória precisa ser limitado: há um teto global de sessões ativas ([ADR 0007](0007-pareamento-e-autorizacao.md)), cujo valor ainda é uma hipótese a validar.
- Os contadores de limites de tentativas também ficam em memória e são zerados num reinício.

## Quando reavaliar

Esta decisão deve ser revista por um novo ADR somente diante de uma necessidade demonstrada, por exemplo:
- carga que exija mais de uma instância (estado compartilhado, como Redis, com reavaliação dos WebSockets);
- requisitos de persistência (contas, histórico), que estão fora do escopo atual.

## Alternativas consideradas

- **Banco relacional (ex.: PostgreSQL):** persistência sem necessidade e mais um componente para operar e proteger.
- **Redis desde o início:** resolveria várias instâncias, um problema que ainda não existe.
- **Banco embutido (ex.: H2):** acrescenta uma camada sem benefício sobre estruturas em memória para dados efêmeros.
