# Visão do produto

## Problema

Transferir arquivos entre dispositivos de fabricantes e sistemas diferentes ainda é inconveniente:

- Soluções nativas, como o AirDrop, funcionam bem dentro de um mesmo ecossistema, mas não entre todos os sistemas.
- Serviços de nuvem e mensageiros exigem conta, impõem limites de tamanho, podem comprimir mídia e **mantêm uma cópia do arquivo em servidores de terceiros**.
- Cabos e pendrives nem sempre estão disponíveis e têm suporte limitado no iOS.

## Proposta

O **Skiff P2P** é uma aplicação web responsiva para transferir arquivos entre dois dispositivos:

- **sem instalação**: funciona no navegador do computador e do celular;
- **sem conta**: o pareamento é feito com um código temporário;
- **direto entre os dispositivos**: os arquivos trafegam por WebRTC, sem passar pelo servidor de aplicação;
- **com retransmissão quando necessário**: se a rede impedir a conexão direta, um servidor TURN retransmite os dados cifrados, sem armazená-los.

## Público

Pessoas que precisam mover arquivos entre os próprios dispositivos, ou entre dispositivos de pessoas próximas, de forma pontual: fotos do celular para o computador, documentos entre um Android e um iPhone, arquivos entre computadores.

## Princípios

1. **Segurança e privacidade desde o início.** O código curto é conveniência, não segurança. Toda transferência exige consentimento de quem recebe.
2. **Honestidade sobre o caminho dos dados.** O Skiff não armazena arquivos, mas a documentação e a interface devem deixar claro quando os dados passam pela retransmissão do TURN.
3. **Simplicidade.** Nenhuma tecnologia ou componente sem necessidade demonstrada.
4. **Compatibilidade real com dispositivos móveis.** As limitações dos navegadores, especialmente no iOS, são tratadas e comunicadas, não escondidas.

## Jornada do usuário (planejada)

1. **Ana** abre o Skiff no computador e cria uma sessão. A tela mostra um código, por exemplo `K7F4-3QXM`, e o tempo restante até ele expirar.
2. **Ana** abre o Skiff no celular e digita o código.
3. O computador exibe "Android · Chrome quer se conectar". Ana **aprova**.
4. Os dispositivos se conectam. A interface indica se a conexão é **direta** ou **retransmitida**.
5. No celular, Ana escolhe três fotos para enviar.
6. O computador mostra o nome, o tamanho e o tipo de cada arquivo, e Ana **aceita** o recebimento.
7. Os dois aparelhos mostram o progresso. Ao final, cada arquivo é verificado (SHA-256) e fica disponível para download.
8. Qualquer um dos lados pode cancelar a transferência ou encerrar a sessão a qualquer momento.

O pareamento é **simétrico**: depois de conectados, qualquer um dos dois dispositivos pode enviar arquivos, e quem recebe sempre precisa consentir.

## Escopo do MVP

**Pareamento**
- Criação de sessão com código de pareamento de 8 caracteres.
- Entrada na sessão pelo código, com aprovação do criador.
- Expiração do código e da sessão, uso único do código e limites de tentativas.
- No máximo dois participantes. Qualquer lado pode encerrar a sessão.

**Conexão**
- Sinalização por WebSocket, mantida durante a sessão.
- Conexão WebRTC com STUN e retransmissão pelo TURN.
- Indicação visual do estado da conexão e do tipo (direta ou retransmitida).

**Transferência**
- Envio de um ou mais arquivos, transferidos em sequência.
- Consentimento do destinatário para cada arquivo, antes de qualquer transmissão.
  - A opção "Aceitar todos os arquivos" é permitida depois que a lista completa é exibida, com confirmação explícita.
  - Arquivos adicionados depois exigem novo consentimento.
- Progresso baseado em bytes confirmados pelo destinatário.
- Cancelamento por qualquer um dos lados.
- Verificação de integridade com SHA-256. O arquivo só é considerado concluído após a verificação.
- Download forçado: o arquivo recebido nunca é aberto automaticamente.
- Limite de tamanho por plataforma, com mensagem clara (valores a definir por testes).
- Aviso para manter a página aberta e tentativa de manter a tela ligada durante a transferência.

**Qualidade**
- Testes automatizados no backend e no motor de transferência.
- Matriz de testes manuais em dispositivos reais.
- Documentação de arquitetura, segurança e decisões (ADRs).

## Planejado para versões futuras

As prioridades serão reavaliadas após o MVP:

- Pareamento por **QR Code**.
- Verificação de autenticidade por código comparado nos dois aparelhos (SAS), contra servidor de sinalização comprometido.
- *ICE restart* automático em troca de rede (ex.: Wi-Fi para 4G).
- Gravação dos arquivos recebidos em fluxo direto no disco, para arquivos muito grandes.
- Retomada de transferências interrompidas.
- Modo "somente retransmissão", que esconde o IP de cada dispositivo do outro.
- Instalação como PWA e integração com o menu "Compartilhar" do sistema.
- Envio de pastas e sessões com mais de dois dispositivos.
- Interface em outros idiomas.
- Aplicativos nativos.

## Fora do escopo do MVP

- Contas de usuário, login ou perfis.
- Histórico de transferências.
- Armazenamento de arquivos no servidor, inclusive temporário.
- Transferência garantida em segundo plano em celulares (os navegadores móveis não permitem garantir isso).
- Banco de dados, filas de mensagens, armazenamento de objetos ou microsserviços.
- Escalabilidade horizontal (múltiplas instâncias do backend).

## Limitações conhecidas

- **Segundo plano:** no iOS, e em menor grau no Android, a página pode ser suspensa quando o usuário troca de aplicativo ou bloqueia a tela, e a transferência é interrompida.
- **Tamanho de arquivo:** depende da memória e das APIs de armazenamento disponíveis em cada navegador. Não haverá promessa de transferência ilimitada.
- **Redes restritivas:** em algumas redes, a conexão só será possível pela retransmissão do TURN, com velocidade e custo de banda dependentes desse servidor.
- **Navegadores no iOS:** todos usam o motor WebKit, então "Chrome no iPhone" se comporta como Safari para efeitos do Skiff.
