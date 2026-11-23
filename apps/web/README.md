# PokéVerse Web (`pokeverse-web`)

Interface **Angular 22** (Standalone Components, Signals e Zoneless) da plataforma **PokéVerse OS**, incluindo o porte 3D skeuomórfico fiel da Pokédex, catálogo dos 51 endpoints da PokéAPI, HUD multiplayer, consentimento LGPD e proxy *same-origin* para Cloudflare Pages.

> Visão completa do projeto, UI Quality Gate e contratos em [`../../README.md`](../../README.md), [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) e [`../../docs/02-frontend-angular-hud-e-estado.md`](../../docs/02-frontend-angular-hud-e-estado.md).

## Destaques Arquiteturais

- **Fidelidade Visual & Perfis Adaptativos:** carcaça 3D em `_pokedex-classic.scss` (`styles/pokedex/`), iluminação dinâmica em `oklch` e troca automática/manual entre `ULTRA`, `BALANCED` e `LITE` via `QualityStore` e `PokedexLidPhysicsService`.
- **Estado Reativo & BFF:** stores baseadas em Signals (`AuthStore`, `SecurityIamStore`, `PrivacyConsentStore`, `PokedexStore`, `PokedexSlotsStore`, `WorldTickerStore`), sincronização multi-aba (`BroadcastChannel` + `navigator.locks`) e cookies `HttpOnly` *same-origin* via Cloudflare Pages Functions ([`cloudflare/api-proxy.ts`](cloudflare/api-proxy.ts)).
- **Segurança Web:** cabeçalhos CSP e HSTS em [`public/_headers`](public/_headers), validação HTTPS estrita em URLs (`isHttpsUrl`), zero `innerHTML` e `auth.guard.ts` com prevenção de *open redirect*.

## Comandos Principais

```bash
# Compilar contratos compartilhados antes do primeiro build/test isolado
npm run build:shared

# Servidor de desenvolvimento com proxy (/api, /health, /socket.io -> :3000)
npm run dev:web

# Verificações de tipo, ESLint, testes unitários (Vitest) e build
npm run typecheck --workspace=pokeverse-web
npm run lint --workspace=pokeverse-web
npm run test --workspace=pokeverse-web -- --watch=false
npm run build:web

# Auditoria visual headless em Desktop (1440x900) e Mobile (375x812)
npm run audit:ui
```
