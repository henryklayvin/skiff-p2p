# 0001 — Registro de decisões arquiteturais

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O Skiff P2P terá decisões técnicas que afetam segurança, privacidade e a forma de trabalhar: arquitetura P2P, ausência de banco de dados, modelo de pareamento, protocolo de transferência. O desenvolvimento acontecerá em várias etapas e sessões, inclusive com auxílio do Claude Code.

Sem um registro, as decisões tendem a ser esquecidas, reabertas sem motivo ou contrariadas aos poucos.

## Decisão

Registrar as decisões arquiteturais relevantes em ADRs dentro de `docs/adr/`, seguindo o modelo descrito em `docs/adr/README.md`.

- Cada ADR tem número sequencial, status e data.
- ADRs aceitos não são reescritos. Mudanças de direção, ou em decisões já implementadas, geram um novo ADR que substitui o anterior.
- Refinamentos feitos antes da implementação podem ser incorporados ao próprio ADR, registrados na seção "Revisões".
- Parâmetros experimentais são registrados como valores iniciais, acompanhados de uma seção de validação pendente.

## Justificativa

- Torna explícitos o contexto e as alternativas de cada decisão, não só o resultado.
- Serve de referência para sessões futuras e evita que o projeto perca a direção.
- O histórico de decisões é material útil para portfólio e entrevistas técnicas.

## Consequências

- Mudanças de arquitetura, tecnologia ou protocolo exigem escrever ou atualizar ADRs.
- O `CLAUDE.md` exige a consulta aos ADRs antes de propor mudanças.
- Pequeno custo de escrita em cada decisão relevante.

## Alternativas consideradas

- **Registrar decisões só no README ou em um documento único:** mistura decisões com descrição do sistema e perde o histórico das mudanças.
- **Não registrar:** risco alto de deriva arquitetural.

## Revisões

- **2026-11-17 (revisão da Etapa 0):** incluída a regra de "Revisões" para refinamentos feitos antes da implementação.
