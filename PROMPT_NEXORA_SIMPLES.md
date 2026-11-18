# Prompt: Nexora AI (CLI + Web, usando Groq)

Crie do zero, nesta pasta, um projeto chamado **Nexora AI**: um assistente de IA para **empreendedores e pequenos negócios**, com **duas interfaces que usam o mesmo código**: um **CLI** (parecido com o Claude Code) e uma **web** (parecida com o claude.ai). É um projeto escolar, então mantenha simples, mas funcionando e bonito. Faça tudo de uma vez, rode e teste no final, sem me pedir confirmação.

## Sobre a Nexora (use no system prompt e na UI)
- Slogan: "Da ideia ao negócio, com inteligência." Criada pela empresa **fictícia** Nexora Technologies. Na UI mostre discretamente "Projeto escolar • Conceito".
- Serve para: criar ideias de negócio, planos de negócio, identificar público-alvo, sugerir nomes e slogans, estratégias de marketing, textos para anúncios e redes sociais, organizar finanças, analisar vendas, comparar estratégias, achar oportunidades, criar metas e sugerir melhorias.
- Funciona em 3 passos: o usuário explica a ideia → a IA analisa e sugere → o empreendedor revisa e decide.
- Persona: consultora de negócios simples e acolhedora, fala **português do Brasil**, respostas organizadas com próximos passos claros, mostra as contas, deixa as premissas explícitas, nunca promete lucro, nunca inventa dados, e lembra que **a decisão final é do empreendedor**.
- Exemplo: "Quero abrir uma loja de roupas online. Como começar?" → plano inicial com público, custos, divulgação, nomes e estratégias de venda.

## Tecnologia
- **TypeScript + Node 20+**, monorepo simples com pnpm: `core/` (lógica), `cli/`, `web/`, `server/`.
- **IA: API da Groq** (compatível com OpenAI: `https://api.groq.com/openai/v1/chat/completions`, com streaming SSE e tool calling). Use `fetch` direto ou o SDK `openai` com `baseURL` da Groq. Chave em `GROQ_API_KEY` (ou salva em `~/.nexora/config.json`). Modelo padrão configurável; pesquise na documentação da Groq qual é o melhor modelo gratuito com tool calling hoje, e deixe uma lista editável com fallback automático para outro modelo em caso de erro 429.
- Histórico das conversas em SQLite (`better-sqlite3`) em `~/.nexora/`, compartilhado entre CLI e web.

## Core
- Loop de agente com streaming e **tool calling**: o modelo pede uma ferramenta, o sistema executa, devolve o resultado e continua até responder. Ctrl+C / botão Parar cancela.
- Ferramentas: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `TodoWrite`, mais uma tool **`Finance`** (cálculos em código: ponto de equilíbrio, margem, precificação, fluxo de caixa simples; a IA chama a tool em vez de calcular de cabeça).
- **Permissões** como no Claude Code: antes de `Write`, `Edit` e `Bash` perguntar "Sim / Sim, não perguntar de novo nesta sessão / Não". Mostrar diff nas edições.
- Arquivo `NEXORA.md` na pasta é carregado como contexto do negócio.
- **Comandos de negócio** (slash commands, definidos como prompts em Markdown na pasta `skills/`): `/ideia`, `/plano`, `/publico`, `/nomes`, `/marketing`, `/post`, `/financeiro`, `/metas`, `/melhorar`, `/comparar`, `/cartaz` (gera texto de divulgação + cartaz em HTML/SVG no estilo grafite e verde-lima, exportável em PNG) e `/demo` (carrega o exemplo **Urban Burger**: hamburgueria fictícia, R$ 10 mil de investimento, foco em Instagram, produto artesanal).
- Planos e relatórios terminam com um bloco curto **"Revise antes de usar"**.

## CLI (`nexora`)
Use **Ink**. Deve parecer o Claude Code:
- `nexora` abre o chat; `nexora -p "pergunta"` responde e sai; `nexora web` sobe a versão web e abre o navegador.
- Banner de boas-vindas com logo ASCII, modelo e pasta atual. Prompt com borda arredondada, histórico com ↑/↓, multilinha, Tab completa `/comandos`.
- Resposta em streaming com Markdown renderizado (código com cores, tabelas, listas). Chamadas de ferramenta como blocos compactos (`● Read(arquivo)`), diffs verde/vermelho, spinner com "Pensando… (12s · esc para interromper)".
- Slash commands: `/help`, `/clear`, `/model`, `/resume` (conversas anteriores), `/export` (salvar em .md), `/exit`, mais os de negócio.
- Cores de acento verde-lima.

## Web
React + Vite + Tailwind, servida pelo `server/` (Hono, SSE), somente em `localhost`. Layout e experiência **iguais aos do claude.ai**, mas com a marca Nexora (não copie logo nem assets do Claude):
- **Sidebar** recolhível: nova conversa, busca, conversas recentes agrupadas (Hoje, Ontem, Anteriores) com menu de renomear/excluir, e configurações embaixo.
- **Tela inicial**: saudação grande em fonte serif ("Qual é a sua ideia hoje?"), composer centralizado e chips de sugestão (Criar plano de negócio, Ideias de negócio, Nomes e slogans, Estratégia de marketing, Criar cartaz, Experimentar o Urban Burger).
- **Chat**: coluna central estreita, mensagens do usuário em bolha discreta, respostas da IA sem bolha, streaming, Markdown completo com botão Copiar nos códigos, ações de copiar e regenerar, blocos recolhíveis para uso de ferramentas, aviso fixo "A Nexora pode errar. Revise as sugestões antes de decidir."
- **Composer**: campo que cresce, Enter envia, Shift+Enter quebra linha, botão Parar durante a resposta, menu `/` com os comandos de negócio, anexar arquivo de texto/CSV.
- **Painel lateral de artefatos**: planos, tabelas e cartazes abrem ao lado do chat com abas Visualizar/Código, copiar e baixar.
- **Configurações**: chave da Groq, modelo, tema claro/escuro.
- **Design**: tema escuro padrão (fundo `#111312`, superfícies `#181B19`, texto `#F2F4F1`, acento verde-lima `#B7F34A`) e tema claro quente (`#FAF9F6`). Inter na interface, serif nos títulos, bordas finas, cantos bem arredondados, animações sutis. Responsivo (funciona no celular) e com navegação por teclado. Crie um logo simples em SVG e o wordmark "NEXORA AI".

## Entrega
- `README.md` em português: como instalar, onde pegar a chave gratuita da Groq, como rodar o CLI e a web, lista de comandos.
- Um teste simples da tool `Finance` e do loop do agente com provider falso.
- Ao terminar: rode a instalação do zero, teste `nexora -p "quero abrir uma loja de roupas online"` e a web, corrija o que falhar e me diga como iniciar.

Fora do escopo: login, pagamentos, nuvem, telemetria, copiar marca do Claude, prometer lucro.
