<div align="center">

<img src="docs/banner.svg" alt="Nexora AI" width="100%">

<br>

[![CI](https://github.com/stumdev/nexora-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/stumdev/nexora-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-B7F34A.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Groq](https://img.shields.io/badge/IA-Groq-F55036)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-B7F34A.svg)](CONTRIBUTING.md)

**Assistente de IA para empreendedores e pequenos negócios, no terminal e no navegador.**

[Instalação](#instalação) · [Comandos](#comandos-de-negócio) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## Sobre

A Nexora ajuda a criar ideias de negócio, planos, público-alvo, nomes e slogans, estratégias de marketing, textos para redes sociais, contas financeiras, metas e melhorias.

> 🎓 Projeto escolar (conceito). A *Nexora Technologies* é uma empresa fictícia.

## Destaques

- 💬 **Duas interfaces, um só código:** CLI estilo Claude Code e web estilo claude.ai.
- 🧮 **Contas de verdade:** a ferramenta `Finance` calcula ponto de equilíbrio, margem e fluxo de caixa em código, sem "chutar".
- 🪄 **12 comandos de negócio** prontos, e você pode criar os seus em Markdown.
- 🖼️ **Cartazes** em SVG/PNG gerados pela IA, no estilo grafite e verde-lima.
- 🔁 **Fallback automático** entre modelos gratuitos da Groq quando o limite acaba.
- 🔒 **Privacidade:** tudo roda localmente, sem telemetria. Você aprova cada escrita de arquivo ou comando.
- 🗂️ **Histórico em SQLite** compartilhado entre terminal e web.

### Como funciona

Em 3 passos:

1. **Você explica** a sua ideia.
2. **A Nexora analisa** e sugere.
3. **Você revisa e decide.**

## Telas

Uma mesma base de código alimenta **duas interfaces**:

| CLI (terminal, estilo Claude Code) | Web (estilo claude.ai) |
|---|---|
| `nexora` | `nexora web` → http://localhost:4173 |

![Tela inicial](e2e/screenshots/web-inicio.png)
![Chat com painel de artefato](e2e/screenshots/web-chat-artefato.png)
![Cartaz gerado](e2e/screenshots/web-cartaz.png)

---

## Sumário

- [Como funciona](#como-funciona)
- [Instalação](#instalação)
- [Chave da Groq](#chave-da-groq)
- [Usando o CLI](#usando-o-cli)
- [Usando a web](#usando-a-web)
- [Comandos de negócio](#comandos-de-negócio)
- [Ferramentas da IA](#ferramentas-da-ia)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Testes](#testes)
- [Limitações](#limitações)
- [Roadmap](#roadmap)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

## Instalação

Requisitos: **Node.js 22+** e **pnpm**.

```bash
git clone https://github.com/stumdev/nexora-ai.git
cd nexora-ai

npm install -g pnpm          # se ainda não tiver
pnpm install                 # dependências
pnpm build                   # compila web e CLI
cd cli && npm link && cd ..  # cria o comando "nexora"
```

Sem o `npm link`, rode `pnpm nexora` (CLI) ou `pnpm web` (web) dentro da pasta do projeto.

## Chave da Groq

A IA usa a **API da Groq**, que tem plano gratuito.

1. Crie uma conta em https://console.groq.com/keys.
2. Clique em **Create API Key** e copie a chave (começa com `gsk_`).
3. Configure de um destes jeitos:
   - rode `nexora` e cole a chave quando pedir (fica em `~/.nexora/config.json`);
   - na web, abra **Configurações** e cole a chave (há o botão *Testar conexão*);
   - ou defina a variável `GROQ_API_KEY` (tem prioridade sobre as outras):
     - PowerShell: `setx GROQ_API_KEY "gsk_sua_chave"` (abra um terminal novo depois)
     - Linux/macOS: `export GROQ_API_KEY="gsk_sua_chave"`

A chave fica só no seu computador. Não há telemetria.

### Modelos e fallback

Modelo padrão: `openai/gpt-oss-120b`. Se o limite gratuito acabar (erro 429) ou o modelo cair, a Nexora tenta o próximo da lista:

`openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`

A lista é editável em `~/.nexora/config.json`:

```json
{
  "model": "openai/gpt-oss-120b",
  "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"]
}
```

Os modelos gratuitos mudam com frequência. Veja a lista atual em https://console.groq.com/docs/models.

## Usando o CLI

```bash
nexora                                          # abre o chat
nexora "quero abrir uma loja de roupas online"  # abre já com uma pergunta
nexora -p "quero abrir uma loja de roupas"      # responde e sai
nexora -c                                       # continua a última conversa
nexora -m openai/gpt-oss-20b                    # escolhe o modelo
nexora web                                      # sobe a versão web
```

No modo `-p`, ações que alteram arquivos (`Write`, `Edit`, `Bash`) são negadas por segurança. Use `--yes` para permitir e `--json` para saída em JSON. Para não limpar o terminal ao abrir, defina `NEXORA_NO_CLEAR=1`.

| Tecla | Ação |
|---|---|
| `Enter` | envia |
| `\` + `Enter` ou `Alt+Enter` | nova linha |
| `↑` / `↓` | histórico de mensagens |
| `Tab` | completa `/comandos` |
| `Esc` | interrompe a resposta / limpa o campo |
| `Ctrl+C` | interrompe; duas vezes seguidas sai |

Comandos do chat: `/help`, `/clear`, `/model [nome]`, `/resume`, `/export [arquivo.md]`, `/key`, `/exit`.

## Usando a web

```bash
nexora web                       # http://localhost:4173
nexora web --port 4174 --no-open
```

- O servidor aceita conexões **apenas deste computador** (localhost).
- Sidebar com conversas (Hoje, Ontem, Anteriores), busca, renomear, exportar e excluir.
- Composer: `Enter` envia, `Shift+Enter` quebra linha, `/` abre o menu de comandos, 📎 anexa `.txt`/`.csv`.
- Planos, tabelas e cartazes abrem num **painel lateral** (Visualizar / Código, copiar, baixar; cartaz em PNG ou SVG).
- Configurações: chave da Groq, modelo, seu nome e tema claro/escuro.
- Atalhos: `Ctrl+Shift+O` nova conversa, `Ctrl+B` sidebar, `Esc` para a resposta.

As conversas ficam em `~/.nexora/nexora.db` (SQLite) e são **compartilhadas** entre CLI e web.

## Comandos de negócio

Funcionam no CLI e na web. Cada um é um prompt em Markdown na pasta [`skills/`](skills).

| Comando | O que faz |
|---|---|
| `/ideia [tema]` | 5 a 8 ideias de negócio com investimento, prós e contras |
| `/plano [negócio]` | plano de negócio enxuto, com contas feitas pela ferramenta Finance |
| `/publico [negócio]` | personas, dores, onde encontrar e linguagem |
| `/nomes [negócio]` | nomes e slogans (lembra de checar INPI e domínio) |
| `/marketing [negócio]` | estratégia por canal e calendário de 4 semanas |
| `/post [assunto]` | textos para Instagram, WhatsApp e anúncios (A/B) |
| `/financeiro [dados]` | ponto de equilíbrio, margem, preço, fluxo de caixa, payback |
| `/metas [objetivo]` | metas SMART com checkpoints semanais |
| `/melhorar [situação]` | diagnóstico e melhorias por impacto × esforço |
| `/comparar [A vs B]` | comparação com critérios ponderados |
| `/cartaz [marca]` | texto de divulgação + cartaz (SVG/HTML/PNG em `./nexora-docs/`) |
| `/demo` | exemplo **Urban Burger** (hamburgueria fictícia, R$ 10 mil, Instagram) |

**Comandos próprios:** salve um `.md` em `./.nexora/commands/` no mesmo formato dos arquivos de `skills/` (use `$ARGUMENTS` para o texto digitado depois do comando).

**Contexto do negócio:** crie um `NEXORA.md` na pasta onde roda a Nexora (nome, cidade, público, orçamento...). Ele é lido em toda conversa.

## Ferramentas da IA

A IA usa ferramentas de verdade, exibidas como blocos `● Nome(alvo)` no terminal e blocos recolhíveis na web:

`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `TodoWrite`, **`Finance`** (as contas são feitas em código, não "de cabeça") e **`Poster`** (cartaz grafite + verde-lima).

**Permissões:** antes de `Write`, `Edit` e `Bash`, a Nexora pergunta *Sim / Sim, não perguntar de novo nesta sessão / Não*, mostrando o diff ou o comando.

## Estrutura do projeto

```
core/     lógica compartilhada: agente, provider Groq, ferramentas, permissões, SQLite, skills
cli/      terminal (Ink + React)
server/   API local (Hono + SSE) que também serve a web
web/      interface web (React + Vite + Tailwind)
skills/   comandos de negócio em Markdown
e2e/      testes ponta a ponta (Playwright) e um servidor Groq falso
```

Stack: TypeScript, Node 22+, pnpm workspaces, Ink, Hono, React, Vite, Tailwind, better-sqlite3, Vitest, Playwright.

## Testes

```bash
pnpm test        # core (Finance, loop do agente, Edit, banco, skills) e CLI
pnpm typecheck   # checagem de tipos
pnpm e2e         # web no Edge/Chrome instalado, com Groq falso
```

Os testes não gastam a sua cota da Groq.

## Limitações

- A IA **pode errar** e não substitui contador, advogado ou outros profissionais. **A decisão final é sempre do empreendedor.**
- A Nexora não promete lucro nem resultados e não deve inventar dados de mercado: valores sem fonte aparecem como estimativa.
- O plano gratuito da Groq tem limites; quando acabam, a Nexora troca de modelo ou pede para esperar.

---

## Roadmap

- [x] CLI e web com o mesmo núcleo
- [x] Ferramenta `Finance` e cartazes (`Poster`)
- [x] Fallback automático de modelos
- [ ] Exportar planos em PDF
- [ ] Suporte a outros provedores de IA
- [ ] Modo offline com modelos locais
- [ ] Publicação do CLI no npm

Tem uma ideia? [Abra uma issue](https://github.com/stumdev/nexora-ai/issues/new/choose).

## Contribuindo

Contribuições são bem-vindas! Leia o [guia de contribuição](CONTRIBUTING.md) e o [código de conduta](CODE_OF_CONDUCT.md). Para falhas de segurança, veja a [política de segurança](SECURITY.md).

## Licença

Distribuído sob a licença [MIT](LICENSE).

---

*"A inteligência artificial não cria o empreendedor. Ela oferece ferramentas para que suas ideias possam ir mais longe."*
