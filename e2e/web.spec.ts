import { expect, test } from '@playwright/test';

const shots = 'e2e/screenshots';

test('tela inicial com saudação, chips e composer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Qual é a sua ideia hoje?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar plano de negócio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Experimentar o Urban Burger' })).toBeVisible();
  await page.screenshot({ path: `${shots}/web-inicio.png` });
});

test('conversa com streaming, ferramenta, artefato e regenerar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/');
  const box = page.getByRole('textbox', { name: 'Mensagem para a Nexora' });
  await box.fill('/financeiro loja de roupas online');
  await box.press('Enter');
  // menu "/" completa o comando; Enter de novo envia
  await box.press('Enter');
  await expect(page.getByText('Calculando', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revise antes de usar' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('A Nexora pode errar. Revise as sugestões antes de decidir.')).toBeVisible();

  // bloco de ferramenta recolhível mostra o resultado do Finance
  await page.getByRole('button', { name: /Calculando ponto de equilíbrio/ }).click();
  await expect(page.getByText('167 unidades/mês', { exact: false })).toBeVisible();

  // artefato abre no painel lateral
  await page.getByRole('button', { name: /Plano inicial/ }).click();
  const panel = page.getByRole('complementary', { name: /Artefato/ });
  await expect(panel).toBeVisible();
  await panel.getByRole('tab', { name: 'Código' }).click();
  await expect(panel.getByText('## Plano inicial')).toBeVisible();
  await panel.getByRole('tab', { name: 'Visualizar' }).click();
  await page.screenshot({ path: `${shots}/web-chat-artefato.png` });
  await panel.getByRole('button', { name: 'Fechar painel' }).click();

  // sidebar mostra a conversa em "Hoje"
  await expect(page.getByRole('region', { name: 'Hoje' }).getByRole('button', { name: '/financeiro loja de roupas online', exact: true })).toBeVisible();

  // regenerar
  await page.getByRole('button', { name: 'Regenerar' }).click();
  await expect(page.getByRole('heading', { name: 'Revise antes de usar' })).toBeVisible({ timeout: 20_000 });
});

test('cartaz abre no painel e permissão de escrita pergunta antes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/');
  const box = page.getByRole('textbox', { name: 'Mensagem para a Nexora' });
  await box.fill('faça um cartaz do Urban Burger');
  await box.press('Enter');
  const panel = page.getByRole('complementary', { name: /Artefato: Cartaz/ });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('img', { name: /Cartaz/ })).toBeVisible();
  await page.screenshot({ path: `${shots}/web-cartaz.png` });
  await panel.getByRole('button', { name: 'Fechar painel' }).click();

  await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await box.fill('crie um arquivo com o plano');
  await box.press('Enter');
  const card = page.getByRole('group', { name: /Pedido de permissão: Write/ });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('+# Plano')).toBeVisible();
  await card.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revise antes de usar' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Criando arquivo/ })).toBeVisible();
});

test('tema claro e layout no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('radio', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${shots}/web-celular-claro.png` });
});
