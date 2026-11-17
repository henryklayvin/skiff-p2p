# Registro de dispositivos

Preencha **antes da Fase D** (testes móveis). Atualize a tabela se algum sistema ou navegador for atualizado durante o experimento, porque o comportamento do WebRTC muda entre versões.

**Onde encontrar as versões:**
- **iPhone:** *Ajustes > Geral > Sobre* (versão do iOS). A versão do Safari acompanha a do iOS.
- **Android:** *Configurações > Sobre o telefone*. No Chrome: *⋮ > Configurações > Sobre o Chrome*.
- **Computador:** sistema em *Configurações > Sistema > Sobre*; navegador em `chrome://version`, `about:support` (Firefox) ou equivalente.

> **Atenção:** a identificação do navegador (*user agent*) **não** é uma fonte confiável de versões.
> - O Chrome reduz o *user agent*: no Android, informa sempre "Android 10; K", sem o modelo real nem a versão real do sistema; e a versão do navegador aparece como `157.0.0.0`, sem o número completo.
> - O Safari do iOS 26 mantém "iPhone OS 18_7" no *user agent*, independentemente da versão real.
>
> Por isso, as versões abaixo devem vir das telas de configuração.

| Identificador | Tipo | Fabricante e modelo | Sistema e versão | Navegador e versão | Rede usada | Observações |
|---|---|---|---|---|---|---|
| PC-1 | Computador | *a informar* | Windows 11 Pro | Chrome 157 (versão completa *a informar*) | Ethernet, IP dinâmico (192.168.1.2 no P1; 192.168.1.4 a partir do P2) | Servidor HTTPS do protótipo |
| AND-1 | **Emulador Android** (Android Studio), executado no PC-1 | Imagem do emulador: *a informar* | *a informar* (versão do Android e nível de API) | Chrome 157 (versão completa *a informar*) | Rede virtual do emulador, via PC-1 | Compartilha CPU, memória e rede com o PC-1 |
| IOS-1 | iPhone | *a informar* | *a informar* (provavelmente iOS 26.6.1, conforme `Version/26.6.1`) | Safari | Wi-Fi da mesma rede | |

Use os identificadores (`PC-1`, `AND-1`, `IOS-1`) nos registros de medição e no relatório.

**Android sem aparelho físico (decisão de 2026-11-17).**
- O AND-1 é um emulador. Ele vale para os testes de conexão e funcionamento.
- Memória, Wake Lock e segundo plano no Android **não** são validados em aparelho físico nesta etapa.
- A rede do emulador sai pelo PC-1, então os testes entre PC-1 e AND-1 não passam pelo Wi-Fi.

## Diagnóstico do navegador (P1, 2026-11-17)

Resultado da página de diagnóstico (`https://192.168.1.2:8443/`), informado pelo desenvolvedor. Em todos os aparelhos, a página abriu **sem alerta de certificado** depois da configuração correta da CA local (confirmado pelo desenvolvedor).

| Item | PC-1 (Chrome) | AND-1 (Chrome) | IOS-1 (Safari) |
|---|---|---|---|
| Contexto seguro (HTTPS) | Disponível | Disponível | Disponível |
| RTCPeerConnection | Disponível | Disponível | Disponível |
| RTCDataChannel | Disponível | Disponível | Disponível |
| `Blob.slice` / `Blob.stream` | Disponível | Disponível | Disponível |
| WebAssembly | Disponível | Disponível | Disponível |
| `crossOriginIsolated` | Disponível | Disponível | Disponível |
| `measureUserAgentSpecificMemory` | Disponível | Disponível | **Indisponível** |
| OPFS (`navigator.storage.getDirectory`) | Disponível | Disponível | Disponível |
| File System Access (`showSaveFilePicker`) | Disponível | Disponível | **Indisponível** |
| Screen Wake Lock | Disponível | Disponível | Disponível |

**Observações:**
- A página só confirma que **a função existe**. O funcionamento real é testado nos passos seguintes: OPFS e File System Access no P8, Wake Lock no P9.
- No iPhone, a ausência de `measureUserAgentSpecificMemory` confirma o que já estava previsto: a memória no iOS será avaliada por sinais indiretos.
- O `showSaveFilePicker` aparecer disponível no Chrome do Android é um resultado a confirmar no P8, porque o suporte a essa API em celulares é recente.
