import { expect, test } from './bff-e2e-fixture';

test.describe('PokéVerse OS Real Browser E2E Journeys', () => {
  test('authenticates visitor through BFF cookie login and unlocks protected Arcade route', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-heading')).toBeVisible();

    await page.getByRole('button', { name: 'Apenas essenciais' }).click();

    await page.locator('.hud-modules-trigger').click();
    const lockedArcadeBtn = page.locator('button.hud-menu-item--locked', {
      hasText: 'Arcade',
    });
    await expect(lockedArcadeBtn).toBeVisible();
    await expect(lockedArcadeBtn).toHaveAttribute('aria-disabled', 'true');
    await lockedArcadeBtn.focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator('dialog.visitor-dialog');
    await expect(dialog).toBeVisible();

    await page.locator('.visitor-dialog__btn-primary').click();
    await expect(page.locator('#pv-auth-error')).toBeVisible();

    await page.locator('#pv-auth-email').fill('red@pokeverse.dev');
    await page.locator('#pv-auth-password').fill('Password1234!');
    await page.locator('.visitor-dialog__btn-primary').click();

    await expect(page).toHaveURL(/\/arcade$/);
    await expect(page.locator('.hud-pill--trainer')).toContainText('Red_Kanto');
    await expect(page.locator('h1#main-heading')).toContainText('ainda não implementada');

    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'pokeverse_session' && c.httpOnly)).toBe(true);
    expect(bff.consoleErrors).toEqual([]);
  });

  test('opens 3D Pokédex, searches and selects Pikachu in 2 clicks, saves slot 01, and checks mobile viewport', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-heading')).toBeVisible();

    const aparelho = page.locator('#pokedex-aparelho');
    await expect(aparelho).toHaveAttribute('data-aberta', 'false');

    await page.locator('#btn-abrir-pokedex').click();
    await expect(aparelho).toHaveAttribute('data-aberta', 'true');

    const searchInput = page.locator('#pokemon-input');
    await searchInput.fill('pikachu');

    const pikachuItem = page.locator('.catalogo-item', { hasText: 'Pikachu' }).first();
    await expect(pikachuItem).toBeVisible();

    await pikachuItem.click();
    await expect(pikachuItem).toHaveClass(/is-cursor/);
    await expect(page.locator('.pokemon-nome')).toHaveCount(0);

    await pikachuItem.click();
    await expect(page.locator('.pokemon-nome')).toContainText('Pikachu');

    await page.locator('#visor-tab-stats').click();
    await expect(page.locator('.visor-bst-badge')).toContainText('BST 320');

    await page.locator('#visor-tab-evolucao').click();
    await expect(page.locator('.visor-evo-list')).toContainText('Raichu');

    await page.locator('#visor-tab-golpes').click();
    await page.locator('.visor-accordion-trigger').first().click();
    await expect(page.locator('.visor-move-meta-grid')).toContainText('Poder: 40');

    await page.locator('#visor-tab-mapa').click();
    await expect(page.locator('#resultado-conteudo')).toContainText('Viridian Forest Area');

    await page.locator('#visor-tab-resumo').click();
    await expect(page.locator('.pokemon-nome')).toContainText('Pikachu');

    const slotZero = page.locator('.btn-slot-azul[data-slot-index="0"]');
    await slotZero.click();
    await expect(slotZero).toHaveClass(/is-ocupado/);

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });

  test('applies combined Pokedex filters, runs 1v1 comparison, and navigates Encyclopedia reverse lookup', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#btn-abrir-pokedex').click();

    await page.locator('#btn-filtros-catalogo').click();
    await expect(page.locator('#pokedex-filtros-painel')).toBeVisible();
    await page.locator('.filtro-chip', { hasText: 'Electric' }).click();
    await expect(page.locator('#catalogo-status')).toContainText('1 Pokémon com filtros ativos');

    const pikachuItem = page.locator('.catalogo-item', { hasText: 'Pikachu' }).first();
    await pikachuItem.click();
    await pikachuItem.click();
    await expect(page.locator('.pokemon-nome')).toContainText('Pikachu');

    await page.locator('#btn-comparar-1v1').click();
    const compareDialog = page.locator('dialog.compare-dialog');
    await expect(compareDialog).toBeVisible();
    await compareDialog.locator('.compare-chip', { hasText: 'Pikachu' }).nth(1).click();
    await expect(compareDialog.locator('.compare-stats')).toBeVisible();
    await compareDialog.getByRole('button', { name: 'Fechar' }).click();

    await page.goto(`${bff.baseUrl}/enciclopedia`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1#main-heading')).toContainText('Enciclopédia PokéVerse');
    await page.locator('.ency-cat-btn', { hasText: 'Tipos' }).click();
    await page.locator('.ency-list-item', { hasText: 'Electric' }).click();
    await expect(page.locator('.ency-reverse-link', { hasText: 'Pikachu' })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });
});
