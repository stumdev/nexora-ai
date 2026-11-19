# Contribuindo com a Nexora AI

Obrigado por querer ajudar! Qualquer contribuição é bem-vinda: bugs, ideias, documentação e novos comandos.

## Preparando o ambiente

```bash
git clone https://github.com/stumdev/nexora-ai.git
cd nexora-ai
pnpm install
pnpm build
```

Você vai precisar de Node.js 20+ e de uma chave gratuita da Groq (veja o [README](README.md#chave-da-groq)).

## Fluxo

1. Faça um fork e crie uma branch: `git checkout -b minha-mudanca`.
2. Faça a mudança, com testes quando fizer sentido.
3. Rode `pnpm check` (tipos + testes). Os testes não gastam cota da Groq.
4. Abra um Pull Request explicando o que mudou e por quê.

## Criando um comando de negócio

Basta adicionar um `.md` em [`skills/`](skills):

```markdown
---
name: exemplo
description: O que o comando faz, em uma linha
argument-hint: "[o que o usuário digita]"
---
Instruções para a IA. Use $ARGUMENTS para o texto digitado depois do comando.
```

## Boas práticas

- Textos e prompts em português do Brasil.
- A Nexora nunca promete lucro nem inventa dados de mercado.
- Nunca commite chaves de API.
