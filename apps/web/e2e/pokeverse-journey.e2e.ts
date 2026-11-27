import { expect, test } from './bff-e2e-fixture';

test.describe('PokéVerse OS Real Browser E2E Journeys', () => {
  test('starts on Press Start screen, enters Home Hub, authenticates via BFF, and unlocks Arcade', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-heading')).toContainText('PokéVerse');
    await expect(page.locator('.hud-topbar')).toHaveCount(0);

    await page.getByRole('button', { name: 'Apenas essenciais' }).click();
    await page.locator('#btn-iniciar-jogo').click();

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.locator('.hud-topbar')).toBeVisible();

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

  test('opens 3D Pokédex, selects Pikachu in 2 clicks, saves and opens slot 01 without modal, and checks mobile viewport', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/pokedex`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-heading')).toBeVisible();

    const aparelho = page.locator('#pokedex-aparelho');
    await expect(aparelho).toHaveAttribute('data-aberta', 'false');

    await page.locator('#btn-abrir-pokedex').click();
    await expect(aparelho).toHaveAttribute('data-aberta', 'true');

    const searchInput = page.locator('#pokemon-input');
    await searchInput.fill('pikachu');

    const pikachuItem = page.locator('.catalogo-item', { hasText: 'Pikachu' }).first();
    await expect(pikachuItem).toBeVisible();
    await expect(page.locator('.catalogo-item')).toHaveCount(3);
    await expect(page.locator('.catalogo-divisor')).toContainText('Relacionados');

    await pikachuItem.click();
    await expect(pikachuItem).toHaveClass(/is-cursor/);
    await expect(page.locator('.pokemon-nome')).toHaveCount(0);

    await pikachuItem.click();
    await expect(page.locator('.pokemon-nome')).toContainText('Pikachu');
    await expect(page.locator('.visor-tabs')).toHaveCount(0);

    await page.locator('#btn-ficha-completa').click();
    await expect(page.locator('#resultado-area')).toHaveClass(/is-visor-expanded/);
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
    await page.locator('#btn-visor-expand').click();
    await expect(page.locator('#resultado-area')).not.toHaveClass(/is-visor-expanded/);

    const slotZero = page.locator('.btn-slot-azul[data-slot-index="0"]');
    await slotZero.click();
    await expect(slotZero).toHaveClass(/is-ocupado/);

    await slotZero.click();
    await expect(page.locator('dialog.slot-dialog[open]')).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });

  test('applies combined Pokedex filters, runs embedded 1v1 Comparator, Stat Calculator, and Encyclopedia inside Visor', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/pokedex`, { waitUntil: 'domcontentloaded' });
    await page.locator('#btn-abrir-pokedex').click();

    await page.locator('#btn-filtros-catalogo').click();
    await expect(page.locator('#pokedex-filtros-painel')).toBeVisible();
    await page.locator('.filtro-chip', { hasText: 'Elétrico' }).click();
    await expect(page.locator('#catalogo-status')).toContainText('1 Pokémon com filtros ativos');
    await expect(page.locator('.catalogo-item')).toHaveCount(3);

    const pikachuItem = page.locator('.catalogo-item', { hasText: 'Pikachu' }).first();
    await pikachuItem.click();
    await pikachuItem.click();
    await expect(page.locator('.pokemon-nome')).toContainText('Pikachu');

    await page.locator('#btn-comparar-1v1').click();
    await expect(page.locator('#resultado-area')).toHaveClass(/is-visor-expanded/);
    await expect(page.locator('#btn-visor-expand')).toHaveAttribute('aria-expanded', 'true');
    const comparePanel = page.locator('.compare-embed');
    await expect(comparePanel).toBeVisible();
    await comparePanel
      .locator('.compare-slot')
      .nth(1)
      .locator('.compare-chip', { hasText: 'Bulbasaur' })
      .first()
      .click();
    await expect(comparePanel.locator('.compare-stats')).toBeVisible();

    await page.locator('#visor-mode-calculadora').click();
    await expect(page.locator('.calc-panel')).toBeVisible();
    await expect(page.locator('.calc-footer__total')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-visor-expand')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#pokedex-aparelho')).toHaveAttribute('data-aberta', 'true');

    await page.locator('#btn-calc-stats').click();
    await expect(page.locator('#resultado-area')).toHaveClass(/is-visor-expanded/);

    await page.locator('#calc-competitive-preset').selectOption('vgc-fast-special');
    await expect(page.locator('.calc-head__title')).toContainText('Nv. 50');

    await page.locator('#calc-tab-damage').click();
    await page.locator('.dmg-chips .dmg-chip', { hasText: 'Pikachu' }).first().click();
    await expect(page.locator('.dmg-result__range')).toBeVisible();
    await expect(page.locator('.dmg-eff-badge')).toContainText('Eficácia');

    await page.locator('#calc-tab-io').click();
    await expect(page.locator('#calc-spread-export')).toHaveValue(/Timid Nature/);
    await page
      .locator('#calc-spread-import')
      .fill('Pikachu\nLevel: 100\nEVs: 252 Atk / 4 Def / 252 Spe\nJolly Nature');
    await page.locator('#btn-import-spread').click();
    await expect(page.locator('.io-feedback--ok')).toBeVisible();
    await page.locator('#calc-tab-stats').click();
    await expect(page.locator('.calc-head__title')).toContainText('Nv. 100');

    await page.locator('#visor-mode-enciclopedia').click();
    await expect(page.locator('.ency-embed')).toBeVisible();
    await page.locator('.ency-cat-btn', { hasText: 'Tipos' }).click();
    await page.locator('.ency-list-item', { hasText: 'Electric' }).click();
    await expect(page.locator('.ency-reverse-link--btn', { hasText: 'Pikachu' })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });

  test('redirects /museu into Pokédex Enciclopédia Regiões & História and opens embedded Holocron 3D', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/museu`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pokedex\?mode=enciclopedia&cat=region$/);
    await expect(page.locator('#pokedex-aparelho')).toHaveAttribute('data-aberta', 'true');
    await expect(page.locator('#resultado-area')).toHaveClass(/is-visor-expanded/);
    await expect(page.locator('.ency-embed')).toBeVisible();
    await expect(page.locator('.region-card')).toHaveCount(0);
    await expect(page.locator('.timeline-step')).toHaveCount(9);
    await expect(page.locator('.inspector')).toContainText('Pallet Town');
    await expect(page.locator('.native-grid')).toContainText('Bulbasaur');

    await page.locator('.species-holocron-btn').first().click();
    await expect(page.locator('.holocron-embed')).toBeVisible();
    await expect(page.locator('.holocron-embed .cry-spec')).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });

  test('creates a classless character on /personagem, preserves draft across login, persists across reload, and allocates points', async ({
    page,
    bff,
  }) => {
    await page.goto(`${bff.baseUrl}/personagem`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-heading')).toContainText('Criação');
    await expect(page.locator('.creator-classless-banner')).toContainText('Sem Classes');

    await page.locator('#char-name').fill('Kael Norte');
    await page.locator('.creator-origin-card', { hasText: 'Aprendiz de Porto' }).click();
    await page.locator('.creator-submit-btn').click();

    await expect(page.locator('dialog.visitor-dialog')).toBeVisible();
    await page.locator('#pv-auth-email').fill('red@pokeverse.dev');
    await page.locator('#pv-auth-password').fill('Password1234!');
    await page.locator('.visitor-dialog__btn-primary').click();

    await expect(page.locator('#char-name')).toHaveValue('Kael Norte');
    await page.locator('.creator-submit-btn').click();

    await expect(page.locator('.sheet-hero')).toBeVisible();
    await expect(page.locator('.char-portrait__name')).toContainText('Kael Norte');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.char-portrait__name')).toContainText('Kael Norte');

    await page.locator('button[aria-label="Adicionar ponto em Percepção"]').click();
    await page.getByRole('button', { name: /Confirmar Alocação/ }).click();
    await expect(page.locator('.sheet-card__head .pv-badge')).toContainText('Pontos livres: 0');

    await page.setViewportSize({ width: 375, height: 812 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasOverflow).toBe(false);
    expect(bff.consoleErrors).toEqual([]);
  });
});
