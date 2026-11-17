# Arquivos de teste

Arquivos gerados em 2026-11-17 com conteúdo aleatório (`/dev/urandom`). Eles ficam fora do repositório, em `%USERPROFILE%\skiff-experimento\arquivos-de-teste\`.

As unidades são binárias: 1 MiB = 1.048.576 bytes. Os nomes dos documentos usam "10 MB", "50 MB" etc., mas os arquivos têm o tamanho exato em MiB/GiB indicado abaixo.

| Arquivo | Tamanho (bytes) | SHA-256 |
|---|---:|---|
| `teste-10mib.bin` | 10.485.760 | `5ebbab75a6fade408bcc1a88b75dbe2067af55632bad7c339a00bfd9f740a008` |
| `teste-50mib.bin` | 52.428.800 | `fef350b0dacf6afbdc1acd5b9b3f9ff7f0a891ac519c1a2a003f9cf0baa56423` |
| `teste-100mib.bin` | 104.857.600 | `02bb0d253b8ae1ce4bb301d8def993b9d1fcc4bb180b0f85aef6f5b20f4a248b` |
| `teste-1gib.bin` | 1.073.741.824 | `539d92b6e87f4f8f5d3fec13352cfc8287ee0e6a55925cccb9ec3cd38b964c1e` |

**Uso nas validações:** o SHA-256 calculado pelo destinatário deve ser idêntico ao desta tabela. Para conferir um arquivo baixado no computador:

```bash
sha256sum caminho/do/arquivo-recebido
```

Se os arquivos forem gerados novamente, os hashes mudam e esta tabela precisa ser atualizada.
