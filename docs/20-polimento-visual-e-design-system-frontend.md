# 20 — Polimento Visual, Design System e Dívida Estética do Front-end

> **Status:** Registro vivo de dívida estética e de Design System (`apps/web`) — **Ondas Visuais 1 e 2 Concluídas**; **Onda Visual 3** planejada.
> **Regra de Ouro:** O foco atual do projeto consolida a arquitetura funcional da **Pokédex Suprema** (Passos `2B.1`–`2B.3`) e evolui o Design System em ondas controladas de **UI Polish**, respeitando integralmente a **Regra Zero de UI** ([AGENTS.md](../AGENTS.md)) e preservando a carcaça 3D da Pokédex sem simplificações.

---

## 1. Contexto e Diagnóstico Honesto do Estado Atual

Embora o hardware 3D skeuomórfico da Pokédex e o pipeline de verificação (`npm run audit:ui` + Playwright) garantam fidelidade estrutural, contraste WCAG AA e zero overflow, o crescimento acelerado de funcionalidades revelou dívidas estéticas claras no front-end Angular (`apps/web`):

1. **Unificação inicial de tokens concluída na Onda Visual 1 ([`_tokens.scss`](../apps/web/src/styles/_tokens.scss)):**
   - Todos os componentes e estilos internos em `apps/web/src/app/**`, [`_visor-tabs.scss`](../apps/web/src/styles/pokedex/_visor-tabs.scss) e [`_filters-panel.scss`](../apps/web/src/styles/pokedex/_filters-panel.scss) foram migrados integralmente para tokens semânticos `--pv-*` (`0` referências legadas em `apps/web/src/app/**`).
   - Os literais residuais de [`_search-scanner.scss`](../apps/web/src/styles/pokedex/_search-scanner.scss) e [`_visor-lcd.scss`](../apps/web/src/styles/pokedex/_visor-lcd.scss) foram extraídos para tokens `--pv-scanner-*` e `--pv-visor-*`, preservando os aliases retrocompatíveis apenas nas parciais da carcaça 3D ([`styles/pokedex/`](../apps/web/src/styles/pokedex/)).
2. **Assimetria estética entre a Pokédex 3D e as telas satélites (em endereçamento nas Ondas 2–3):**
   - A Onda Visual 1 extraiu os primitivos compartilhados em [`_primitives.scss`](../apps/web/src/styles/_primitives.scss) (`.pv-glass-card`, `.pv-btn*`, `.pv-chip`, `.pv-badge`, `.pv-dialog*`) para `/museu`, `/enciclopedia`, Comparador 1v1 e diálogos modais; a Onda Visual 3 aplicará a direção de arte "Tactical Glass" completa e emblemas regionais dedicados.
3. **Densidade visual reduzida no Visor LCD 2.0 e no Painel Esquerdo na Onda Visual 2:**
   - Os controles de mídia e variação do Visor LCD (`Arte`/`Home`/`Animado`, `Shiny`/`Ouvir Grito`/`Retrô`, além dos filtros de método na aba `Golpes`) foram unificados em *segmented controls* (`.visor-segmented`), com ações secundárias destacadas em grid 2× (`Comparar 1v1` / `Holocron 3D`), moldura do sprite colorizada pelo tipo primário (`[data-pokemon-type]`) e bordas internas atenuadas por `--pv-lcd-hairline`.
   - O Painel de Filtros na ala esquerda foi reorganizado em 2 abas rápidas com contadores ativos (`Tipos & Gen` e `Taxonomia & Ordem`) e divisor no cabeçalho da lista (`--pv-scanner-divider`), mantendo 100% da carcaça 3D intacta.
4. **Paleta semântica dos 18 tipos entregue na Onda Visual 1; tipografia display pendente na Onda Visual 3:**
   - Criada a paleta acessível (WCAG AA+) dos **18 tipos Pokémon** em [`_pokemon-types.scss`](../apps/web/src/styles/_pokemon-types.scss) + [`pokemon-type-style.util.ts`](../apps/web/src/app/shared/utils/pokemon-type-style.util.ts), ativa no Visor LCD (`Resumo`, `Stats`, `Golpes`), Filtros Combinados, Comparador 1v1, Enciclopédia `/enciclopedia` e Holocron.
   - A tipografia display auto-hospedada (`.woff2`) segue planejada para a Onda Visual 3.
5. **Ritmo espacial desigual e ausência de transições entre vistas:**
   - Os primitivos de diálogo (`.pv-dialog*`) e vidro fosco (`.pv-glass-card`) já unificam bordas, raios, botões e desligamento automático em `LITE`/`forced-colors`; View Transitions e ajuste fino de ritmo seguem na Onda Visual 3.

---

## 2. Inventário Priorizado por Tela e Componente

### Prioridade P0 — Impacto Direto na Experiência Principal

| Alvo | Arquivos Principais | Dívida Visual Observada | Direção de Correção |
| :--- | :--- | :--- | :--- |
| **Unificação de Design Tokens** | [`_tokens.scss`](../apps/web/src/styles/_tokens.scss), [`styles/pokedex/`](../apps/web/src/styles/pokedex/) | Dualidade `--pv-*` vs `--palette-*`/`--espaco-*`; valores hex/rgb residuais em parciais da Pokédex | Migrar tokens legados para aliases semânticos `--pv-*`, zerar literais avulsos e criar tokens para os 18 tipos Pokémon com contraste >= `4.5:1` |
| **Visor LCD 2.0** | [`pokedex-visor.component.html`](../apps/web/src/app/features/pokedex-device/components/pokedex-visor.component.html), [`_visor-tabs.scss`](../apps/web/src/styles/pokedex/_visor-tabs.scss), [`_visor-lcd.scss`](../apps/web/src/styles/pokedex/_visor-lcd.scss) | Alta densidade na aba `Resumo & Lore` (muitos botões `44px` empilhados), excesso de caixas aninhadas com bordas semelhantes e hierarquia discreta entre cabeçalho, stats e matriz `0x..4x` | Agrupar controles de mídia em *segmented controls* compactos (preservando área de toque `>= 44px`), reduzir bordas redundantes, destacar o sprite como ponto focal e colorizar badges por tipo |
| **Painel Esquerdo (Busca + Filtros)** | [`pokedex-search-panel.component.html`](../apps/web/src/app/features/pokedex-device/components/pokedex-search-panel.component.html), [`_search-scanner.scss`](../apps/web/src/styles/pokedex/_search-scanner.scss), [`_filters-panel.scss`](../apps/web/src/styles/pokedex/_filters-panel.scss) | Painel de filtros dentro da ala esquerda compete visualmente com a lista do catálogo; selects nativos variam muito entre sistemas operacionais | Refinar densidade do bloco de filtros, aplicar tokens consistentes para `<select>`/`<input>`, melhorar contraste de chips ativos e dar respiro vertical ao cabeçalho |

### Prioridade P1 — Coesão das Novas Features e Navegação

| Alvo | Arquivos Principais | Dívida Visual Observada | Direção de Correção |
| :--- | :--- | :--- | :--- |
| **Enciclopédia Global (`/enciclopedia`)** | [`encyclopedia-page.component.ts`](../apps/web/src/app/features/encyclopedia/encyclopedia-page.component.ts), [`encyclopedia-detail-panel.component.ts`](../apps/web/src/app/features/encyclopedia/encyclopedia-detail-panel.component.ts) | Layout funcional Master-Detail com aparência utilitária; chips de busca reversa ainda sem ícones/sprites em mini-cards padronizados | Aplicar sistema de cards "Tactical Glass", melhorar escaneabilidade das fichas (poder/precisão/PP, efeitos, busca reversa com cards mais leves) e estado vazio ilustrado |
| **Comparador 1v1** | [`pokedex-compare-dialog.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-compare-dialog.component.ts) | Modal técnico focado em dados brutos (barras e deltas) sem destaque visual de tipos, vantagem elementar ou comparação rápida de sprites | Enriquecer cabeçalho com aura sutil por tipo primário, alinhar barras bidirecionais simétricas (esquerda vs direita a partir do eixo central) e melhorar leitura em `375px` |
| **Museu das Regiões (`/museu`)** | [`museum-page.component.scss`](../apps/web/src/app/features/regions-museum/museum-page.component.scss), [`museum-region-inspector.component.scss`](../apps/web/src/app/features/regions-museum/components/museum-region-inspector.component.scss) | Estilos inline já extraídos para SCSS com tokens `--pv-*` e integrados ao Holocron 3D no Passo `2B.3`; resta aplicar acabamento visual unificado "Tactical Glass" e emblemas regionais dedicados | Aplicar sistema de cards "Tactical Glass" da Onda Visual 3 e criar identidade/emblema visual próprio por região (Kanto–Paldea) |
| **HUD Topbar e Popovers** | [`hud-topbar.component.scss`](../apps/web/src/app/shared/hud/hud-topbar.component.scss), [`hud-modules-menu.component.scss`](../apps/web/src/app/shared/hud/hud-modules-menu.component.scss) | Popovers escuros funcionais, porém com hierarquia tímida entre módulos liberados, bloqueados e links utilitários | Padronizar superfícies elevadas, estados hover/focus-visible e alinhamento fino entre desktop (`1440px`) e mobile (`375px`) |

### Prioridade P2 — Acabamento de Marca, Diálogos e Galeria

| Alvo | Arquivos Principais | Dívida Visual Observada | Direção de Correção |
| :--- | :--- | :--- | :--- |
| **Diálogos Modais (`<dialog>`)** | [`visitor-lock-dialog.component.ts`](../apps/web/src/app/shared/hud/visitor-lock-dialog.component.ts), [`security-settings-dialog.component.ts`](../apps/web/src/app/shared/hud/security-settings-dialog.component.ts), [`privacy-consent-dialog.component.ts`](../apps/web/src/app/shared/hud/privacy-consent-dialog.component.ts), [`api-credits-dialog.component.ts`](../apps/web/src/app/shared/hud/api-credits-dialog.component.ts) | Cada diálogo define variação própria de padding, bordas e botões primários/secundários | Criar primitivos visuais compartilhados em SCSS (`@layer components` ou mixins de diálogo/botão/campo) |
| **Telas Em Construção** | [`under-construction.component.ts`](../apps/web/src/app/features/under-construction/under-construction.component.ts) | Layout de status pesado frente às demais telas públicas | Alinhar estética ao padrão unificado **PokéVerse OS** quando os módulos começarem a sair do status de rascunho |
| **Tipografia, Movimento e Screenshots** | [`styles.scss`](../apps/web/src/styles.scss), [`docs/assets/screenshots/`](assets/README.md) | Ausência de fonte display auto-hospedada (`.woff2` compatível com CSP `font-src 'self'`), zero View Transitions e screenshots antigos | Avaliar 1 família display leve em `public/assets/fonts/` (`font-display: swap`), habilitar View Transitions com guarda `reduced-motion` e regenerar a galeria após a onda de polimento |

---

## 3. Plano Futuro de Polimento Visual (3 Ondas de UI Polish)

> **Pré-requisito de execução:** Antes de alterar qualquer layout visível da Pokédex 3D ou telas principais, registrar screenshots "Antes" e aprovar com o usuário conforme a **Regra Zero de UI**.

### Onda Visual 1 — Fundação do Design System Unificado (Concluída)
- [`_tokens.scss`](../apps/web/src/styles/_tokens.scss) consolidado em torno da árvore `--pv-*` (`--pv-glass-bg*`, `--pv-backdrop-scrim`, `--pv-shadow-md`, `--pv-radius-xs`, `--pv-motion-fast-ms/normal-ms`, `--pv-z-skip`, `--pv-scanner-*` e `--pv-visor-*`), zerando tokens legados em `apps/web/src/app/**`, `_visor-tabs.scss` e `_filters-panel.scss`, zerando literais hex em `_search-scanner.scss` e `_visor-lcd.scss` e mantendo aliases retrocompatíveis apenas nas parciais da carcaça 3D.
- Criada a paleta semântica acessível (WCAG AA+ com suporte a `forced-colors: active`) para os **18 tipos Pokémon** em [`_pokemon-types.scss`](../apps/web/src/styles/_pokemon-types.scss) e [`pokemon-type-style.util.ts`](../apps/web/src/app/shared/utils/pokemon-type-style.util.ts) (`+` [`pokemon-type-style.util.spec.ts`](../apps/web/src/app/shared/utils/pokemon-type-style.util.spec.ts)), aplicada no Visor LCD (`Resumo`, `Stats`, `Golpes`), Filtros Combinados, Comparador 1v1, Enciclopédia `/enciclopedia` e Holocron.
- Extraídos os primitivos visuais compartilhados em [`_primitives.scss`](../apps/web/src/styles/_primitives.scss) (`.pv-glass-card` com desligamento automático em `html[data-perf-tier='lite']`, `.pv-btn*`, `.pv-chip`, `.pv-badge` e `.pv-dialog*`) e adotados em `/museu`, `/enciclopedia`, Comparador 1v1, Holocron, Créditos e Privacidade/LGPD, com aprovação de `npm run audit:ui`, `npm run test:e2e:web` e inspeção visual em Desktop (`1440×900`) e Mobile (`375×812`).

### Onda Visual 2 — Ergonomia e Hierarquia da Pokédex 3D (Concluída — Sem Mudar a Carcaça)
- Preservados 100% da geometria, materiais, dobradiça, tampa, D-Pad e 10 slots azuis ([`_chassis-3d.scss`](../apps/web/src/styles/pokedex/_chassis-3d.scss), [`_controls-dpad.scss`](../apps/web/src/styles/pokedex/_controls-dpad.scss), [`_slots-grid.scss`](../apps/web/src/styles/pokedex/_slots-grid.scss) intactos).
- Reorganizado o Visor LCD 2.0 em [`visor-overview-tab.component.html`](../apps/web/src/app/features/pokedex-device/components/visor-tabs/visor-overview-tab.component.html), [`visor-moves-tab.component.html`](../apps/web/src/app/features/pokedex-device/components/visor-tabs/visor-moves-tab.component.html), [`_visor-tabs.scss`](../apps/web/src/styles/pokedex/_visor-tabs.scss) e [`_visor-lcd.scss`](../apps/web/src/styles/pokedex/_visor-lcd.scss): faixa de 5 abas unificada sem quebra de palavra (`Evolução`), *segmented controls* `.visor-segmented` para mídia (`Arte | Home | Animado`), variação/áudio (`Shiny | Ouvir Grito | Retrô`) e métodos de golpes (mantendo área de toque `>= 44px`), grid 2× de ações (`.visor-media-actions`), box do sprite destacado pelo tipo primário (`[data-pokemon-type]`) e bordas internas suaves (`--pv-lcd-hairline`).
- Reorganizado o painel de filtros em [`pokedex-filters-panel.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-filters-panel.component.ts), [`pokedex-filters-panel.component.html`](../apps/web/src/app/features/pokedex-device/components/pokedex-filters-panel.component.html), [`_filters-panel.scss`](../apps/web/src/styles/pokedex/_filters-panel.scss) e [`_search-scanner.scss`](../apps/web/src/styles/pokedex/_search-scanner.scss) com 2 abas rápidas acessíveis por teclado (`Tipos & Gen` / `Taxonomia & Ordem`) + contadores de filtros ativos e respiro no cabeçalho do catálogo (`--pv-scanner-divider`), validado por conferência Antes × Depois em Desktop (`1440×900`) e Mobile (`375×812`), `npm run audit:ui` e Playwright E2E.

### Onda Visual 3 — Direção de Arte "PokéVerse OS Tactical Glass" nas Rotas Satélites
- Refinar `/enciclopedia`, `/museu`, Comparador 1v1 e diálogos sob a mesma linguagem visual (painéis de vidro escuro com bordas de instrumentação, acentos dourado/safira/rubi da Pokédex, `tabular-nums` consistente e estados vazios cuidados).
- Adicionar transições suaves entre rotas e diálogos respeitando `@media (prefers-reduced-motion: reduce)` e perfil `lite`.
- Atualizar todas as capturas em `docs/assets/screenshots/` e o `README.md`.

---

## 4. Critérios de Aceite para Quando Essa Etapa For Executada

1. **Conferência Antes × Depois** em Desktop (`1440×900`) e Mobile (`375×812`) sem degradação da Pokédex 3D.
2. **`npm run audit:ui`** aprovado com **0 violações** de contraste, recorte, backing ou overflow horizontal.
3. **Zero cores hex/rgb hardcoded** em `apps/web/src/app/**/*.scss` e **zero regressão** em `forced-colors: active`, `prefers-reduced-motion: reduce` e `data-perf-tier="lite"`.
4. **Budget inicial Angular** preservado sem warnings (`ng build`) e 100% dos testes unitários e E2E Playwright passando.
