# 17 — Plano SOLID, Clean Code, Post-Mortem de Bugs e Engenharia Nível Big Tech

> **Objetivo deste documento:** registrar o *post-mortem* técnico dos bugs sutis de concorrência e dívidas arquiteturais identificados na auditoria do **PokéVerse OS**, documentar as correções críticas aplicadas e estabelecer o plano de ação concreto para atingir o ápice de **SOLID**, **Clean Code** e confiabilidade em padrão **Big Tech** (Google / Meta / Stripe), em conjunto com o contrato normativo oficial em **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 1. Post-Mortem & Causa Raiz: Por Que Esses Problemas Apareceram?

Os problemas encontrados não surgiram por falta de cuidado com segurança (a base criptográfica e BFF do projeto é sólida), mas sim da combinação de **4 vetores clássicos de crescimento acelerado**:

1. **Acreção Rápida por Ondas Funcionais (*Feature Accretion*):**
   - Entre as Fases 1, 2A, 2B, 3, 4A e LGPD, novos fluxos críticos (login, rotação de refresh, janela de graça multi-aba, OTP de verificação/reset, listagem/revogação de sessões, exportação de portabilidade LGPD e publicação Outbox) foram adicionados continuamente dentro dos mesmos arquivos centrais (`AuthService` atingiu **998 linhas** e `AuthStore` atingiu **606 linhas**).
   - Sem uma etapa intermediária de decomposição estrutural, a camada de serviço e a store principal acumularam múltiplos eixos de mudança — violando o **SRP (*Single Responsibility Principle*)** e gerando duplicação entre `AuthService`, `GoogleOAuthService` (`748` linhas), `MfaTotpService` (`492` linhas) e `PasskeyService` (`382` linhas).

2. **Tensão entre a Regra Zero (Fidelidade Visual 1:1 da Fase 0) e Arquitetura Reativa:**
   - Para portar a Pokédex 3D estática (`index.html`, `css/style.css` com `3.105` linhas e `js/app.js` com `2.150` linhas) para Angular sem risco de regressão visual, os seletores e a lógica de foco/navegação foram trazidos de forma quase direta para `_pokedex-classic.scss` (`3.203` linhas) e `PokedexRpgNavService` (`695` linhas).
   - Como consequência, `PokedexRpgNavService` herdou queries imperativas no DOM (`document.querySelector` / `hostEl.querySelectorAll` / `setTimeout`), violando **DIP (*Dependency Inversion Principle*)**, e `_tokens.scss` manteve simultaneamente dois vocabulários de design tokens (`--pv-*` em `oklch` e `--palette-*`/variáveis em português).

3. **Viés de Testes Sequenciais com Mocks em Memória:**
   - Testes unitários executados em série com `await` um após o outro sobre `Map` síncrono em memória validam o caminho lógico sequencial, mas **mascaram corridas concorrentes** e comportamentos reais de infraestrutura:
     - Um `Map` em memória nunca reproduz **TOCTOU** entre requisições paralelas no Redis (`get` → `set`).
     - Um mock de `$transaction` que retorna linhas estáticas não evidencia que o lock **`FOR UPDATE SKIP LOCKED`** é encerrado no momento em que `$transaction` retorna, antes da publicação no Kafka.
     - Testes que apenas mockam sucesso no `MailService` não exercitam o cenário de falha transiente após `SET NX` no Redis.

4. **Ausência de Portões Automáticos de Complexidade e Lint Uniforme no Monorepo:**
   - Apenas `apps/api` possuía ESLint configurado no CI (`lint:api`); `apps/web` e `packages/shared` não rodavam `eslint`, `max-lines`, `complexity` nem `prettier --check`. Sem guardrails automáticos, arquivos e funções puderam crescer além dos limites saudáveis sem gerar falha no pipeline.

---

## 2. Correções Críticas de Concorrência e Segurança Aplicadas

Todas as falhas críticas abaixo foram corrigidas no código e cobertas por novos testes unitários automatizados:

| # | Problema Encontrado | Risco em Produção | Solução Implementada (Antes × Depois) |
| :-: | :--- | :--- | :--- |
| **1** | **DoS no OTP em Cadastro Duplicado (`AuthService.register`)** | `issueOtp()` gravava no Redis *antes* da transação Prisma, e o `catch` executava `delKeys` mesmo em erro `P2002` — permitindo que um atacante apagasse o OTP ativo de qualquer conta ainda não verificada. | Separado em `OtpService.createOtpDraft()` (CPU/memória) e `persistOtpDraft()`, gravando no Redis **somente após** a transação SQL confirmar sucesso; removido `delKeys` do `catch`. |
| **2** | **Race Condition TOCTOU em Contadores Redis (`OtpService`, `AuthService.login`, `MfaTotpService`)** | Leituras (`GET`) seguidas de escritas (`SET` `n + 1`) permitiam que requisições concorrentes em paralelo burlassem o limite de 3 tentativas de OTP ou 5/8 falhas de login/MFA. | Criado `RedisService.incrementCounterWithTtl()` usando script Lua atômico (`INCR` + `EXPIRE`) com fallback seguro apenas para mocks legados em testes. |
| **3** | **Perda Silenciosa de Eventos Kafka (`EmailNotificationsConsumerService`, `WorldEventsConsumerService`)** | `acquireIdempotencyLock()` (`SET NX EX 86400`) era gravado *antes* do envio do e-mail/broadcast; uma falha SMTP/rede fazia o retry futuro tratar a mensagem como `'duplicate'` e descartá-la. | Adicionado `RedisService.releaseIdempotencyLock()` no bloco `catch` do efeito colateral, permitindo retry legítimo pelo broker e encaminhamento seguro à DLQ. |
| **4** | **Lock Efêmero no Outbox (`OutboxRelayService.processPendingBatch`)** | A `$transaction` com `SELECT ... FOR UPDATE SKIP LOCKED` encerrava antes do envio ao Kafka, liberando a trava para outras réplicas processarem o mesmo lote simultaneamente. | Substituído por CTE atômica (`WITH claimed AS (... FOR UPDATE SKIP LOCKED) UPDATE "OutboxEvent" SET "processedAt" = NOW() ... RETURNING ...`) atuando como *atomic lease* de 60s, liberado (`processedAt: null`) em falhas retentáveis. |
| **5** | **Divergência MFA OAuth & Binding `img[src]` Inativo** | `GoogleOAuthService` ignorava contas MFA protegidas apenas por Passkey (`totpSecretEncrypted !== null`); `CenariosBackdropComponent` ligava `[src]` a `null`. | Alinhado para `trainer.mfaEnabled && mfaMethods.length > 0` e substituído `[src]` por `[attr.src]` em `cenarios-backdrop.component.ts`. |

---

## 3. Plano de Ação Arquitetural: Ápice dos Princípios SOLID e Clean Code

### 3.1. Mapa de Decomposição Alvo (Backend + Frontend)

```mermaid
flowchart LR
  subgraph IAM_Backend["apps/api — Decomposição SOLID do IAM"]
    AC[Controllers Enxutos] --> CA[CredentialsAuthService]
    AC --> TR[TokenRefreshService]
    AC --> AR[AccountRecoveryService]
    AC --> SM[SessionManagementService]
    AC --> TG[TrainerGdprService]
    CA --> TSI[TrainerSessionIssuer]
    GO[GoogleOAuthService] --> TSI
    MT[MfaTotpService] --> TSI
    PK[PasskeyService] --> TSI
    CA --> AOP[AuthOutboxPublisher]
    AR --> AOP
    MT --> AOP
  end

  subgraph Web_Frontend["apps/web — Decomposição SOLID da UI"]
    AS1[AuthSessionStore]
    AS2[AuthRecoveryService]
    AS3[AuthCrossTabSync]
    RPG[PokedexRpgStateService] --> DIR["Diretiva [pvRpgFocusable]"]
    HTTP[ApiErrorMapper] --> AS1
    HTTP --> IAM[SecurityIamStore]
  end
```

### 3.2. Checklist Prático por Princípio SOLID

1. **S — Single Responsibility Principle (SRP)**
   - **Meta:** máximo de `~300` linhas por Service/Store e `~150–200` linhas por Componente UI; funções com `<= 45` linhas e profundidade de aninhamento `<= 3`.
   - **Ações:**
     - Fatiar `auth.service.ts` (`998` linhas) em `CredentialsAuthService`, `TokenRefreshService`, `AccountRecoveryService`, `SessionManagementService` e `TrainerGdprService`.
     - Fatiar `google-oauth.service.ts` (`748` linhas) isolando `GoogleOidcVerifier` (JWKS + RS256), `GoogleOAuthHttpClient` e `GoogleAccountLinker`.
     - Fatiar `auth.store.ts` (`606` linhas) separando estado de sessão (`AuthSessionStore`), ações de recuperação/OTP (`AuthRecoveryService`) e sincronização multi-aba (`AuthCrossTabSync`).
     - Fatiar `_pokedex-classic.scss` (`3.203` linhas) em `_chassis-3d.scss`, `_search-scanner.scss`, `_visor-lcd.scss`, `_controls-dpad.scss` e `_slots-grid.scss`, removendo cores hardcoded dos componentes HUD para tokens únicos `--pv-*`.

2. **O — Open/Closed Principle (OCP)**
   - **Ações:**
     - Substituir ramificações manuais em `MailService.renderEmail` e `AuthService` por um mapa tipado de templates/renderizadores (`Record<EmailTemplate, EmailRenderer>`).
     - No `PrivacyConsentStore` e `QualityStore`, adotar registro declarativo de chaves sujeitas a consentimento e estratégia explícita de opt-in (`functionalPreferences === true` em vez de `?? true`).

3. **L — Liskov Substitution Principle (LSP)**
   - **Ações:**
     - Definir contratos explícitos (`SessionRepository`, `OtpStore`, `EmailTransport`) para que implementações reais (Redis/Prisma/Resend) e fakes em memória para testes respeitem exatamente as mesmas pré e pós-condições (incluindo atomicidade de contadores e códigos de erro).

4. **I — Interface Segregation Principle (ISP)**
   - **Ações:**
     - Extrair `TrainerSessionIssuer` e `AuthOutboxPublisher` com interfaces mínimas para `GoogleOAuthService`, `MfaTotpService` e `PasskeyService`, eliminando duplicação de `TRAINER_PROFILE_SELECT`, montagem de `mfaMethods`, gravação de `RefreshToken` e envelopes cifrados.
     - No front-end, centralizar `extractApiErrorMessage()` em `@pokeverse/shared` ou `core/http/api-error.util.ts` (eliminando duplicação entre `AuthStore` e `SecurityIamStore`).

5. **D — Dependency Inversion Principle (DIP)**
   - **Ações:**
     - Remover toda consulta direta ao DOM (`document.querySelector`, `hostEl.querySelectorAll`, `dataset`) de `PokedexRpgNavService` (`695` linhas), substituindo por registro declarativo via diretiva Angular `[pvRpgFocusable]` e `viewChildren`.
     - Extrair portas abstratas para transporte de e-mail, armazenamento S3 e métricas de telemetria no back-end.

---

## 4. Roadmap para Elevar o Projeto ao Nível Big Tech

| Pilar | Estado Anterior | Marco Implementado / Próximo Passo |
| :--- | :--- | :--- |
| **Lint & Clean Code Gates** | ESLint apenas em `apps/api`; sem limite de linhas/complexidade. | **Concluído (Onda 4 — Guardrails Completos):** `eslint-plugin-prettier/recommended`, `--max-warnings=0`, `@typescript-eslint/no-explicit-any: 'error'`, `complexity: ['error', 15]` e `max-lines` (`300` geral / `200` `*.component.ts` no web) ativos nos 3 workspaces (`@pokeverse/shared`, `apps/api`, `apps/web`), com `npm run format:check` bloqueante no CI. |
| **Testes de Integração Reais & Caos** | E2E com mocks em memória; falta cobertura em `PokeApiCacheService`, `PokedexSlotsService` e `PasskeyService`. | **Parcialmente Concluído (Onda 4 no Web):** adicionados testes unitários completos em `pokeapi-cache.service.spec.ts`, `pokedex-slots.service.spec.ts`, `passkey.service.spec.ts`, `deleteTrainerAccount` e `purgeExpiredTokensAndEvents`, e `app.spec.ts` fatiado em `app-shell.spec.ts`, `pokedex-device.spec.ts`, `privacy-consent.store.spec.ts` e `auth-iam.spec.ts` (`31` testes web); próximo passo: **Testcontainers** (PostgreSQL + Redis + Redpanda reais) no CI. |
| **Observabilidade & SLOs** | Logs JSON estruturados + `traceparent` manual. | Instrumentação **OpenTelemetry SDK** ponta a ponta (HTTP + Prisma + ioredis + KafkaJS), métricas RED (`p95`/`p99`, taxa 5xx, hit ratio Redis) e rastreamento de WebSocket. |
| **Segurança Contínua & LGPD** | Cookies `__Host-`/`__Secure-`, Argon2id, exportação JSON; falta exclusão de conta e expurgo automático. | **Concluído (LGPD + `SystemController` Dinâmico):** implementado `DELETE /api/v1/auth/me` com confirmação na UI, `SessionManagementService.purgeExpiredTokensAndEvents()` e fase dinâmica via `POKEVERSE_PHASE`; próximo passo: `gitleaks` + `npm audit --audit-level=high` bloqueantes no CI. |
| **Higiene de Dependências & Repo** | `@neon/config` e `@neon/env` nas `dependencies` raiz; alterações WIP sem commit. | **Concluído (`devDependencies`):** `@neon/config` e `@neon/env` movidos para `devDependencies` na raiz; próximo passo: `CODEOWNERS` e template de PR. |

---

## 5. Cronograma de Execução & Status Real

1. **Sprint 1 (Estabilização & SOLID no Auth) — Concluída:** extraídos `TrainerSessionIssuer` + `AuthOutboxPublisher`; `AuthService` decomposto em `CredentialsAuthService`, `TokenRefreshService`, `AccountRecoveryService`, `SessionManagementService` e `TrainerGdprService`; `GoogleOAuthService` decomposto em `GoogleOAuthHttpClient`, `GoogleOidcVerifier` e `GoogleAccountLinker`; `MailService` em tabela OCP (`EMAIL_TEMPLATE_RENDERERS`); novos testes unitários em `PokeApiCacheService`, `PokedexSlotsService` e `PasskeyService`.
2. **Sprint 2 (Front-End & CSS Modular) — Concluída:** criado `api-error.util.ts`; `AuthStore` fatiado com `AuthRecoveryService` e `AuthCrossTabSyncService`; `PrivacyConsentStore` extensível via `registerNonEssentialStorageKey` + `hasExplicitFunctionalOptIn`; `PokedexRpgNavService` decomposto com `PokedexLidPhysicsService` e diretiva declarativa `[pvRpgFocusable]` / `[pvRpgContainer]`; `_pokedex-classic.scss` fatiado em 5 parciais (`styles/pokedex/`); ESLint unificado em `@pokeverse/shared`, `apps/api` e `apps/web`.
3. **Sprint 3 (Confiabilidade Big Tech & LGPD Final) — Parcialmente Concluída:** entregue `DELETE /api/v1/auth/me` + confirmação LGPD em `SecuritySettingsDialogComponent`, `purgeExpiredTokensAndEvents()`, `SystemController` dinâmico (`POKEVERSE_PHASE`) e `@neon/*` em `devDependencies`; pendentes apenas Testcontainers no CI e OpenTelemetry SDK completo.
