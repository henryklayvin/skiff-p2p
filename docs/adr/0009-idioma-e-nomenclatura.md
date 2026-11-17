# 0009 — Idioma e nomenclatura

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O projeto é desenvolvido e documentado por um desenvolvedor brasileiro, para um portfólio, com o objetivo de que todas as decisões e todo o código sejam compreensíveis por ele. É preciso definir um idioma único, para evitar misturas inconsistentes, e regras para lidar com nomes obrigatórios de tecnologias.

## Decisão

### Português do Brasil em todo conteúdo produzido pela equipe
- Documentação, interface, comentários e mensagens de log.
- Mensagens de commit.
- Pacotes, classes, métodos, variáveis, constantes e arquivos próprios.
- Endpoints, tipos e campos das mensagens do protocolo.
- Nomes de testes.

### Identificadores em ASCII, sem acentos nem cedilha

| Tipo | Exemplo |
|---|---|
| Pacote Java | `io.github.henryklayvin.skiff.pareamento` |
| Classe | `SessaoDePareamento`, `ServicoDePareamento` |
| Método | `criarSessao()`, `aprovarEntrada()` |
| Teste | `deveInvalidarCodigoAposRecusa()` |
| Endpoint | `/api/sessoes`, `/api/sessoes/entrada` |
| Mensagem do protocolo | `oferta-sdp`, `candidato-ice`, `cancelar-transferencia` |
| Diretório do frontend | `nucleo/transferencia/`, `funcionalidades/pareamento/` |

Textos livres (documentação, interface, comentários, commits) usam acentuação normal.

### Exceções: nomes preservados no original
- Palavras-chave das linguagens.
- APIs, classes, anotações e métodos de terceiros, inclusive os que sobrescrevemos: `WebSocketHandler`, `handleTextMessage`, `RTCPeerConnection`, `@Configuration`.
- Arquivos e diretórios convencionais: `README.md`, `CLAUDE.md`, `LICENSE`, `pom.xml`, `package.json`, `application.yml`, `src/main/java`, `.github/workflows`, `docs/`, `backend/`, `frontend/`.
- Nomes de tecnologias e protocolos: WebRTC, ICE, SDP, STUN, TURN, DTLS, SCTP.
- O texto legal da licença MIT, mantido no original em inglês.
- O nome do projeto: `skiff-p2p`. O nome do produto: Skiff P2P.

### Commits
**Conventional Commits**, com o tipo da convenção e a descrição em português, no imperativo:

```
feat: implementar criação de sessões
fix: invalidar código após recusa do pedido
docs: registrar ADR de pareamento
test: cobrir expiração do código com relógio falso
```

## Justificativa

- Um idioma único reduz a carga cognitiva e torna o código legível para o próprio desenvolvedor e para avaliadores brasileiros.
- **ASCII nos identificadores** evita problemas de codificação, de ferramentas, de URLs e de digitação em teclados diferentes, sem prejudicar a legibilidade.
- **Preservar nomes de terceiros** é obrigatório (APIs e frameworks dependem deles) e evita traduções artificiais de termos técnicos consagrados.
- **Conventional Commits** mantêm um histórico padronizado, e seus tipos (`feat`, `fix`) são parte da convenção, por isso ficam no original.

## Consequências

- O código misturará identificadores em português com APIs em inglês (ex.: `class ManipuladorDeSinalizacao implements WebSocketHandler`). Isso é esperado e aceito.
- Exemplos de documentação e bibliotecas externas estarão em inglês. A adaptação para os nomes do projeto é responsabilidade de quem implementa.
- Contribuições futuras de pessoas que não falam português ficam mais difíceis. Risco aceito, dado o objetivo do projeto.
- Uma eventual internacionalização da interface (futuro) não altera esta decisão sobre o código.

## Alternativas consideradas

- **Código em inglês e documentação em português:** padrão comum no mercado, mas cria duas linguagens no mesmo projeto e dificulta a compreensão pelo desenvolvedor.
- **Identificadores com acentos:** o Java permite, mas aumenta o risco de problemas de codificação e de ferramentas.
- **Tudo em inglês:** contraria o objetivo de compreensão e aprendizado do desenvolvedor.
