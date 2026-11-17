# Experimento técnico de WebRTC — Etapa 1

> ⚠️ **Protótipo descartável.**
> Este diretório existe apenas para validar premissas técnicas da Etapa 1. Ele **não faz parte** do código definitivo do Skiff P2P, não deve ser importado por ele e não segue todos os padrões de produção.
> Roteiro, decisões e critérios de aceite: [`docs/plano-de-desenvolvimento.md`](../../docs/plano-de-desenvolvimento.md), seção "Etapa 1".

## Situação

| Passo | Descrição | Situação |
|---|---|---|
| P0 | Preparação: arquivos de teste, CA local, certificados, registros | Concluído |
| P1 a P11 | Servidor HTTPS, protótipo, coturn, testes e relatório | Pendentes |

## Arquivos deste diretório

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Este documento |
| `arquivos-de-teste.md` | Tamanhos e SHA-256 dos arquivos de teste |
| `registro-de-dispositivos.md` | Dispositivos usados nos testes (preencher antes da Fase D) |

## O que fica fora do repositório

Tudo abaixo fica em `%USERPROFILE%\skiff-experimento\` (no Git Bash: `~/skiff-experimento/`) e **nunca** deve ser copiado para o repositório:

| Caminho | Conteúdo |
|---|---|
| `arquivos-de-teste/` | Arquivos aleatórios de 10 MiB, 50 MiB, 100 MiB e 1 GiB, e `sha256.txt` |
| `certificados/ca-skiff-experimento.key` | **Chave privada da CA local (sensível)** |
| `certificados/ca-skiff-experimento.crt` | Certificado da CA (PEM) |
| `certificados/ca-skiff-experimento.cer` | Certificado da CA (DER), para instalar nos celulares |
| `certificados/servidor.key` | **Chave privada do servidor (sensível)** |
| `certificados/servidor.crt` | Certificado do servidor |

## Reproduzir a preparação (P0)

Comandos para o **Git Bash**. O OpenSSL usado foi a versão 3.5.

### 1. Arquivos de teste

```bash
BASE="$HOME/skiff-experimento/arquivos-de-teste"
mkdir -p "$BASE" && cd "$BASE"
head -c $((10*1024*1024))   /dev/urandom > teste-10mib.bin
head -c $((50*1024*1024))   /dev/urandom > teste-50mib.bin
head -c $((100*1024*1024))  /dev/urandom > teste-100mib.bin
head -c $((1024*1024*1024)) /dev/urandom > teste-1gib.bin
sha256sum teste-*.bin | tee sha256.txt
```

Os arquivos são aleatórios, então uma nova geração produz **hashes diferentes**. Se os arquivos forem recriados, atualize `arquivos-de-teste.md`.

### 2. CA local e certificado do servidor

Ajuste `IP_REDE` e `SUBREDE` se o IP do computador mudar. Por exemplo, se o DHCP atribuir outro endereço, será preciso **gerar novamente o certificado do servidor**.

```bash
export MSYS_NO_PATHCONV=1   # impede o Git Bash de converter "/CN=..." em caminho do Windows
IP_REDE="192.168.1.2"
SUBREDE="192.168.1.0/255.255.255.0"
DIR="$HOME/skiff-experimento/certificados"
mkdir -p "$DIR" && cd "$DIR"

# CA local: EC P-256, 180 dias, restrita à sub-rede local e a localhost (name constraints)
openssl ecparam -name prime256v1 -genkey -noout -out ca-skiff-experimento.key
openssl req -x509 -new -key ca-skiff-experimento.key -sha256 -days 180 \
  -subj "/CN=Skiff P2P - CA local do experimento" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" \
  -addext "nameConstraints=critical,permitted;IP:${SUBREDE},permitted;IP:127.0.0.1/255.255.255.255,permitted;DNS:localhost" \
  -out ca-skiff-experimento.crt

# Certificado do servidor: EC P-256, 90 dias, válido para o IP da rede, 127.0.0.1 e localhost
openssl ecparam -name prime256v1 -genkey -noout -out servidor.key
openssl req -new -key servidor.key -subj "/CN=${IP_REDE}" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=serverAuth" \
  -addext "subjectAltName=IP:${IP_REDE},IP:127.0.0.1,DNS:localhost" \
  -out servidor.csr
openssl x509 -req -in servidor.csr -CA ca-skiff-experimento.crt -CAkey ca-skiff-experimento.key \
  -CAcreateserial -days 90 -sha256 -copy_extensions copyall -out servidor.crt

# Cópia DER da CA, para instalar nos celulares
openssl x509 -in ca-skiff-experimento.crt -outform der -out ca-skiff-experimento.cer
rm -f servidor.csr
```

### 3. Verificação

```bash
cd "$HOME/skiff-experimento/certificados"
openssl verify -CAfile ca-skiff-experimento.crt servidor.crt
openssl x509 -in servidor.crt -noout -ext subjectAltName,extendedKeyUsage
openssl x509 -in ca-skiff-experimento.crt -noout -ext nameConstraints
```

## Instalação da CA nos celulares (antes da Fase D)

Transfira **apenas** `ca-skiff-experimento.cer`, nunca os arquivos `.key`.

- **iPhone:**
  1. Abra o arquivo e instale o perfil em *Ajustes > Geral > VPN e Gerenciamento de Dispositivo*.
  2. Ative a confiança em *Ajustes > Geral > Sobre > Ajustes de Confiança de Certificados*.
- **Android:** *Configurações > Segurança > Criptografia e credenciais > Instalar um certificado > Certificado de CA*. O caminho varia conforme o fabricante.

**Ao final do experimento, remova a CA dos aparelhos** e apague `~/skiff-experimento/certificados/`.
