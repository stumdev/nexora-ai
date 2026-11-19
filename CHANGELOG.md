# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-11-18

### Adicionado
- CLI no terminal (Ink) com chat em streaming, Markdown, diffs e atalhos.
- Interface web (React + Vite + Tailwind) com sidebar, painel de artefatos e tema claro/escuro.
- Servidor local (Hono + SSE) que serve a web, somente em localhost.
- Agente com tool calling: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `TodoWrite`, `Finance` e `Poster`.
- Permissões antes de `Write`, `Edit` e `Bash`.
- Provider Groq com fallback automático de modelos em caso de erro 429.
- 12 comandos de negócio em `skills/` (`/ideia`, `/plano`, `/publico`, `/nomes`, `/marketing`, `/post`, `/financeiro`, `/metas`, `/melhorar`, `/comparar`, `/cartaz`, `/demo`).
- Histórico de conversas em SQLite, compartilhado entre CLI e web.
- Testes unitários (Vitest) e ponta a ponta (Playwright).
