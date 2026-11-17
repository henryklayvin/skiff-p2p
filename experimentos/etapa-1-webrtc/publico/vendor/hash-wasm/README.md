# hash-wasm (código de terceiros)

Biblioteca **candidata**, avaliada só neste protótipo descartável (ADR 0008). **Não está aprovada para o produto.**

| Item | Valor |
|---|---|
| Pacote | `hash-wasm` |
| Versão | 4.12.0 (publicada em 2024-11-19) |
| Licença | MIT (ver `LICENSE`, texto original) |
| Origem | Registro npm, obtido com `npm pack hash-wasm@4.12.0` em 2026-11-17 |
| Integridade do pacote (npm) | `sha512-+/2B2rYLb48I/evdOIhP+K/DD2ca2fgBjp6O+GBEnCDk2e4rpeXIK8GvIyRPjTezgmWn9gmKwkQjjx6BtqDHVQ==` |
| Arquivo usado | `dist/sha256.umd.min.js` (só SHA-256, 18.616 bytes) |
| SHA-256 de `sha256.umd.min.js` | `ed7f5896b41aba98909ab143264c5b2ae5c81abf2e47f08dd2d1c0d02ce623de` |
| SHA-256 de `LICENSE` | `c14dea172f72f2714284a0ac2ab1b00b5352a01409d58255a46227ffc541debd` |

**Verificações feitas antes de incluir:**
- A integridade do pacote confere com a publicada no registro npm.
- O arquivo não contém chamadas de rede (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) nem execução dinâmica de código (`eval`, `new Function`, `import()`).
- O arquivo expõe o global `hashwasm` com a função `createSHA256`.

O arquivo compila WebAssembly. Por isso a CSP do servidor do experimento permite `'wasm-unsafe-eval'`, sem liberar `eval()` de JavaScript.

**Não edite estes arquivos.** Para trocar de versão, repita a obtenção e atualize esta tabela.
