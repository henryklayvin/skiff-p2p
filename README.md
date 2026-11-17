# Skiff P2P

Transferência de arquivos entre dispositivos diferentes (computadores, Android e iOS) pelo navegador, sem instalação e sem conta. Os arquivos trafegam **diretamente entre os dispositivos** via WebRTC.

> **Estado atual: fase de fundação (Etapa 0).**
> Este repositório contém, por enquanto, **apenas documentação e decisões de arquitetura**.
> **Nenhuma funcionalidade foi implementada ainda.** O código do backend e do frontend será criado nas próximas etapas do [plano de desenvolvimento](docs/plano-de-desenvolvimento.md).

## O problema

Mover um arquivo do celular para o computador, ou entre aparelhos de sistemas diferentes, costuma exigir:
- uma conta em algum serviço;
- o envio de uma cópia para a nuvem de terceiros, com limites de tamanho e compressão de mídia;
- ou cabos e aplicativos específicos de cada fabricante.

O Skiff P2P propõe outro caminho: abrir uma página nos dois aparelhos, pareá-los com um código e enviar o arquivo diretamente de um para o outro.

## Como vai funcionar (planejado)

1. O primeiro dispositivo cria uma sessão e recebe um **código de pareamento** de 8 caracteres.
2. O segundo dispositivo digita o código. Quem criou a sessão **aprova** a conexão.
3. Os navegadores trocam informações de conexão por meio do servidor do Skiff (**sinalização**) e abrem um canal **WebRTC** direto entre si.
4. Quem envia escolhe os arquivos. Quem recebe vê nome, tamanho e tipo e **consente** antes de qualquer transferência.
5. Os arquivos são enviados em blocos, com confirmação de recebimento, progresso e verificação de integridade (SHA-256).

## Privacidade: o que passa por onde

- **Conexão direta (P2P):** os bytes dos arquivos vão apenas de um dispositivo ao outro. O servidor do Skiff só participa da sinalização.
- **Retransmissão (TURN Relay):** em algumas redes (como as de celular com CGNAT ou redes corporativas), a conexão direta é impossível. Nesse caso, os dados passam por um servidor TURN:
  - continuam **cifrados de ponta a ponta** (DTLS), e o TURN não consegue lê-los;
  - **não são armazenados**;
  - mas o TURN observa metadados, como endereços IP, horários e volume de dados.
- O servidor de aplicação do Skiff **nunca recebe nem armazena** os arquivos transferidos.

Detalhes e limitações estão no [modelo de ameaças](docs/seguranca/modelo-de-ameacas.md).

## Limitações conhecidas

- **Mantenha a página aberta durante a transferência.** Navegadores móveis, especialmente no iOS, suspendem páginas em segundo plano, e a transferência é interrompida. A aplicação vai tentar manter a tela ligada quando o navegador permitir, mas isso **não garante** execução em segundo plano.
- O tamanho máximo de arquivo dependerá do navegador e do dispositivo. Os limites serão definidos com base em testes.

## Tecnologias previstas

| Parte | Tecnologias |
|---|---|
| Backend | Java 21, Spring Boot, Maven, Spring MVC, WebSocket |
| Frontend | React, TypeScript, Vite, CSS Modules |
| Transferência | WebRTC DataChannel, ICE, STUN, TURN |
| Infraestrutura | coturn, Docker (desenvolvimento local), VPS com HTTPS (futuro) |

O backend não usa banco de dados no MVP. O estado das sessões é temporário e fica em memória. As justificativas estão nos [ADRs](docs/adr/README.md).

## Estrutura do repositório

Situação atual:

```
skiff-p2p/
├── CLAUDE.md          # orientações para sessões do Claude Code
├── README.md
├── LICENSE
└── docs/
    ├── adr/           # registros de decisões arquiteturais
    ├── arquitetura/
    ├── produto/
    ├── seguranca/
    └── plano-de-desenvolvimento.md
```

Diretórios previstos para as próximas etapas: `backend/`, `frontend/` e `infra/`.

## Documentação

- [Visão do produto](docs/produto/visao-do-produto.md)
- [Arquitetura geral](docs/arquitetura/arquitetura-geral.md)
- [Modelo de ameaças](docs/seguranca/modelo-de-ameacas.md)
- [Plano de desenvolvimento](docs/plano-de-desenvolvimento.md)
- [Decisões arquiteturais (ADRs)](docs/adr/README.md)

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
