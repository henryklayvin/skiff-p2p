# 0002 — Tecnologias do projeto

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O Skiff P2P precisa de:
- um backend para coordenar sessões e sinalização;
- um frontend web responsivo capaz de executar WebRTC;
- um servidor STUN/TURN.

O projeto é um portfólio de Backend Java, desenvolvido por um estudante, e deve evitar complexidade desnecessária.

## Decisão

**Backend**
- **Java 21** (versão LTS).
- **Spring Boot**: versão estável compatível com Java 21, escolhida no momento da criação do projeto (Etapa 2).
- **Maven** como ferramenta de build, com o Maven Wrapper (`mvnw`).
- **Spring MVC** (modelo servlet), com *virtual threads* do Java 21 habilitadas.
- **WebSocket do Spring** (`spring-boot-starter-websocket`), sem STOMP e sem SockJS (ver [ADR 0004](0004-comunicacao-por-websocket.md)).
- Testes com **JUnit 5**, **AssertJ**, **Mockito** e **Spring Boot Test**.

**Frontend**
- **React** com **TypeScript** (modo `strict`) e **Vite**.
- **CSS Modules** para estilos.
- Motor de WebRTC e de transferência em **TypeScript puro**, sem dependência do React (`frontend/src/nucleo/`).
- Testes com **Vitest** e testes ponta a ponta com **Playwright**.

**Infraestrutura**
- **coturn** para STUN e TURN.
- **Docker** para executar a infraestrutura local.
- **VPS com HTTPS** para a futura disponibilização pública.

**Bibliotecas candidatas**, **sem aprovação para inclusão**. Cada uma só poderá ser adicionada com justificativa e aprovação explícita na etapa correspondente:
- **Bucket4j**, para limites de tentativas (Etapa 3);
- **hash-wasm**, para SHA-256 incremental no navegador (Etapa 1 ou Etapa 9).

## Justificativa

- **Java 21 e Spring Boot:** padrão de mercado para backend Java. O Java 21 traz `record`, `sealed interface` e *pattern matching*, úteis para modelar mensagens, além das *virtual threads*.
- **Maven:** familiar ao desenvolvedor, declarativo e muito comum em projetos Java.
- **Spring MVC com virtual threads, em vez de WebFlux:** o modelo "uma requisição, uma thread" é mais simples de entender, depurar e testar. As *virtual threads* tornam esse modelo barato o bastante para a carga prevista.
- **React + TypeScript + Vite:**
  - os tipos tornam o protocolo um contrato verificado pelo compilador;
  - o Vite é simples e rápido;
  - o React tem o maior ecossistema.
- **Motor independente do React:** pode ser testado sem navegador, reaproveitado no futuro, e reduz o impacto de uma eventual troca de framework de interface.
- **CSS Modules:** estilos isolados por componente, sem dependência adicional.
- **coturn:** servidor STUN/TURN open source amplamente usado, com suporte a credenciais temporárias.

## Consequências

- Será preciso aprender a configurar WebSocket no Spring sem a abstração do STOMP.
- O núcleo do frontend precisa de disciplina: nada de React dentro de `nucleo/`.
- O WebKit do Playwright **não substitui** testes no Safari real do iPhone; a matriz manual de dispositivos continua obrigatória.
- Novas bibliotecas exigem justificativa e aprovação. Mudanças de tecnologia principal exigem novo ADR.

## Alternativas consideradas

- **Gradle:** excelente, mas menos familiar ao desenvolvedor.
- **Spring WebFlux:** escala bem conexões simultâneas, mas a programação reativa tem curva de aprendizado alta e não é necessária para a carga prevista.
- **Svelte:** mais leve, com menor mercado.
- **Angular:** robusto, porém pesado para poucas telas.
- **TypeScript sem framework:** a interface de estados (conectando, transferindo, erro) ficaria trabalhosa de manter.
- **Tailwind CSS:** adiciona dependência e convenções próprias sem benefício claro para o tamanho da interface.

## Revisões

- **2026-11-17 (revisão da Etapa 0):** Bucket4j e hash-wasm registradas explicitamente como candidatas sem aprovação para inclusão.
