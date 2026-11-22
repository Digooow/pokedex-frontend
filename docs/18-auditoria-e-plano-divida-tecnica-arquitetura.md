# 18 — Auditoria Técnica e Plano Vivo de Dívida Técnica (`ARCHITECTURE.md`)

> **Objetivo deste documento:** manter o inventário oficial e rastreável da conformidade do **PokéVerse OS** frente ao **[Contrato de Qualidade (`ARCHITECTURE.md`)](ARCHITECTURE.md)** e ao **[`AGENTS.md`](../AGENTS.md)**, orientando a execução atômica das **Ondas 1 a 4** em novos chats (ciclos curtos de até 5 prompts + `git commit`) e registrando a evolução das notas técnicas a cada entrega.

---

## 1. Scorecard da Auditoria (Linha de Base Atual)

**Nota Geral do Projeto: `9,6 / 10`** *(Nível Sênior / Staff — Ondas 1 e 2 concluídas; 100% da API NestJS aderente ao Contrato de Qualidade; restam as Ondas 3 e 4 para atingir 10,0 / 10)*

| # | Dimensão / Norma ([`ARCHITECTURE.md`](ARCHITECTURE.md) & [`AGENTS.md`](../AGENTS.md)) | Nota Atual | Meta | Status | Diagnóstico Resumido |
| :-: | :--- | :-: | :-: | :-: | :--- |
| **1** | **Concorrência, Estado Stateless & Mensageria** (§2.1, §2.3) | `10,0 / 10` | `10,0` | Pleno | Zero efeito pré-constraint (`P2002`) no OTP, Lua atômico (`INCR` + `EXPIRE`) no Redis, *Atomic Lease* (`UPDATE ... RETURNING`) no Outbox e rollback da trava de idempotência no `catch` dos consumidores Kafka. |
| **2** | **Segurança BFF, Fail-Fast & LGPD** (§3.1–§3.3, [Doc 16](16-cookies-lgpd-e-requisitos.md)) | `9,8 / 10` | `>= 9,8` | Pleno | Sessões opacas no Redis, cookies `__Host-`/`__Secure-`, Argon2id + dummy hash, `CsrfOriginGuard`, AES-256-GCM no Outbox, `env.schema.ts` fail-fast, validação Zod na borda OAuth/Passkeys e ciclo LGPD completo (`export`, `DELETE /auth/me`, expurgo). |
| **3** | **Regra Zero de UI, Fidelidade 3D & CWV** (`AGENTS.md` §1–§2) | `9,5 / 10` | `>= 9,5` | Pleno | Fase 0 intacta; Pokédex 3D com giro reversível em voo, CSP sem `'unsafe-inline'`, bundle inicial em `495,41 kB` raw e `audit:ui` validado em `1440×900` e `375×812`. |
| **4** | **Contratos Compartilhados & TypeScript Estrito** (§1.1) | `9,7 / 10` | `>= 9,5` | Pleno | `@pokeverse/shared` como fonte única (Zod v4 + domínio puro, incluindo `GoogleOAuthCallbackQuerySchema`, `PasskeyIdParamSchema`, `PokedexSlotIndexParamSchema` e `PokemonIdentifierParamSchema`) e `@typescript-eslint/no-explicit-any: error` nos 3 workspaces. |
| **5** | **Clean Code Anti-AI Slop & Early Returns** (§5.1–§5.4) | `9,3 / 10` | `>= 9,5` | Parcial | Linguagem ubíqua, *Guard Clauses*, zero literais `'PENDING'`/`'PUBLISHED'` em toda a API (`OutboxStatus.*` em `AuthModule`, `PokedexModule` e `EventsModule`); restam resíduos de DOM direto e cores literais no `hud-topbar` (Onda 3). |
| **6** | **Performance SQL, Projeção Estrita & Paginação** (§4.1–§4.4) | `9,8 / 10` | `>= 9,5` | Pleno | Zero N+1, `select` estrito e `take` explícito em 100% dos `.findMany()` e relações da API (`TrainerAccountRepository`, `AuthTokenRepository` com `distinct: ['familyId']`, `PasskeyRepository`, `TrainerOAuthRepository`, `PokedexSlotRepository`). |
| **7** | **SOLID & Limites de Coesão por Arquivo** (§1.2, `AGENTS.md` §3.1) | `9,0 / 10` | `>= 9,5` | Parcial | 100% de `apps/api` abaixo de `300` linhas (`mfa-totp.service.ts` em `278` e `passkey.service.ts` em `272` após extração de `totp-crypto.util.ts` e repositórios); restam 4 stores/services web e 9 componentes UI acima dos tetos na Onda 3. |
| **8** | **SoC: Controllers Finos & Repositórios Isolados** (§1.2, §1.3) | `10,0 / 10` | `>= 9,5` | Pleno | **100% da API (`AuthModule`, `PokedexModule`, `EventsModule`) isolada via repositórios dedicados** (zero `PrismaService` em services de negócio) e 100% dos parâmetros/queries externos validados via `ZodValidationPipe`. |

### Histórico de Evolução das Notas

| Marco / Onda | Data | Nota Geral | SoC & Repos | SOLID & Coesão | SQL & `take` | Clean Code | Observações |
| :--- | :---: | :-: | :-: | :-: | :-: | :-: | :--- |
| **Linha de Base Pós-`ARCHITECTURE.md`** | 2026-11-22 | **9,1** | 7,5 | 8,2 | 8,4 | 8,8 | Auditoria inicial após atualização da documentação normativa (`docs/ARCHITECTURE.md` e `AGENTS.md`). |
| **Após Onda 1** *(Pokedex + Events)* | 2026-11-22 | **9,3** | 8,3 | 8,4 | 8,8 | 9,0 | `PokedexSlotRepository` e `OutboxEventRepository` isolados; borda Zod em `PokedexController` e `PokeApiCacheService`; `take: TOTAL_POKEDEX_SLOTS` e `OutboxStatus.*` aplicados. |
| **Após Onda 2** *(AuthModule + Sem Emoticons)* | 2026-11-22 | **9,6** | 10,0 | 9,0 | 9,8 | 9,3 | 5 repositórios ISP de Auth + `totp-crypto.util.ts`, `distinct: ['familyId']` + `take`, `OutboxStatus.*` e borda Zod em `GoogleOAuthController`/`MfaController`; todos os arquivos de `AuthModule <= 278` linhas; emojis removidos fora da Fase 0. |
| **Após Onda 3** *(Front-End Web)* | — | *Pendente* | — | — | — | — | Decomposição SRP de stores e componentes da Pokédex, tokens HUD e `audit:ui` aprovado. |
| **Após Onda 4** *(ESLint + Testes)* | — | *Pendente* | — | — | — | — | Prettier + `max-lines`/`complexity` graduais nos 3 workspaces e fatiamento de `app.spec.ts`. |

---

## 2. Catálogo Rastreável de Dívidas Técnicas (`DT-01` a `DT-06`)

### `DT-01` — Ausência de Repositórios Isolados (`apps/api`) — **Resolvido na API**
- **Norma:** [`ARCHITECTURE.md` §1.2, §1.3 e §4.4](ARCHITECTURE.md#L44-L47) (*"Consultas diretas via `PrismaService` não devem poluir Services de negócio. Toda query SQL/Prisma, projeção (`select`), join (`include`) e transação ACID pertence a um Repository."*).
- **Situação Atual:**
  - **Pokédex & Eventos (Resolvido na Onda 1):**
    - [`pokedex-slot.repository.ts`](../apps/api/src/modules/pokedex/pokedex-slot.repository.ts) e [`pokedex-slots.service.ts`](../apps/api/src/modules/pokedex/pokedex-slots.service.ts): `PokedexSlotRepository` encapsula 100% das queries/transações do módulo `pokedex`.
    - [`outbox-event.repository.ts`](../apps/api/src/modules/events/outbox-event.repository.ts) e [`outbox-relay.service.ts`](../apps/api/src/modules/events/outbox-relay.service.ts): `OutboxEventRepository` encapsula a CTE `$queryRaw` de *atomic lease* e atualizações de status.
  - **IAM / Auth (Resolvido na Onda 2 — 5 Repositórios Segregados por ISP):**
    - [`trainer-account.repository.ts`](../apps/api/src/modules/auth/trainer-account.repository.ts): conta, cadastro ACID com Outbox, recuperação/verificação, overview de segurança, exportação e deleção LGPD.
    - [`auth-token.repository.ts`](../apps/api/src/modules/auth/auth-token.repository.ts): `RefreshToken`, rotação atômica, famílias de sessão ativas (`distinct: ['familyId']`) e expurgo temporal.
    - [`mfa-totp.repository.ts`](../apps/api/src/modules/auth/mfa-totp.repository.ts): estado TOTP, ativação/desativação transacional e consumo atômico de `MfaBackupCode`.
    - [`passkey.repository.ts`](../apps/api/src/modules/auth/passkey.repository.ts): CRUD e descritores WebAuthn (`TrainerPasskey`).
    - [`trainer-oauth.repository.ts`](../apps/api/src/modules/auth/trainer-oauth.repository.ts): vínculo e provisionamento transacional Google OAuth (`TrainerOAuthAccount`).
    - Todos os services do `AuthModule` ([`auth.service.ts`](../apps/api/src/modules/auth/auth.service.ts), [`credentials-auth.service.ts`](../apps/api/src/modules/auth/credentials-auth.service.ts), [`account-recovery.service.ts`](../apps/api/src/modules/auth/account-recovery.service.ts), [`token-refresh.service.ts`](../apps/api/src/modules/auth/token-refresh.service.ts), [`session-management.service.ts`](../apps/api/src/modules/auth/session-management.service.ts), [`trainer-gdpr.service.ts`](../apps/api/src/modules/auth/trainer-gdpr.service.ts), [`trainer-session-issuer.service.ts`](../apps/api/src/modules/auth/trainer-session-issuer.service.ts), [`google-account-linker.service.ts`](../apps/api/src/modules/auth/google-account-linker.service.ts), [`mfa-totp.service.ts`](../apps/api/src/modules/auth/mfa-totp.service.ts), [`passkey.service.ts`](../apps/api/src/modules/auth/passkey.service.ts), [`google-oauth.service.ts`](../apps/api/src/modules/auth/google-oauth.service.ts)) possuem **zero** dependências de `PrismaService`.

### `DT-02` — Validação na Borda (`ZodValidationPipe`) e Regras em Controllers — **Resolvido na API**
- **Norma:** [`ARCHITECTURE.md` §1.2 e §3.1](ARCHITECTURE.md#L145-L149) (*"Toda fronteira externa (`@Body`, `@Query`, `@Param`) deve passar por validação rigorosa via schemas Zod v4 e `ZodValidationPipe` antes de alcançar qualquer Service. Nenhuma regra de negócio pode existir dentro de um Controller."*).
- **Evidências:**
  1. [`pokedex.controller.ts`](../apps/api/src/modules/pokedex/pokedex.controller.ts) (**Resolvido na Onda 1**): `ZodValidationPipe(PokedexSlotIndexParamSchema)` e `ZodValidationPipe(PokemonIdentifierParamSchema)` substituindo `ParseIntPipe` e regra no controller.
  2. [`google-oauth.controller.ts`](../apps/api/src/modules/auth/google-oauth.controller.ts) e [`mfa.controller.ts`](../apps/api/src/modules/auth/mfa.controller.ts) (**Resolvido na Onda 2**):
     - `GoogleOAuthController.handleGoogleCallback` valida `@Query` com `new ZodValidationPipe(GoogleOAuthCallbackQuerySchema)` (descartando parâmetros extras do Google como `scope`/`authuser`/`prompt` e rejeitando *parameter pollution* ou `state` malformado com `400`).
     - `MfaController.deletePasskey` valida `@Param('id')` com `new ZodValidationPipe(PasskeyIdParamSchema)`.

### `DT-03` — Consultas `.findMany()` sem `take` Explícito / Paginação — **Resolvido na API**
- **Norma:** [`ARCHITECTURE.md` §4.2](ARCHITECTURE.md#L173-L179) (*"Consultas `.findMany()` sem `take` explícito são proibidas em endpoints da API."*).
- **Evidências:**
  1. [`pokedex-slot.repository.ts`](../apps/api/src/modules/pokedex/pokedex-slot.repository.ts) (**Resolvido na Onda 1**): `take: TOTAL_POKEDEX_SLOTS` (`10`) em `findByTrainerId()`.
  2. [`passkey.repository.ts`](../apps/api/src/modules/auth/passkey.repository.ts) (**Resolvido na Onda 2**): `take: MAX_PASSKEYS_PER_TRAINER` (`50`) em `listPasskeysByTrainer()`, `findTrainerForRegistration()` e `findPasskeyDescriptorsForLogin()`.
  3. [`auth-token.repository.ts`](../apps/api/src/modules/auth/auth-token.repository.ts) e [`session-management.service.ts`](../apps/api/src/modules/auth/session-management.service.ts) (**Resolvido na Onda 2**): `listActiveSessionFamilies()` usa `distinct: ['familyId']` e `take: MAX_ACTIVE_SESSION_FAMILIES` (`50`), eliminando o agrupamento manual via `Map` em memória.
  4. [`trainer-account.repository.ts`](../apps/api/src/modules/auth/trainer-account.repository.ts) e [`trainer-oauth.repository.ts`](../apps/api/src/modules/auth/trainer-oauth.repository.ts) (**Resolvido na Onda 2**): relações `oauthAccounts` (`take: 10` / `1`), `passkeys` (`take: 50` / `1`) e `pokedexSlots` (`take: TOTAL_POKEDEX_SLOTS`) com limites explícitos em `findSecurityOverviewById()`, `findExportSnapshotById()` e `findUnlinkCandidates()`.

### `DT-04` — Limites de Coesão SRP (`~300` linhas Services/Stores e `~150–200` linhas UI)
- **Norma Violada:** [`ARCHITECTURE.md` §1.2](ARCHITECTURE.md#L45) e [`AGENTS.md` §3.1](../AGENTS.md#L33).
- **Resolvido na API (Onda 2):** [`mfa-totp.service.ts`](../apps/api/src/modules/auth/mfa-totp.service.ts) caiu de `395` para **`278` linhas** (após extração de [`totp-crypto.util.ts`](../apps/api/src/modules/auth/totp-crypto.util.ts) com `110` linhas e [`mfa-totp.repository.ts`](../apps/api/src/modules/auth/mfa-totp.repository.ts) com `128` linhas) e [`passkey.service.ts`](../apps/api/src/modules/auth/passkey.service.ts) caiu de `330` para **`272` linhas** (após extração de [`passkey.repository.ts`](../apps/api/src/modules/auth/passkey.repository.ts) com `140` linhas) — todos os arquivos de `apps/api/src/modules/auth/` estão abaixo do teto normativo de `300` linhas.
- **Pendências no Front-End (Onda 3 — linhas medidas via `Measure-Object -Line`):**

| Camada | Arquivo | Linhas (SLOC) | Teto Alvo | Causa Principal |
| :--- | :--- | :-: | :-: | :--- |
| **Web Store** | [`pokedex.store.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex.store.ts) | `386` | `<= 300` | Mistura estado reativo, cliente HTTP com fallback direto e mapper de ViewModel/erros |
| **Web Store** | [`pokedex-slots.store.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts) | `384` | `<= 300` | Mistura estado reativo/API dos slots e persistência/parsing legado de `localStorage` |
| **Web Service** | [`pokedex-rpg-nav.service.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex-rpg-nav.service.ts) | `323` | `<= 300` | Concentra navegação D-pad, estado de telas/itens, tooltips e delegates de tampa |
| **Web Store** | [`auth.store.ts`](../apps/web/src/app/core/stores/auth.store.ts) | `315` | `<= 300` | Levemente acima do teto; coordenação OAuth/erros pode enxugar helpers |
| **Web UI** | [`pokedex-search-panel.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-search-panel.component.ts) | `450` | `<= 200` | Template HTML inline extenso + lógica de formulário, catálogo virtualizado e controles físicos (D-pad/A/B) |
| **Web UI** | [`pokedex-device.component.ts`](../apps/web/src/app/features/pokedex-device/pokedex-device.component.ts) | `412` | `<= 200` | Concentra atalhos globais de documento, ciclo de abertura/fechamento, slots e delegações |
| **Web UI** | [`pokedex-slots-config.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-slots-config.component.ts) | `346` | `<= 200` | Template/SCSS inline + formulário de edição e confirmação |
| **Web UI** | [`pokedex-visor.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-visor.component.ts) | `307` | `<= 200` | Template HTML inline + lógica de exibição LCD, sprites e fallback |
| **Web UI** | [`hud-topbar.component.ts`](../apps/web/src/app/shared/hud/hud-topbar.component.ts) | `306` | `<= 200` | Template/SCSS inline + lógica de badges e navegação de skip-link |
| **Web UI** | [`slot-confirm-dialog.component.ts`](../apps/web/src/app/features/pokedex-device/components/slot-confirm-dialog.component.ts) | `282` | `<= 200` | Template/SCSS inline longo para os 4 estados do diálogo |
| **Web UI** | [`visitor-lock-dialog.component.ts`](../apps/web/src/app/shared/hud/visitor-lock-dialog.component.ts) | `247` | `<= 200` | Concentra múltiplos modos de formulário auth no mesmo componente |
| **Web UI** | [`title-screen.component.ts`](../apps/web/src/app/features/title-screen/title-screen.component.ts) | `244` | `<= 200` | Template/SCSS inline combinados no `.ts` |
| **Web UI** | [`hud-quick-dock.component.ts`](../apps/web/src/app/shared/hud/hud-quick-dock.component.ts) | `208` | `<= 200` | Levemente acima do teto por template/SCSS inline |

### `DT-05` — Resíduos de DOM Direto (DIP), Literais de Status Outbox e Tokens CSS
- **Norma Violada:** [`ARCHITECTURE.md` §1.1 e §5.2](ARCHITECTURE.md#L26) e [`AGENTS.md` §3.5 / §3.9](../AGENTS.md#L56-L77).
- **Evidências:**
  1. **Strings mágicas de status Outbox (100% Resolvido na API — Ondas 1 e 2):** [`pokedex-slot.repository.ts`](../apps/api/src/modules/pokedex/pokedex-slot.repository.ts), [`outbox-event.repository.ts`](../apps/api/src/modules/events/outbox-event.repository.ts), [`auth-outbox-publisher.service.ts`](../apps/api/src/modules/auth/auth-outbox-publisher.service.ts) e [`auth-token.repository.ts`](../apps/api/src/modules/auth/auth-token.repository.ts) utilizam exclusivamente `OutboxStatus.PENDING`, `OutboxStatus.PUBLISHED` e `OutboxStatus.FAILED` do Prisma.
  2. **Consultas DOM residuais (DIP — pendente para Onda 3):**
     - `FALLBACK_SELECTORS` com `hostEl.querySelector`/`querySelectorAll`, `clearFocusVisuals`, `submitEditForm` e `document.querySelector('dialog[open]')` em [`rpg-focusable.directive.ts`](../apps/web/src/app/features/pokedex-device/directives/rpg-focusable.directive.ts).
     - `document.getElementById('btn-abrir-pokedex')` em [`pokedex-device.component.ts`](../apps/web/src/app/features/pokedex-device/pokedex-device.component.ts) e `document.getElementById('main-heading')` em [`hud-topbar.component.ts`](../apps/web/src/app/shared/hud/hud-topbar.component.ts).
  3. **Estilos hardcoded e duplo vocabulário de tokens (pendente para Onda 3):**
     - Cores hex/`rgba` literais avulsas (`#ecfdf5`, `#a7f3d0`, `#fecaca`, `rgba(...)`) nos estilos de [`hud-topbar.component.ts`](../apps/web/src/app/shared/hud/hud-topbar.component.ts).
     - Coexistência de `--pv-*` (`oklch`) e `--palette-*`/variáveis em português em [`_tokens.scss`](../apps/web/src/styles/_tokens.scss) *(qualquer consolidação deve preservar 100% da aparência visual — Regra Zero)*.

### `DT-06` — Guardrails Automatizados no ESLint/CI e Modularização de `app.spec.ts`
- **Norma Violada:** [`ARCHITECTURE.md` §6](ARCHITECTURE.md#L346-L350) e [`17-plano-solid-clean-code-e-engenharia-big-tech.md` §4](17-plano-solid-clean-code-e-engenharia-big-tech.md#L110-L111).
- **Evidências:**
  1. [`apps/web/eslint.config.mjs`](../apps/web/eslint.config.mjs) e [`packages/shared/eslint.config.mjs`](../packages/shared/eslint.config.mjs) não aplicam `eslint-plugin-prettier/recommended` nem regras graduais de `max-lines` e `complexity` presentes ou previstas junto a [`apps/api/eslint.config.mjs`](../apps/api/eslint.config.mjs).
  2. [`apps/web/src/app/app.spec.ts`](../apps/web/src/app/app.spec.ts) concentra `778` linhas de testes em um único arquivo monolítico.

---

## 3. Plano de Execução por Ondas Atômicas (Novos Chats)

Cada onda foi dimensionada para caber integralmente em **1 sessão curta (até 5 prompts)** seguida de validação completa e **`git commit`**.

| Onda | Foco Principal | Dívidas Endereçadas | Status |
| :-: | :--- | :--- | :-: |
| **Onda 1** | Repositórios, borda Zod e `take` em `PokedexModule` + `EventsModule` | `DT-01` (parcial), `DT-02` (parcial), `DT-03` (parcial), `DT-05` (Outbox) | Concluída |
| **Onda 2** | 5 repositórios ISP de Auth, `totp-crypto.util.ts` (`<= 300` linhas), `take`/`distinct`, borda OAuth/Passkeys e remoção de emoticons | `DT-01`, `DT-02`, `DT-03`, `DT-04` (API), `DT-05` (Outbox) | Concluída |
| **Onda 3** | Coesão SRP no Front-End (`apps/web` stores/UI), tokens HUD e remoção de `getElementById` | `DT-04` (Web), `DT-05` (Web/DOM/Tokens) | Pendente |
| **Onda 4** | Guardrails de ESLint/Prettier/`max-lines` nos 3 workspaces e fatiamento de `app.spec.ts` | `DT-06` | Pendente |

---

### Onda 1 — Isolamento de Repositórios, `take` e Borda Zod em `PokedexModule` + `EventsModule` (`Concluída`)
- **Cluster de Aproximação (`1 <-> 2 <-> 3`):**
  - *Upstreams (`@pokeverse/shared`):* [`pokedex.schemas.ts`](../packages/shared/src/schemas/pokedex.schemas.ts) (`PokedexSlotIndexParamSchema`, `PokemonIdentifierParamSchema`) + [`schemas.spec.ts`](../packages/shared/src/schemas/schemas.spec.ts).
  - *Alvos (`apps/api`):* [`pokedex.controller.ts`](../apps/api/src/modules/pokedex/pokedex.controller.ts), [`pokeapi-cache.service.ts`](../apps/api/src/modules/pokedex/pokeapi-cache.service.ts), [`pokedex-slots.service.ts`](../apps/api/src/modules/pokedex/pokedex-slots.service.ts), [`pokedex-slot.repository.ts`](../apps/api/src/modules/pokedex/pokedex-slot.repository.ts), [`pokedex.module.ts`](../apps/api/src/modules/pokedex/pokedex.module.ts), [`outbox-relay.service.ts`](../apps/api/src/modules/events/outbox-relay.service.ts), [`outbox-event.repository.ts`](../apps/api/src/modules/events/outbox-event.repository.ts), [`events.module.ts`](../apps/api/src/modules/events/events.module.ts).
  - *Testes Diretos:* [`pokedex-slot.repository.spec.ts`](../apps/api/src/modules/pokedex/pokedex-slot.repository.spec.ts), [`pokedex-slots.service.spec.ts`](../apps/api/src/modules/pokedex/pokedex-slots.service.spec.ts), [`outbox-event.repository.spec.ts`](../apps/api/src/modules/events/outbox-event.repository.spec.ts), [`outbox-relay.service.spec.ts`](../apps/api/src/modules/events/outbox-relay.service.spec.ts), [`app.e2e-spec.ts`](../apps/api/test/app.e2e-spec.ts).
  - *Docs:* este doc `18`, [`14-status-e-changelog-implementacao.md`](14-status-e-changelog-implementacao.md) e [`README.md`](../README.md).
- **Critérios de Aceite (Verificados em 2026-11-22):**
  1. [OK] [`PokedexSlotRepository`](../apps/api/src/modules/pokedex/pokedex-slot.repository.ts) e [`OutboxEventRepository`](../apps/api/src/modules/events/outbox-event.repository.ts) encapsulam 100% das queries Prisma/CTE dos módulos `pokedex` e `events`, usando `OutboxStatus.PENDING` / `PUBLISHED` / `FAILED` e `take: TOTAL_POKEDEX_SLOTS` em `findByTrainerId`.
  2. [OK] [`PokedexController`](../apps/api/src/modules/pokedex/pokedex.controller.ts) usa `new ZodValidationPipe(PokedexSlotIndexParamSchema)` e `new ZodValidationPipe(PokemonIdentifierParamSchema)`, eliminando `ParseIntPipe` e `assertValidSlotIndex`.
  3. [OK] `npm run build:shared && npm run typecheck && npm run lint && npm run test && npm run build` + `npm run test:e2e --workspace=pokeverse-api` verdes (`16` Vitest `@pokeverse/shared`, `38` Jest unit + `9` Supertest E2E `pokeverse-api`, `18` Vitest `pokeverse-web`).

---

### Onda 2 — Repositórios ISP de Auth, Extração TOTP (`<= 300` linhas), `take`/`distinct` e Borda OAuth (`Concluída`)
- **Cluster de Aproximação (`1 <-> 2 <-> 3`):**
  - *Upstreams (`@pokeverse/shared`):* [`auth.schemas.ts`](../packages/shared/src/schemas/auth.schemas.ts) (`GoogleOAuthCallbackQuerySchema`, `PasskeyIdParamSchema`) + [`schemas.spec.ts`](../packages/shared/src/schemas/schemas.spec.ts).
  - *Alvos (`apps/api/src/modules/auth`):* [`totp-crypto.util.ts`](../apps/api/src/modules/auth/totp-crypto.util.ts), [`trainer-account.repository.ts`](../apps/api/src/modules/auth/trainer-account.repository.ts), [`auth-token.repository.ts`](../apps/api/src/modules/auth/auth-token.repository.ts), [`mfa-totp.repository.ts`](../apps/api/src/modules/auth/mfa-totp.repository.ts), [`passkey.repository.ts`](../apps/api/src/modules/auth/passkey.repository.ts), [`trainer-oauth.repository.ts`](../apps/api/src/modules/auth/trainer-oauth.repository.ts), [`auth.service.ts`](../apps/api/src/modules/auth/auth.service.ts), [`mfa-totp.service.ts`](../apps/api/src/modules/auth/mfa-totp.service.ts), [`passkey.service.ts`](../apps/api/src/modules/auth/passkey.service.ts), [`credentials-auth.service.ts`](../apps/api/src/modules/auth/credentials-auth.service.ts), [`token-refresh.service.ts`](../apps/api/src/modules/auth/token-refresh.service.ts), [`account-recovery.service.ts`](../apps/api/src/modules/auth/account-recovery.service.ts), [`session-management.service.ts`](../apps/api/src/modules/auth/session-management.service.ts), [`trainer-gdpr.service.ts`](../apps/api/src/modules/auth/trainer-gdpr.service.ts), [`trainer-session-issuer.service.ts`](../apps/api/src/modules/auth/trainer-session-issuer.service.ts), [`google-account-linker.service.ts`](../apps/api/src/modules/auth/google-account-linker.service.ts), [`google-oauth.service.ts`](../apps/api/src/modules/auth/google-oauth.service.ts), [`auth-outbox-publisher.service.ts`](../apps/api/src/modules/auth/auth-outbox-publisher.service.ts), [`google-oauth.controller.ts`](../apps/api/src/modules/auth/google-oauth.controller.ts), [`mfa.controller.ts`](../apps/api/src/modules/auth/mfa.controller.ts), [`auth.module.ts`](../apps/api/src/modules/auth/auth.module.ts).
  - *Testes Diretos:* [`totp-crypto.util.spec.ts`](../apps/api/src/modules/auth/totp-crypto.util.spec.ts), [`trainer-account.repository.spec.ts`](../apps/api/src/modules/auth/trainer-account.repository.spec.ts), [`auth-token.repository.spec.ts`](../apps/api/src/modules/auth/auth-token.repository.spec.ts), [`passkey.repository.spec.ts`](../apps/api/src/modules/auth/passkey.repository.spec.ts), [`auth.service.spec.ts`](../apps/api/src/modules/auth/auth.service.spec.ts), [`mfa-totp.service.spec.ts`](../apps/api/src/modules/auth/mfa-totp.service.spec.ts), [`passkey.service.spec.ts`](../apps/api/src/modules/auth/passkey.service.spec.ts), [`google-oauth.service.spec.ts`](../apps/api/src/modules/auth/google-oauth.service.spec.ts) e [`app.e2e-spec.ts`](../apps/api/test/app.e2e-spec.ts).
  - *Docs & Limpeza de Emoticons:* este doc `18`, [`04-backend-nestjs-auth-e-seguranca.md`](04-backend-nestjs-auth-e-seguranca.md), [`14-status-e-changelog-implementacao.md`](14-status-e-changelog-implementacao.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`capitulo-um-guia-de-estudos-pokedex.md`](capitulo-um-guia-de-estudos-pokedex.md) e [`README.md`](../README.md).
- **Critérios de Aceite (Verificados em 2026-11-22):**
  1. [OK] Zero chamadas diretas a `this.prisma.*` e zero imports de `PrismaService` dentro de todos os services do `AuthModule`.
  2. [OK] `mfa-totp.service.ts` reduzido de `395` para `278` linhas e `passkey.service.ts` reduzido de `330` para `272` linhas — todos os arquivos de produção do `AuthModule` estão abaixo do teto normativo SRP (`<= 300` linhas); `OutboxStatus.PENDING` / `OutboxStatus.PUBLISHED` utilizados em `AuthOutboxPublisher` e `AuthTokenRepository`.
  3. [OK] Todas as queries `.findMany()` e relações do `AuthModule` possuem `take` explícito (`listActiveSessionFamilies` com `distinct: ['familyId']` e `take: MAX_ACTIVE_SESSION_FAMILIES`).
  4. [OK] `GoogleOAuthController` valida a query de callback com `ZodValidationPipe(GoogleOAuthCallbackQuerySchema)` e `MfaController` valida `:id` com `ZodValidationPipe(PasskeyIdParamSchema)`.
  5. [OK] Todos os emoticons removidos de código e documentação fora da Fase 0 (`index.html` e `js/app.js` preservados conforme `AGENTS.md` §2.1); suite completa verde (`17` Vitest `@pokeverse/shared`, `49` Jest unit + `10` Supertest E2E `pokeverse-api`, `18` Vitest `pokeverse-web`).

---

### Onda 3 — Coesão SRP no Front-End (`apps/web`), Tokens HUD e Limpeza DIP
- **Cluster de Aproximação (`1 <-> 2 <-> 3`):**
  - *Alvos Stores/Services (`apps/web/src/app/features/pokedex-device/services` & `core`):* novos `pokedex-view-mapper.util.ts`, `pokedex-api.client.ts`, `pokedex-local-slots.storage.ts`; refatoração de [`pokedex.store.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex.store.ts), [`pokedex-slots.store.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts), [`pokedex-rpg-nav.service.ts`](../apps/web/src/app/features/pokedex-device/services/pokedex-rpg-nav.service.ts) e [`auth.store.ts`](../apps/web/src/app/core/stores/auth.store.ts) para `< 300` linhas.
  - *Alvos Componentes UI:* extrair `PokedexPhysicalControlsComponent` (D-Pad + botões vermelho/azul/A) e separar templates/estilos `.html`/`.scss` dedicados nos componentes acima de `200` linhas ([`pokedex-search-panel.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-search-panel.component.ts), [`pokedex-device.component.ts`](../apps/web/src/app/features/pokedex-device/pokedex-device.component.ts), [`pokedex-slots-config.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-slots-config.component.ts), [`pokedex-visor.component.ts`](../apps/web/src/app/features/pokedex-device/components/pokedex-visor.component.ts), [`hud-topbar.component.ts`](../apps/web/src/app/shared/hud/hud-topbar.component.ts), [`slot-confirm-dialog.component.ts`](../apps/web/src/app/features/pokedex-device/components/slot-confirm-dialog.component.ts), [`visitor-lock-dialog.component.ts`](../apps/web/src/app/shared/hud/visitor-lock-dialog.component.ts), [`title-screen.component.ts`](../apps/web/src/app/features/title-screen/title-screen.component.ts), [`hud-quick-dock.component.ts`](../apps/web/src/app/shared/hud/hud-quick-dock.component.ts)).
  - *Tokens & DOM (Regra Zero):* substituir cores literais em `hud-topbar` por tokens `--pv-*` de [`_tokens.scss`](../apps/web/src/styles/_tokens.scss) e remover `document.getElementById` / `FALLBACK_SELECTORS` residuais usando `viewChild` e diretivas Angular.
  - *Docs:* este doc `18`, [`02-frontend-angular-hud-e-estado.md`](02-frontend-angular-hud-e-estado.md), [`14-status-e-changelog-implementacao.md`](14-status-e-changelog-implementacao.md) e [`README.md`](../README.md).
- **Critérios de Aceite:**
  1. Stores/services `< 300` linhas e componentes `.ts` `< 200` linhas, sem alteração da aparência ou física 3D da Pokédex (Regra Zero).
  2. `npm run typecheck && npm run lint && npm run test && npm run build` verdes, bundle inicial `<= 500 kB` raw.
  3. **`npm run audit:ui` aprovado + conferência visual real em Desktop (`1440×900`) e Mobile (`375×812`)** com zero erros de console/rede e zero overflow horizontal.

---

### Onda 4 — Guardrails Automatizados no ESLint/CI e Fatiamento de `app.spec.ts`
- **Cluster de Aproximação (`1 <-> 2 <-> 3`):**
  - *Alvos Config/CI:* [`apps/web/eslint.config.mjs`](../apps/web/eslint.config.mjs), [`packages/shared/eslint.config.mjs`](../packages/shared/eslint.config.mjs), [`apps/api/eslint.config.mjs`](../apps/api/eslint.config.mjs), [`ci.yml`](../.github/workflows/ci.yml).
  - *Alvos Testes (`apps/web`):* fatiar [`app.spec.ts`](../apps/web/src/app/app.spec.ts) (`778` linhas) em `pokedex-device.spec.ts`, `privacy-consent.store.spec.ts` e `app-shell.spec.ts`.
  - *Docs:* este doc `18`, [`14-status-e-changelog-implementacao.md`](14-status-e-changelog-implementacao.md) e [`README.md`](../README.md).
- **Critérios de Aceite:**
  1. `eslint-plugin-prettier/recommended` e regras graduais de `max-lines` / `complexity` ativos nos 3 workspaces sem bloquear casos justificados com exceção explícita.
  2. `app.spec.ts` fatiado por domínio mantendo ou superando a cobertura anterior de testes do workspace web.
  3. Pipeline completo (`npm run typecheck && npm run lint && npm run test && npm run build && npm run audit:ui`) passando 100%.

---

## 4. Protocolo de Atualização Contínua (Entre Chats)

Ao finalizar cada onda em um novo chat:

1. **Validar os portões:** executar `npm run typecheck && npm run lint && npm run test && npm run build` (mais `npm run test:e2e --workspace=pokeverse-api` em ondas de API e `npm run audit:ui` + inspeção em `1440×900` e `375×812` em ondas de UI).
2. **Atualizar este documento (`doc 18`):** marcar a onda como `Concluída`, baixar os itens resolvidos em `DT-01..DT-06` e registrar a nova nota na tabela **Histórico de Evolução das Notas**.
3. **Sincronizar a documentação:** atualizar [`14-status-e-changelog-implementacao.md`](14-status-e-changelog-implementacao.md), [`README.md`](../README.md) e quaisquer guias temáticos impactados na mesma entrega.
4. **Consolidar o checkpoint:** executar `git commit` seguindo *Conventional Commits* antes de abrir o próximo chat para a onda seguinte.
