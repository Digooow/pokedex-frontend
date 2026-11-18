# 14 — Status Real da Implementação, Mudanças vs. Plano Original e Backlog

> **Última atualização:** Fase 2 concluída e validada ao vivo (pré-rodada de Blindagem de Segurança / Auth).
> Este documento existe para preservar contexto completo entre sessões de desenvolvimento: **o que já foi entregue**, **o que divergiu ou evoluiu em relação aos documentos originais (`00` a `12`)** e **o que ainda falta construir**.

---

## 1. Linha do Tempo de Execução por Fase

| Fase | Nome | Status | Principais Evidências Verificadas no Repositório |
| :--- | :--- | :---: | :--- |
| **Fase 0** | **Pokédex 3D Estática (Vanilla)** | **Concluída** | [index.html](../index.html), [css/style.css](../css/style.css), [js/app.js](../js/app.js), [assets/](../assets/) preservados intactos na raiz para GitHub Pages |
| **Fase 1** | **Fundação Monorepo + Shell Angular + Pokédex Integrada** | **Concluída** | Workspaces `@pokeverse/shared`, `pokeverse-api`, `pokeverse-web`; `infra/docker/docker-compose.yml` saudável (`postgres`, `redis`, `redpanda`, `redpanda-console`, `minio` via `pgsty/silo`); Shell HUD + Pokédex 3D com fallback direto à PokéAPI |
| **Fase 2** | **API NestJS + Auth + PostgreSQL/Prisma + Redis + Redpanda Outbox + WS** | **Concluída** *(próxima parada: Blindagem do Dossiê 13)* | Schema Prisma com 10 tabelas de domínio + migration inicial com índice parcial `idx_outbox_pending`; Auth Argon2id + JWT RAM + Refresh HttpOnly com rotação/reuso; Cache Redis PokéAPI (`X-Cache`); 10 slots em ACID; Outbox (`SKIP LOCKED`) -> Redpanda -> Consumidor Idempotente Redis -> `/ws/world` Ticker ao vivo no Angular |
| **Hardening** | **Blindagem Auth & AppSec (Onda 1 do Dossiê 13)** | **Próxima Etapa Planejada** | Evolução da autenticação além de JWT Bearer simples (Sessão Opaca Redis BFF ou JWT Hardened), CSRF `Origin`/`Sec-Fetch-Site`, Redis Throttler, login constant-time e limpeza de metadados Fase 1 |
| **Fase 3** | **Overworld Explorável 2D/HD-2D (Phaser 3)** | **Pendente** | `WorldStore`, mapa da Vila Central, colisões, portais físicos, ciclo dia/noite, presença multiplayer autenticada via `WsAuthGuard` + Redis |
| **Fase 4** | **Holocron 3D (Three.js) + Museu das Regiões & Jogos** | **Pendente** | Cena Title Screen Three.js + GLSL, pedestal Holocron 3D, `MuseumModule` no back-end e evolução do placeholder [museum-page.component.ts](../apps/web/src/app/features/regions-museum/museum-page.component.ts) |
| **Fase 5** | **Arcade Retrô 3D (WASM) + MinIO/S3 + Cloud Save States** | **Pendente** | `ArcadeModule`, stream autenticado/presigned URLs para ROMs no bucket privado `pokeverse-roms`, console portátil 3D com `CanvasTexture` e *Cloud Saves* validados |
| **Fase 6** | **Battle Frontier (Team Builder + Mini-Games + PvE/PvP)** | **Pendente** | `TeamsModule`, `MinigamesModule` (anti-cheat + Redis Sorted Sets), `BattleModule` + `BattleGateway` + matchmaking Kafka e CI/CD completo com Release Gates |

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

### 2.5. Linha de Base Medida Atual (Pós-Correções SonarLint)
- **Qualidade:** `eslint` (`apps/api`) `0` erros / `0` warnings; `tsc --noEmit` `0` erros nos 3 workspaces; `node --check js\app.js` aprovado; SonarLint zerado nos apontamentos reportados.
- **Testes:** `@pokeverse/shared` (`2` arquivos, `10` testes), `pokeverse-api` unit (`5` suítes, `9` testes) + E2E (`1` suíte, `4` testes), `pokeverse-web` (`1` arquivo, `4` testes).
- **Bundle Inicial Angular (`ng build`):** **`731.49 kB` raw / `160.69 kB` transfer estimado** (`0` warnings de budget; chunk lazy `socket.io-client` em `42.17 kB` raw / `11.92 kB` transfer).
- **Smoke Test ao Vivo (API `:3000` + Docker):** `/health/ready` (`200`), bloqueio `401` visitante, `register` (`201`), cache Redis `MISS -> HIT`, CRUD slots + `OutboxEvent` (`PUBLISHED`) -> Redpanda -> WebSocket `/ws/world` ao vivo, rotação/reuso refresh (`401/401`) e login/logout (`200/204`) validados com limpeza pós-teste no Postgres.

---

## 3. O que Mudou em Relação ao Planejamento Original (`00` a `12`)

| Item nos Docs Originais | Como Foi Realmente Implementado | Motivo da Mudança |
| :--- | :--- | :--- |
| **Turborepo** mencionado como opção no doc `01` | **npm workspaces** puros na raiz (`package.json`) | Menor complexidade e dependências no monorepo inicial sem perder scripts unificados |
| **MinIO oficial** (`minio/minio` / `minio/mc`) | **`pgsty/silo:RELEASE.2026-11-12T00-00-00Z`** | Imagens antigas do Docker Hub sofreram restrição pública; `silo` entrega S3 + `mc` compatíveis em uma imagem pinada |
| **Prisma mais recente** | **Prisma `6.19.3`** (`prisma` + `@prisma/client`) | Compatibilidade direta em CJS com NestJS 11 + `ts-jest` sem fricção de adapters ESM do Prisma 7/8 |
| **`@nestjs/jwt` mais recente** | **`@nestjs/jwt` `^11.0.2`** | A v12 publicou apenas ESM, quebrando carregamento CJS em Jest; v11 alinha nativamente com `@nestjs/common@11` |
| **Prefixes Angular `app-*` / `[appRequiresTrainer]`** | Prefixo **`pv-*`** e diretiva **`[pvRequiresTrainer]`** em [requires-trainer.directive.ts](../apps/web/src/app/shared/directives/requires-trainer.directive.ts) | Evitar colisões de seletor e padronizar namespace *PokéVerse* |
| **Rotas `/mundo`, `/arcade`, `/arena`** | Protegidas por `authGuard`, apontando provisoriamente para `TitleScreenComponent` | Permitir navegação e testes do guard desde a Fase 1 antes de criar Phaser/WASM/Arena nas Fases 3–6 |
| **Pokédex Angular dependente só da API** | Consome `/api/v1/pokedex/*` (Redis) com fallback automático para PokéAPI direta | Garantir funcionamento offline/degradado de visitante mesmo se a API NestJS estiver desligada |
| **`POST /auth/logout` protegido por Bearer** (tabela do doc `04`) | **`@Public()` usando o cookie `pokeverse_refresh`** em [auth.controller.ts](../apps/api/src/modules/auth/auth.controller.ts) | Permitir encerrar sessão e revogar `familyId` no banco mesmo quando o access token em RAM já expirou ou após recarregar |
| **`OutboxEvent.eventType`** | Armazena o **tópico Kafka** (`pokeverse.world.events.v1`), enquanto `payload.eventType` carrega o nome do evento (`trainer.registered`, `pokedex.slot.saved`, `pokedex.slot.cleared`) | Roteamento direto pelo `OutboxRelayService` mantendo metadado semântico validado por Zod no payload |
| **`WorldGateway` com `WsJwtGuard`** (tabela do doc `04`) | Conexão **sem guard no handshake** nesta fase | Permitir exibição do Ticker Global na Topbar também para Visitantes; entrada em mapa/ações privadas exigirá `WsAuthGuard` antes da Fase 3 |
| **`socket.io-client` no bundle inicial** | Importado dinamicamente (`await import('socket.io-client')`) em [world-ticker.store.ts](../apps/web/src/app/core/stores/world-ticker.store.ts) | Manter o bundle inicial Angular abaixo do teto de `750 kB` raw / `220 kB` gzip (`160.69 kB` medido) |

---

## 4. O que Falta Fazer (Dívidas Conhecidas + Fases 3 a 6)

### 4.1. Limpezas & Endurecimento Imediato (Antes da Fase 3)
1. **Executar a Onda 1 do [Dossiê de Segurança (doc 13)](13-dossie-de-seguranca-e-blindagem.md):**
   - Evoluir Auth (Sessão Opaca Redis BFF ou JWT EdDSA + Redis revogação), CSRF `Origin`/`Sec-Fetch-Site`, `login()` dummy Argon2id, `@nestjs/throttler` no Redis, `SAFE_POKEMON_PARAM` com limite `{1,64}` + `redirect: 'error'`, CSP explícita, sanitização de `returnUrl` e redação de segredos em logs.
2. **Remover textos residuais da Fase 1 ainda presentes em código:**
   - [system.controller.ts](../apps/api/src/modules/system/system.controller.ts#L16): alterar `phase: 'phase-1'` para refletir a fase atual (`'phase-2'` / dinâmico);
   - [auth.guard.ts](../apps/web/src/app/core/guards/auth.guard.ts#L19) e [requires-trainer.directive.ts](../apps/web/src/app/shared/directives/requires-trainer.directive.ts#L13): remover menção `"será habilitada/ativada na Fase 2"`.
3. **Observação de verificação visual em navegador:**
   - Concluir inspeção automatizada em desktop (`1440×900`) e mobile (`375×812`) no Chrome assim que as tools bloqueadas no MCP (`navigate_page`, `take_screenshot`, `list_console_messages`, `list_network_requests`) estiverem liberadas ou via suíte Playwright no CI.

### 4.2. Backlog Funcional das Próximas Fases
- **Fase 3 (Overworld 2D/HD-2D — Phaser 3):** `WorldModule` autenticado com `WsAuthGuard` + rate limit WS, `TrainersModule` (`GET/PATCH /trainers/me`, posição/avatar), presença Redis com heartbeat e cena Phaser lazy-loaded + `FpsWatchdog`.
- **Fase 4 (Holocron 3D & Museu):** cena Three.js para Title Screen + pedestal Holocron 3D, `MuseumModule` no NestJS, conteúdo interativo completo de Kanto a Paldea e linha do tempo de jogos.
- **Fase 5 (Arcade Retrô 3D + S3):** `ArcadeModule` + catálogo seedado em `ArcadeRom`, stream/Presigned URLs de `60s`, portátil 3D com `CanvasTexture` + emulador WASM, validação SHA-256 + `pokeverse.arcade.savestate.v1`.
- **Fase 6 (Battle Frontier + Release Gates):** `TeamsModule` + Worker de sinergia, `MinigamesModule` anti-cheat + Redis Sorted Sets, `BattleModule` + `BattleGateway` + matchmaking Kafka, métricas RED/USE + `PerfHUD` + OpenTelemetry completo e GitHub Actions com os 5 gates do [doc 11](11-performance-hardware-gates-e-mobile.md) + pipeline DevSecOps (`gitleaks`, `npm audit`, Trivy).
