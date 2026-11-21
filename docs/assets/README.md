# Assets da documentação

Esta pasta guarda as imagens usadas pelo [README principal](../../README.md) e pelo [Capítulo Zero](../capitulo-zero-como-tudo-comecou.md).

| Arquivo | Descrição |
| :--- | :--- |
| `banner.svg` | Banner do README (vetorial, sem dependências) |
| `screenshots/01-pokedex-fechada-desktop.webp` | Pokédex fechada, `1440×900` |
| `screenshots/02-pokedex-aberta-desktop.webp` | Pokédex aberta, `1440×900` |
| `screenshots/03-pokedex-pikachu-desktop.webp` | Pikachu no visor com slot 01 salvo, HUD autenticado |
| `screenshots/04-museu-desktop.webp` | Museu das Regiões |
| `screenshots/05-vila-central-em-construcao-desktop.webp` | Módulo em construção: Vila Central |
| `screenshots/06-battle-frontier-em-construcao-desktop.webp` | Módulo em construção: Battle Frontier |
| `screenshots/07-pokedex-pikachu-mobile.webp` | Pokédex no mobile, `375×812` |
| `screenshots/08-museu-mobile.webp` | Museu no mobile, `375×812` |
| `screenshots/09-fase0-estatica-fechada.webp` | Fase 0 (HTML, CSS e JS puro), fechada |
| `screenshots/10-fase0-estatica-aberta.webp` | Fase 0 (HTML, CSS e JS puro), aberta |

## Como as capturas foram feitas

As imagens vêm do **build de produção** do Angular e da Fase 0 estática, servidos localmente e capturados com Chrome headless via CDP. A API foi simulada por um servidor local que repassa o catálogo e os detalhes reais da PokéAPI.

1. Gere o build: `npm run build:shared && npm run build:web`.
2. Sirva `apps/web/dist/pokeverse-web/browser` com fallback de SPA e simule `/api/v1/*` e `/health/ready`. O [`scripts/ui-quality-gate.mjs`](../../scripts/ui-quality-gate.mjs) tem um exemplo de servidor e de sessão CDP.
3. Capture com `Page.captureScreenshot` (`format: webp`, `quality: 86`) em `1440×900` e `375×812`.

Os screenshots devem ser refeitos sempre que a interface mudar de forma visível. Isso mantém o README honesto em relação ao estado real do projeto.
