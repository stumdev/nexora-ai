# Política de Segurança

## Reportando uma vulnerabilidade

Se encontrou uma falha de segurança, **não abra uma issue pública**. Use o recurso [Report a vulnerability](https://github.com/stumdev/nexora-ai/security/advisories/new) do GitHub.

## Boas práticas ao usar a Nexora

- A chave da Groq fica só no seu computador (`~/.nexora/config.json` ou `GROQ_API_KEY`). Nunca a compartilhe nem a coloque em commits.
- O servidor web aceita conexões apenas de `localhost`.
- Revise os comandos e diffs antes de aprovar `Bash`, `Write` e `Edit`.
