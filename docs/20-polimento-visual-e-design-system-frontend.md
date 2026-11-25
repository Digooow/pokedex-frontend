# 20 — Polimento Visual, Design System e Dívida Estética do Front-end

> **Status:** Registro vivo de dívida estética e de Design System (`apps/web`).
> **Regra de Ouro:** O foco atual do projeto é consolidar a arquitetura funcional da **Pokédex Suprema** (Passos `2B.1`–`2B.3`) e dos módulos do **PokéVerse OS**. Este documento existe para garantir que as decisões visuais de polimento fiquem mapeadas com precisão para uma etapa dedicada de **UI Polish**, sem atrasar as entregas funcionais e respeitando integralmente a **Regra Zero de UI** ([AGENTS.md](../AGENTS.md)).

---

## 1. Contexto e Diagnóstico Honesto do Estado Atual

Embora o hardware 3D skeuomórfico da Pokédex e o pipeline de verificação (`npm run audit:ui` + Playwright) garantam fidelidade estrutural, contraste WCAG AA e zero overflow, o crescimento acelerado de funcionalidades revelou dívidas estéticas claras no front-end Angular (`apps/web`):

1. **Coexistência de dois sistemas de tokens em [`_tokens.scss`](../apps/web/src/styles/_tokens.scss):**
   - Os tokens modernos `--pv-*` em `oklch(...)` (usados no HUD, diálogos e abas novas) coexistem com dezenas de tokens legados da Fase 0 (`--palette-*`, `--bg-*`, `--espaco-*`, `--raio-*`, `--fonte-*`) herdados do porte inicial.
   - Ainda existem valores de cor literais (`#4c5663`, `#161d27`, `rgba(...)` e `oklch(...)` inline) espalhados em parciais de [`styles/pokedex/`](../apps/web/src/styles/pokedex/) e em estilos inline como [`museum-page.component.ts`](../apps/web/src/app/features/regions-museum/museum-page.component.ts).
2. **Assimetria estética entre a Pokédex 3D e as telas satélites:**
   - A carcaça 3D tem profundidade física, iluminação dinâmica (`--luz-x`/`--luz-y`), microtexturas WebP e dobradiça articulada, enquanto rotas satélites (`/museu`, `/enciclopedia`, `/mundo`, `/arcade`, `/arena`) e modais parecem painéis genéricos escuros sem linguagem visual unificada de console/SO tático.
3. **Densidade visual crescente no Visor LCD 2.0 e no Painel Esquerdo:**
   - O Visor LCD recebeu 5 abas, chips de raridade, barra de mídia (botões de `44px` para `Arte`/`Home`/`Animado`/`Shiny`/`Ouvir Grito`/`Retrô`/`Comparar 1v1`), cards de lore, barras de atributos e accordions dentro de uma área física compacta.
   - O Painel Esquerdo concentra busca textual, painel colapsável de filtros combinados e lista paginada do catálogo dentro da mesma ala metálica, exigindo hierarquia visual mais limpa e menor ruído de bordas.
4. **Ausência de tipografia display e paleta semântica de tipos:**
   - Toda a interface usa `system-ui` + `ui-monospace` padrão sem fonte display de título/HUD que dê personalidade ao **PokéVerse OS**.
   - As badges `.tipo-badge` e chips de efetividade ainda não possuem a paleta semântica dedicada dos **18 tipos Pokémon** (`fire`, `water`, `electric`, `grass`, etc.) com contraste WCAG AA garantido.
5. **Ritmo espacial desigual e ausência de transições entre vistas:**
   - Espaçamentos, raios de borda e elevações variam entre HUD, Pokédex, Museu, Enciclopédia e diálogos `<dialog>`.
   - Faltam transições suaves (`View Transitions API` / animações compostas por GPU com suporte a `prefers-reduced-motion`) na troca de rotas e abertura de painéis.

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
| **Museu das Regiões (`/museu`)** | [`museum-page.component.ts`](../apps/web/src/app/features/regions-museum/museum-page.component.ts) | Estilos inline dentro do `.ts` com `oklch(...)` e `rgba(...)` hardcoded; cards textuais simples sem mapa/emblema regional | Extrair SCSS dedicado usando tokens `--pv-*`, criar identidade visual própria por região (Kanto–Paldea) e integrar com o Holocron 3D no Passo `2B.3` |
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

### Onda Visual 1 — Fundação do Design System Unificado
- Consolidar `_tokens.scss` em uma árvore única `--pv-*` (superfícies, tintas, bordas, sombras, raios, escalas de espaço e movimento), mantendo aliases temporários apenas onde a carcaça 3D exigir retrocompatibilidade.
- Definir paleta semântica acessível (WCAG AA) para os **18 tipos Pokémon** (`--pv-type-fire-*`, `--pv-type-electric-*`, etc.) reutilizada no Visor LCD, no Comparador 1v1 e na Enciclopédia.
- Extrair primitivos visuais compartilhados para botões táticos, chips interativos, cards de vidro fosco (`backdrop-filter` desligado automaticamente em `html[data-perf-tier='lite']`) e cabeçalhos/rodapés de `<dialog>`.

### Onda Visual 2 — Ergonomia e Hierarquia da Pokédex 3D (Sem Mudar a Carcaça)
- Preservar 100% da geometria, materiais, dobradiça, tampa, D-Pad e 10 slots azuis.
- Reorganizar o Visor LCD 2.0 com *segmented controls* para alternância de mídia (`Arte | Home | Animado`) e variação (`Shiny | Grito | Retrô | 1v1`), reduzindo poluição visual e mantendo área de toque `>= 44×44px`.
- Dar acabamento visual mais limpo ao painel de filtros colapsável na ala esquerda (agrupamento em 2 seções recolhíveis ou abas rápidas `Tipos & Gen` / `Taxonomia & Ordem`).

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
