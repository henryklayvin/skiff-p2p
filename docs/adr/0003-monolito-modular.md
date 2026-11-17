# 0003 — Monólito modular

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O backend do Skiff P2P tem poucas responsabilidades:
- sessões e pareamento;
- sinalização;
- credenciais do TURN;
- segurança transversal (limites de tentativas, verificação de origem).

Todas compartilham o mesmo estado: as sessões ativas. A carga esperada é baixa e o projeto é mantido por uma pessoa.

## Decisão

Construir o backend como um **único serviço Spring Boot**, implantado como uma unidade, com o código organizado em **pacotes por funcionalidade** sob `io.github.henryklayvin.skiff`:

| Pacote | Responsabilidade |
|---|---|
| `pareamento` | Sessões, códigos, tokens, pedidos de entrada, expiração |
| `sinalizacao` | WebSocket, validação e repasse de mensagens |
| `ice` | Configuração ICE e credenciais temporárias do TURN |
| `seguranca` | Limites de tentativas, `Origin`, cabeçalhos, IP do cliente |
| `compartilhado` | Erros, parâmetros, `Clock`, utilitários |

**Regras de dependência:**
- Cada pacote expõe um conjunto pequeno de classes públicas e mantém os detalhes internos com visibilidade de pacote sempre que possível.
- `compartilhado` não depende de nenhum outro pacote do projeto.
- Dependências circulares entre pacotes não são permitidas.

## Justificativa

- **Microsserviços não se justificam aqui:** eles trariam rede entre serviços, estado distribuído, implantação múltipla e observabilidade distribuída, sem nenhum requisito que os exija.
- **Por funcionalidade, e não por camada** (`controller/`, `service/`, `repository/`): o que muda junto fica junto. Para entender o pareamento, abre-se um único pacote.
- Os limites entre pacotes deixam o código preparado para uma eventual separação futura, sem pagar esse custo agora.

## Consequências

- Uma única aplicação para executar, testar e implantar.
- A disciplina de dependências entre pacotes precisa ser mantida nas revisões. Pode ser verificada por testes de arquitetura no futuro, se houver necessidade.
- Com o estado em memória ([ADR 0006](0006-ausencia-de-banco-de-dados-no-mvp.md)), o serviço roda como **uma única instância**.

## Alternativas consideradas

- **Microsserviços** (ex.: um serviço de pareamento e outro de sinalização): complexidade operacional sem benefício para a escala e a equipe atuais.
- **Organização por camadas técnicas:** espalha cada funcionalidade por vários diretórios e dificulta a leitura.
- **Módulos Maven separados:** isolamento mais forte, mas burocracia desnecessária para um backend deste tamanho. Pode ser reavaliado se o código crescer.
