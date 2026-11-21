# 14 — Status Real da Implementação, Mudanças vs. Plano Original e Backlog

> **Última atualização:** Auditoria Técnica, Correções Críticas de Concorrência/OTP/Outbox, Blindagem SOLID/Clean Code ([doc 17](17-plano-solid-clean-code-e-engenharia-big-tech.md)), Cookies/LGPD ([doc 16](16-cookies-lgpd-e-requisitos.md)) e Preparação da **Pokédex Suprema + Laboratório Genético** ([doc 15](15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md)).
> Este documento preserva o histórico real entre sessões: **o que já foi entregue**, **onde mudamos a rota em relação aos documentos iniciais (`00` a `12`)**, e o **Plano de Ação atualizado**.

---

## 1. Linha do Tempo e Nova Priorização

| Etapa | Nome | Status | Principais Evidências Verificadas no Repositório |
| :--- | :--- | :---: | :--- |
| **Fase 0** | **Pokédex 3D Estática (Vanilla)** | **Concluída** | [index.html](../index.html), [css/style.css](../css/style.css), [js/app.js](../js/app.js), [assets/](../assets/) preservados intactos na raiz (GitHub Pages histórico) |
| **Fase 1** | **Fundação Monorepo + Shell Angular** | **Concluída** | Workspaces `@pokeverse/shared`, `pokeverse-api`, `pokeverse-web`; `infra/docker/docker-compose.yml` saudável (`postgres`, `redis`, `redpanda`, `redpanda-console`, `minio` via `pgsty/silo`) |
| **Fase 2** | **API NestJS + PostgreSQL/Prisma + Redis + Redpanda Outbox + WS** | **Concluída** | Schema Prisma + `idx_outbox_pending`; Cache Redis PokéAPI (`X-Cache` para catálogo + detalhe); 10 slots em ACID; Outbox (`SKIP LOCKED`) -> Redpanda -> Consumidor Idempotente Redis -> `/ws/world` Ticker ao vivo |
| **Etapas 2A + 2B + Qualidade** | **IAM Enterprise BFF + Hardening SonarCloud** | **Concluída** | Zero JWT no JS; cookies `HttpOnly` + Redis (`MFA_PENDING -> AUTHENTICATED`); `CsrfOriginGuard`; `RedisThrottlerStorage`; dummy Argon2id; Mailpit (`:1025/:8025`) + Redpanda AES-256-GCM + adapter Resend/SMTP; TOTP QR + 8 backup codes; Google OAuth PKCE; Passkeys WebAuthn; mapper único em [session.service.ts](../apps/api/src/modules/auth/session.service.ts), [AGENTS.md](../AGENTS.md) e [.sonarcloud.properties](../.sonarcloud.properties) |
| **Fase 3 (Item 1)** | **Infraestrutura Oficial & Deploy Cloud (Saída do GitHub Pages)** | **Concluída** | `api.Dockerfile`, proxy same-origin Cloudflare Pages em `https://pokeverse.pages.dev`, Azure Container Apps `pokeverse-api` (`brazilsouth`), Neon Postgres (`production`), Upstash Redis TLS (`sa-east-1`), Aiven Kafka Free (`mTLS`), Resend e CI/CD GitHub Actions (`ENABLE_CLOUD_DEPLOY=true`) validados em HTTPS (`/health/ready` 200, `X-Cache=HIT`, WebSocket) |
| **Fase 4A (Concluída)** | **Restauração Fiel 3D + Auditoria CSP/Bundle + Modelagem 51 Endpoints & Lab** | **Concluída** | Porte fiel do hardware 3D ([_pokedex-classic.scss](../apps/web/src/styles/_pokedex-classic.scss)), giro bidirecional reversível em movimento, 2 cliques/botão redondo `A`, unicidade por slot (front + `409 Conflict` na API), `DELETE /api/v1/pokedex/slots` atômico, `stale-fallback` 7d no Redis, correção CSP `inlineCritical: false` ([angular.json](../apps/web/angular.json)), redução do bundle inicial (`490.00 kB`), zero comentários/emojis e domínio [pokeapi-endpoints.ts](../packages/shared/src/domain/pokeapi-endpoints.ts) + [pokemon-lab.ts](../packages/shared/src/domain/pokemon-lab.ts) |
| **Hardening Pós-4A** | **Correções de Concorrência, SOLID & LGPD** | **Concluída** | Fix de DoS pré-constraint no OTP de registro (`P2002`), contadores atômicos Lua no Redis (`OtpService`/Login/MFA), rollback de idempotência em falhas dos consumidores Kafka, *atomic lease* (`UPDATE ... RETURNING`) no `OutboxRelayService`, alinhamento MFA no Google OAuth, `[attr.src]` no backdrop e plano Big Tech em [doc 17](17-plano-solid-clean-code-e-engenharia-big-tech.md) |
| **Fase 4B (Próxima)** | **Pokédex Suprema: 5 Abas LCD, Consultas Avançadas & Motor WebGL2/Audio** | **Próxima** | Endpoints agregados no NestJS para os `51` recursos da PokéAPI, filtro multi-critério no painel de busca, 5 abas paginadas no visor, espectrograma Web Audio nos *Cries* e modo Holocron Three.js (`LITE` compatível) |
| **Fase 5 (Futura)** | **Back-end do Laboratório Genético & Mecânicas de Jogo** | **Modelada** | Persistência e endpoints autoritativos baseados em [pokemon-lab.ts](../packages/shared/src/domain/pokemon-lab.ts): calculadora de atributos/XP por nível, chances de evolução, replicação/clonagem, reciclagem em Bio-Essência (`Rank E..APEX`), encontros e combate |
| **Fase 6 (Expansões Futuras)** | **Overworld Phaser 3 + Museu + Arcade WASM + Battle Frontier** | **Futura** | Ativação completa do mundo explorável (`WsAuthGuard`), emulador WASM + R2 e batalhas PvE/PvP ([docs 03, 07, 08, 09](00-visao-geral-e-roadmap.md)) |

---

## 2. Inventário Detalhado do que Já Foi Construído

### 2.1. Infraestrutura Docker ([docker-compose.yml](../infra/docker/docker-compose.yml))

- **PostgreSQL 16 (`pokeverse-postgres`):** porta externa configurável (`5433` no `.env.example` para não colidir com `5432` local), volume persistente e `healthcheck` via `pg_isready`.
- **Redis 7 (`pokeverse-redis`):** AOF habilitado (`--appendonly yes`), porta `6379`, `healthcheck` via `redis-cli ping`.
- **Redpanda v24.2.4 (`pokeverse-redpanda`) + Console v2.7.2 (`pokeverse-redpanda-console`):** broker Kafka em `:19092` e Console Web em `:8085`.
- **Object Storage S3 (`pokeverse-minio` / `pokeverse-minio-init`):** imagem pinada `pgsty/silo:RELEASE.2026-11-12T00-00-00Z` na porta `:9000` / console `:9001`, criando buckets privados (`mc anonymous set none`) `pokeverse-roms` e `pokeverse-saves`.

### 2.2. Contratos Compartilhados ([packages/shared](../packages/shared))

- [auth.schemas.ts](../packages/shared/src/schemas/auth.schemas.ts): `RegisterTrainerSchema`, `LoginTrainerSchema`, `TrainerProfileSchema`, `AuthSessionResponseSchema`.
- [pokedex.schemas.ts](../packages/shared/src/schemas/pokedex.schemas.ts): `PokeApiCatalogResponseSchema`, `PokemonDetailSchema`, `SavePokedexSlotSchema`, `PokedexSlotRecordSchema`, `PokedexSlotsListResponseSchema`, `CachedPokemonResponseSchema`, `CachedCatalogResponseSchema`.
- [events.schemas.ts](../packages/shared/src/schemas/events.schemas.ts): `KAFKA_TOPICS` (4 tópicos de domínio + `pokeverse.dlq.v1`), `WorldTickerEventSchema`.
- [health.schemas.ts](../packages/shared/src/schemas/health.schemas.ts), [platform.constants.ts](../packages/shared/src/constants/platform.constants.ts), [async-state.ts](../packages/shared/src/types/async-state.ts) e [pokedex-search.ts](../packages/shared/src/domain/pokedex-search.ts) (normalização Unicode, chave fonética PT/EN e distância de Damerau-Levenshtein portada com testes em Vitest).

### 2.3. Back-end NestJS ([apps/api](../apps/api))

- **Persistência & Migration:** [schema.prisma](../apps/api/prisma/schema.prisma) com os 10 modelos do domínio (`Trainer`, `RefreshToken`, `PokedexSlot`, `PokemonTeam`, `PokemonTeamMember`, `ArcadeRom`, `ArcadeSaveState`, `MinigameScore`, `BattleMatch`, `OutboxEvent`), migration inicial aplicada em [migration.sql](../apps/api/prisma/migrations/20261118073124_init_pokeverse_schema/migration.sql) + índice parcial `idx_outbox_pending`.
- **Infraestrutura e Probes:** [prisma.service.ts](../apps/api/src/infra/prisma.service.ts), [redis.service.ts](../apps/api/src/infra/redis.service.ts), [kafka.service.ts](../apps/api/src/infra/kafka.service.ts) e [infra-probes.service.ts](../apps/api/src/infra/infra-probes.service.ts) consumidos em `/health/live` e `/health/ready`.
- **Segurança & Middleware Base:** [env.schema.ts](../apps/api/src/config/env.schema.ts) (validação fail-fast via Zod sem vazar valores), [app.setup.ts](../apps/api/src/app.setup.ts) (`helmet()`, `cookieParser()`, CORS por `CORS_ORIGINS`, prefixo `/api/v1`), [correlation.middleware.ts](../apps/api/src/common/middleware/correlation.middleware.ts) (`x-correlation-id` + W3C `traceparent`), [global-exception.filter.ts](../apps/api/src/common/filters/global-exception.filter.ts), [structured-logger.service.ts](../apps/api/src/common/telemetry/structured-logger.service.ts), [zod-validation.pipe.ts](../apps/api/src/common/pipes/zod-validation.pipe.ts), [jwt-auth.guard.ts](../apps/api/src/common/guards/jwt-auth.guard.ts) e `ThrottlerGuard` globais em [app.module.ts](../apps/api/src/app.module.ts).
- **Módulos de Negócio Entregues:**
  - **Auth:** [auth.controller.ts](../apps/api/src/modules/auth/auth.controller.ts) & [auth.service.ts](../apps/api/src/modules/auth/auth.service.ts) (`/register`, `/login`, `/refresh`, `/logout`, `/me`).
  - **Pokédex Cache + Slots:** [pokedex.controller.ts](../apps/api/src/modules/pokedex/pokedex.controller.ts), [pokeapi-cache.service.ts](../apps/api/src/modules/pokedex/pokeapi-cache.service.ts) e [pokedex-slots.service.ts](../apps/api/src/modules/pokedex/pokedex-slots.service.ts).
  - **Eventos Outbox & WebSocket:** [outbox-relay.service.ts](../apps/api/src/modules/events/outbox-relay.service.ts), [world-events.consumer.ts](../apps/api/src/modules/events/world-events.consumer.ts) e [world.gateway.ts](../apps/api/src/modules/world/world.gateway.ts) (`/ws/world`).

### 2.4. Front-end Angular ([apps/web](../apps/web))

- **Boot & Proxies:** Angular Standalone + Signals + Zoneless (`provideZonelessChangeDetection()`), `provideHttpClient(withInterceptors([authInterceptor]))` em [app.config.ts](../apps/web/src/app/app.config.ts) e proxy dev `/api`, `/health` e `/socket.io` (`ws: true`) em [proxy.conf.json](../apps/web/proxy.conf.json).
- **Stores & Interceptores:** [auth.store.ts](../apps/web/src/app/core/stores/auth.store.ts), [auth.interceptor.ts](../apps/web/src/app/core/interceptors/auth.interceptor.ts), [world-ticker.store.ts](../apps/web/src/app/core/stores/world-ticker.store.ts) (com `import('socket.io-client')` lazy), [quality.store.ts](../apps/web/src/app/core/stores/quality.store.ts) e [system-status.store.ts](../apps/web/src/app/core/stores/system-status.store.ts).
- **HUD & Pokédex 3D Integrada:** [hud-topbar.component.ts](../apps/web/src/app/shared/hud/hud-topbar.component.ts), [hud-quick-dock.component.ts](../apps/web/src/app/shared/hud/hud-quick-dock.component.ts), [visitor-lock-dialog.component.ts](../apps/web/src/app/shared/hud/visitor-lock-dialog.component.ts), [requires-trainer.directive.ts](../apps/web/src/app/shared/directives/requires-trainer.directive.ts), [title-screen.component.ts](../apps/web/src/app/features/title-screen/title-screen.component.ts), [pokedex-device.component.ts](../apps/web/src/app/features/pokedex-device/pokedex-device.component.ts), [pokedex.store.ts](../apps/web/src/app/features/pokedex-device/services/pokedex.store.ts) e [pokedex-slots.store.ts](../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts).

### 2.5. Linha de Base Medida Atual (Pós-Auditoria e Restauração 3D)

- **Qualidade & Regras:** `eslint` (`apps/api`), `tsc --noEmit` nos 3 workspaces, varredura automática com **`0` comentários** e **`0` emojis** fora da Fase 0, validação com cabeçalho CSP de [apps/web/public/_headers](../apps/web/public/_headers), [AGENTS.md](../AGENTS.md) e [.sonarcloud.properties](../.sonarcloud.properties).
- **Testes:** `@pokeverse/shared` (`3` arquivos, `15` testes Vitest), `pokeverse-api` unit (`8` suítes, `16` testes Jest), `pokeverse-web` (`1` arquivo, `10` testes Vitest).
- **Bundle Inicial Angular (`ng build`):** **`490.00 kB` raw / `127.33 kB` transfer estimado** (`0` warnings de budget após correção do tree-shaking de Zod v4; CSS global `styles` em `67.22 kB` raw / `11.47 kB` transfer; chunks lazy carregados sob demanda, incluindo `pokedex-device-component` em `77.57 kB`, `visitor-lock-dialog-component` em `18.02 kB`, `security-settings-dialog-component` em `13.78 kB` e `socket.io-client` em `42.17 kB`).
- **Smoke Tests ao Vivo (API `:3000` + Docker):** `/health/ready` (`200`), visita vs rotas privadas (`401/403`), CSRF `Origin`/`Sec-Fetch-Site`, sessão BFF Redis `MFA_PENDING -> AUTHENTICATED`, Outbox AES-256-GCM -> Redpanda -> Mailpit (`:8025`), OTP verificação/recuperação (limite 3 tentativas), TOTP QR + 8 backup codes, Passkeys options, proteção ATO no Google PKCE e cache PokéAPI + CRUD 10 slots aprovados ponta a ponta.

---

## 3. O que Mudou em Relação ao Planejamento Original (`00` a `12`)

| Item nos Docs Originais | Como Foi Realmente Implementado | Motivo / Lição Aprendida |
| :--- | :--- | :--- |
| **Turborepo** mencionado como opção no doc `01` | **npm workspaces** puros na raiz (`package.json`) | Menor complexidade e dependências no monorepo inicial sem perder scripts unificados |
| **MinIO oficial** (`minio/minio` / `minio/mc`) | **`pgsty/silo:RELEASE.2026-11-12T00-00-00Z`** | Imagens antigas do Docker Hub sofreram restrição pública; `silo` entrega S3 + `mc` compatíveis em uma imagem pinada |
| **Prisma mais recente** | **Prisma `6.19.3`** (`prisma` + `@prisma/client`) | Compatibilidade direta em CJS com NestJS 11 + `ts-jest` sem fricção de adapters ESM do Prisma 7/8 |
| **Auth Stateless com JWT no navegador** (`doc 04` v1) | **Sessão Opaca BFF no Redis + Cookie `HttpOnly`** (sem `@nestjs/jwt` no fluxo principal) | Segurança enterprise: revogação instantânea no Redis, máquina `MFA_PENDING -> AUTHENTICATED`, zero token exposto no JS |
| **Prefixes Angular `app-*` / `[appRequiresTrainer]`** | Prefixo **`pv-*`** e diretiva **`[pvRequiresTrainer]`** em [requires-trainer.directive.ts](../apps/web/src/app/shared/directives/requires-trainer.directive.ts) | Evitar colisões de seletor e padronizar namespace *PokéVerse* |
| **Rotas `/mundo`, `/arcade`, `/arena` visíveis no Dock desde a Fase 1** | Implementadas provisoriamente apontando para `TitleScreenComponent`; serão **ocultadas na Fase 4** até a entrega da Pokédex Definitiva | Foco no produto principal: evitar que botões futuros trancados desviem a experiência enquanto construímos a Pokédex |
| **Pokédex Angular ([_pokedex-classic.scss](../apps/web/src/styles/_pokedex-classic.scss))** | Inicialmente reduzida na Fase 1 (`pokedex-device.component.scss`, já removido), foi **integralmente restaurada na Fase 4A** em `_pokedex-classic.scss` com fidelidade 1:1 | Cumprida a Regra Zero de [AGENTS.md](../AGENTS.md), validada por comparação visual em Chrome (`1440×900` e `375×812`) sob CSP estrito de produção |
| **Pokédex Angular dependente só da API** | Consome `/api/v1/pokedex/*` (Redis) com fallback automático para PokéAPI direta | Garantir funcionamento offline/degradado de visitante mesmo se a API NestJS estiver desligada |
| **`OutboxEvent.eventType`** | Armazena o **tópico Kafka** (`pokeverse.world.events.v1` / `pokeverse.notifications.email.v1`), enquanto `payload.eventType` / `template` detalham o evento | Roteamento direto pelo `OutboxRelayService` mantendo metadado validado por Zod (e PII cifrada em AES-256-GCM para e-mails) |
| **`WorldGateway` com `WsJwtGuard`** (`doc 04`) | Conexão **sem guard no handshake** nesta fase | Permitir Ticker Global na Topbar para Visitantes; ações do Overworld exigirão `WsAuthGuard` + sessão Redis antes da Fase 5/6 |
| **`socket.io-client` e `@simplewebauthn/browser` no bundle** | Importados dinamicamente (`import(...)` / `@defer`) | Somado ao tree-shaking do Zod v4 em `@pokeverse/shared`, reduziu o bundle inicial Angular para **`490.00 kB` raw / `127.33 kB` transfer estimado** |

---

## 4. Plano de Ação Reordenado & Backlog (Aguardando Confirmação de Provedores)

### Item 1 (Concluído — Fase 3): Infraestrutura Oficial & Deploy Cloud (Saída do GitHub Pages)

1. **Pipeline & Proxy Same-Origin (`a339531` + `e880edf`):** `api.Dockerfile` multi-stage não-root, proxy same-origin Cloudflare Pages Functions (`apps/web/functions/`), GitHub Actions CI/CD e validação `env.schema.ts`.
2. **Serviços de Dados & Mensageria em São Paulo:** **Neon** (Postgres 18 + migrations aplicadas), **Upstash** (`rediss://` + `X-Cache=HIT`), **Aiven Kafka Free** (mTLS, `3` tópicos) e **Resend** configurados.
3. **Azure Container Apps + Cloudflare Pages + CI/CD:** `pokeverse-api` em `https://pokeverse-api.gentlebeach-3a27c858.brazilsouth.azurecontainerapps.io`, front publicado em **`https://pokeverse.pages.dev`** e secrets/vars ativos no GitHub (`ENABLE_CLOUD_DEPLOY=true`).
4. **Pendência opcional pós-go-live:** conectar domínio próprio `pokedex.digooow.<ext>` no Cloudflare + Resend e atualizar `CORS_ORIGINS`/`WEBAUTHN_*`/`GOOGLE_REDIRECT_URI` na Azure.

### Item 2 (Em Andamento — Fases 4A Concluída / 4B Próxima): Pokédex Suprema (3D + 51 Endpoints + Áudio/WebGL2)

1. **Já Entregue (4A):** restauração fiel do chassi 3D no Angular, giro bidirecional reversível mid-flight, seleção em 2 passos, unicidade nos 10 slots + confirmações nativas, correção CSP `inlineCritical: false`, tree-shaking Zod (`490.00 kB`), `stale-fallback` 7d no Redis e modelagem em [pokeapi-endpoints.ts](../packages/shared/src/domain/pokeapi-endpoints.ts) / [pokemon-lab.ts](../packages/shared/src/domain/pokemon-lab.ts).
2. **Próxima Entrega (4B — Detalhes em [doc 15](15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md)):**
   - **Consultas Avançadas & 5 Abas LCD:** endpoints agregados em [pokeapi-cache.service.ts](../apps/api/src/modules/pokedex/pokeapi-cache.service.ts) cobrindo espécie, evolução, golpes, habilidades, formas, encontros, gerações e índice compacto multi-filtro, além de **Pokémon TCG API** e **História/Anime**.
   - **Motor Audiovisual PS5/Anime:** espectrograma Web Audio em tempo real para os *Cries*, sons táteis da dobradiça/botões e projetor Holocron Three.js (`@defer`) respeitando `ULTRA / BALANCED / LITE`.
   - **PostgreSQL `TrainerPokemonSnapshot`:** persistência de snapshot atrelada aos favoritos do usuário para disponibilidade contínua mesmo em quedas prolongadas das APIs externas.

### Item 3 (Futuro — Fases 5 e 6): Back-end de Jogo & Expansões PokéVerse

- **Motor/Back-end de Jogo (Fase 5):** usar os dados detalhados da enciclopédia para construir chances de encontro, cálculo de dano das skills, matriz de forças/fraquezas e aumento de atributos por level.
- **Expansões Visuais & Jogáveis (Fase 6):** Overworld Phaser 3 (`WsAuthGuard`), Holocron/Museu completo, Arcade Retrô WASM (`pokeverse-roms`/R2) e Battle Frontier (Team Builder, Mini-Games, PvE/PvP), além de ondas 2–3 do [Dossiê 13](13-dossie-de-seguranca-e-blindagem.md) e portões CI/CD do [doc 11](11-performance-hardware-gates-e-mobile.md).
