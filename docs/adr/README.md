# Registros de decisões arquiteturais (ADRs)

Um **ADR** (*Architecture Decision Record*) é um documento curto que registra uma decisão importante de arquitetura: o contexto, a decisão, a justificativa, as consequências e as alternativas consideradas.

**Regras:**
- ADRs são numerados em sequência e **não são reescritos** depois de aceitos.
- **Refinamentos feitos antes de a decisão ser implementada** podem ser incorporados ao próprio ADR, desde que registrados na seção "Revisões", com data e descrição. Exemplos: ajustes de revisão, esclarecimentos, correção de cálculos.
- **Mudanças de direção**, ou mudanças em decisões já implementadas, exigem um **novo ADR**. O status do antigo passa a ser "Substituído pelo ADR NNNN".
- Antes de propor uma mudança de arquitetura, tecnologia ou protocolo, consulte os ADRs relacionados.
- **Parâmetros experimentais** não são decisões definitivas. Os ADRs os registram como valores iniciais e indicam como serão validados.

**Status possíveis:** Proposto, Aceito, Substituído, Descontinuado.

## Índice por assunto

### Processo
| ADR | Título | Status |
|---|---|---|
| [0001](0001-registro-de-decisoes-arquiteturais.md) | Registro de decisões arquiteturais | Aceito |
| [0009](0009-idioma-e-nomenclatura.md) | Idioma e nomenclatura | Aceito |

### Tecnologias e estrutura
| ADR | Título | Status |
|---|---|---|
| [0002](0002-tecnologias-do-projeto.md) | Tecnologias do projeto | Aceito |
| [0003](0003-monolito-modular.md) | Monólito modular | Aceito |
| [0006](0006-ausencia-de-banco-de-dados-no-mvp.md) | Ausência de banco de dados no MVP | Aceito |

### Comunicação e conectividade
| ADR | Título | Status |
|---|---|---|
| [0004](0004-comunicacao-por-websocket.md) | Comunicação por WebSocket | Aceito |
| [0005](0005-webrtc-e-turn.md) | WebRTC e utilização de TURN | Aceito |

### Segurança e transferência
| ADR | Título | Status |
|---|---|---|
| [0007](0007-pareamento-e-autorizacao.md) | Pareamento e autorização | Aceito (valores dos limites sob validação) |
| [0008](0008-transferencia-e-integridade.md) | Transferência e integridade | Aceito (parâmetros experimentais) |

## Modelo

```markdown
# NNNN — Título

- **Status:** Proposto | Aceito | Substituído pelo ADR NNNN
- **Data:** AAAA-MM-DD

## Contexto
Qual problema ou necessidade motivou a decisão.

## Decisão
O que foi decidido.

## Justificativa
Por que essa opção foi escolhida.

## Consequências
O que ganhamos, o que pagamos e o que passa a ser exigido.

## Alternativas consideradas
Opções avaliadas e motivos da rejeição.

## Validação pendente (quando houver)
O que ainda precisa ser confirmado por experimento ou teste.

## Revisões (quando houver)
- AAAA-MM-DD: refinamento feito antes da implementação.
```
