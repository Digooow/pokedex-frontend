# 04 — Back-end NestJS, Autenticação e Segurança

> **Nota de Estado Real (Arquitetura BFF + Decomposição SOLID + Repositórios Isolados — Doc 13 / Doc 17 / Doc 18):** O `AuthModule` opera integralmente com **sessões BFF opacas no Redis + cookies `HttpOnly` (`__Host-` / `__Secure-`)**, máquina de estados `MFA_PENDING -> AUTHENTICATED`, `CsrfOriginGuard`, `RedisThrottlerStorage`, contadores atômicos em Lua (zero TOCTOU), `MailService` em tabela OCP, além da decomposição SOLID completa com 5 repositórios isolados por ISP (`TrainerAccountRepository`, `AuthTokenRepository`, `MfaTotpRepository`, `PasskeyRepository`, `TrainerOAuthRepository`), `totp-crypto.util.ts` e validação Zod na borda HTTP (`GoogleOAuthCallbackQuerySchema`, `PasskeyIdParamSchema`). As seções históricas 2–5 preservam o desenho inicial da Fase 2 como referência evolutiva; detalhes correntes estão em [13 — Dossiê de Segurança](13-dossie-de-seguranca-e-blindagem.md), [14 — Status Real](14-status-e-changelog-implementacao.md), [17 — Plano SOLID](17-plano-solid-clean-code-e-engenharia-big-tech.md) e [18 — Auditoria Técnica](18-auditoria-e-plano-divida-tecnica-arquitetura.md).

## 1. Arquitetura Interna do Back-end (`apps/api`)

O back-end em **NestJS (TypeScript estrito)** concentra regras de negócio autoritativas, persistência relacional, integração com cache/storage/mensageria e comunicação em tempo real via WebSockets.

Cada módulo segue separação estrita em camadas conforme o **[Contrato de Qualidade](ARCHITECTURE.md)** para evitar acoplamento com HTTP ou ORM:

- **Controllers finos (SoC):** apenas recebem requisições já validadas na borda (`ZodValidationPipe`), delegam aos Services de negócio e devolvem HTTP status codes/cookies BFF — nenhuma regra de negócio pode residir em Controllers.
- **Services desacoplados & Repositórios isolados:** consultas diretas via Prisma não poluem os Services de negócio, ficando isoladas em Repositórios/Portas dedicadas; o backend permanece estritamente **Stateless** (estado transitório no Redis; arquivos pesados via URLs MinIO/S3).

```mermaid
flowchart LR
  Client["Angular / WebSockets"] --> Controller["Controllers REST & WS Gateways"]
  Controller -->|"Validação Zod"| Pipe["ZodValidationPipe"]
  Pipe --> UseCase["Services / Use Cases (Domínio)"]
  UseCase --> Ports["Ports / Repositories"]
  Ports --> Prisma["Prisma ORM (PostgreSQL)"]
  Ports --> Redis["Redis Client (Cache & Ranking)"]
  Ports --> Kafka["Kafka Producer (Transactional Outbox)"]
  Ports --> S3["S3 Client (MinIO / R2)"]
```

### Catálogo de Módulos NestJS (Implementados vs. Planejados)

| Módulo | Status | Responsabilidade Principal | Acesso |
| :--- | :---: | :--- | :--- |
| **`AuthModule`** | **Implementado + Refatorado SOLID & Repos (2A–2B + Docs 17–18)** | Fachada `AuthService` + `CredentialsAuthService`, `TokenRefreshService`, `AccountRecoveryService`, `SessionManagementService` (`distinct: ['familyId']` + `take` + expurgo `OutboxStatus.PUBLISHED`), `TrainerGdprService` (`/me/export`, `DELETE /me`), `TrainerSessionIssuer`, `AuthOutboxPublisher` (`OutboxStatus.PENDING`), `GoogleOAuthService` (`GoogleOAuthHttpClient`, `GoogleOidcVerifier`, `GoogleAccountLinker`), `MfaTotpService` + `totp-crypto.util.ts`, `PasskeyService`, `OtpService`, `SessionService`, 5 repositórios Prisma isolados (`TrainerAccountRepository`, `AuthTokenRepository`, `MfaTotpRepository`, `PasskeyRepository`, `TrainerOAuthRepository`) e borda Zod (`GoogleOAuthCallbackQuerySchema`, `PasskeyIdParamSchema`) | `@Public()` em `/providers`, `/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/google/*`, `/passkeys/login/*` + BFF/CSRF no restante |
| **`PokedexModule`** | **Implementado (2–4A)** | Proxy com cache Redis da PokéAPI (TTL 24h + `stale-fallback` 7d) + CRUD atômico dos 10 slots (`409` unicidade e `DELETE /slots`) | Leitura pública (`GET /pokedex/*`) + Slots protegidos (`SessionAuthGuard` + escopo `trainerId`) |
| **`WorldModule`, `EventsModule` & `NotificationsModule`** | **Implementado (2–Doc 17)** | `OutboxRelayService` (*atomic lease* `UPDATE ... RETURNING`) -> Redpanda -> `WorldEventsConsumerService` + `EmailNotificationsConsumerService` (rollback de idempotência no `catch`) -> `WorldGateway` (`/ws/world`) e `MailService` (tabela OCP) | Handshake ticker aberto nesta fase (`WsAuthGuard` obrigatório na Fase 6/Overworld) |
| **`HealthModule` & `SystemModule`** | **Implementados (1–Doc 17)** | Endpoints `/health/live`, `/health/ready` e `/api/v1/system/bootstrap` com `POKEVERSE_PHASE` dinâmico (default `'phase-2b'`) | `@Public()` controlado (infraestrutura) |
| **`TrainersModule`** | **Planejado (Fase 3)** | Perfil do treinador, avatar, últimas coordenadas no Overworld e insígnias | Protegido (`AuthGuard`) |
| **`MuseumModule`** | **Planejado (Fase 4)** | Entrega estruturada de regiões, ginásios, líderes e linha do tempo de jogos | `@Public()` |
| **`ArcadeModule`** | **Planejado (Fase 5)** | Catálogo fixo de ROMs, geração de URL/stream autenticado e *Cloud Save States* | Protegido (`AuthGuard`) |
| **`TeamsModule` & `MinigamesModule`** | **Planejados (Fase 6)** | CRUD de equipes (6 slots), análise assíncrona e sessões temporizadas + Leaderboard Redis | Protegido (`AuthGuard`) |
| **`BattleModule`** | **Planejado (Fase 6)** | Engine determinística turn-based (PvE e PvP), Matchmaking Kafka e `BattleGateway` | Protegido (`AuthGuard` / `WsAuthGuard`) |

---

## 2. Fluxo de Autenticação, Sessão e RBAC

### Política de Tokens
- **Hashing de Senha:** **Argon2id** com *salt* criptográfico por usuário e parâmetros resistentes a força bruta.
- **`Access Token` (JWT curto — 15 minutos):** assinado assimetricamente ou com segredo rotacionável via `.env`, mantido **em memória RAM** no front-end Angular (nunca salvo em `localStorage` ou `sessionStorage`).
- **`Refresh Token` (opaco — 7 dias):** armazenado no cliente exclusivamente em cookie **`HttpOnly`**, **`Secure`**, **`SameSite=Lax`** (restrito ao path `/api/v1/auth`), com hash SHA-256 persistido na tabela `RefreshToken` no PostgreSQL.
- **Rotação com Detecção de Reuso (*Refresh Token Rotation*):** ao renovar o token em `/auth/refresh`, o registro anterior é marcado como revogado e um novo par é emitido. Se um token já revogado for reutilizado (sinal de roubo de cookie), toda a família de sessões daquele treinador é imediatamente invalidada.

```mermaid
sequenceDiagram
  actor Trainer as "Treinador (Angular)"
  participant API as "NestJS AuthController"
  participant DB as "PostgreSQL (Prisma)"

  Trainer->>API: "POST /api/v1/auth/login (email, senha)"
  API->>DB: "Busca Trainer por email (projeção mínima)"
  DB-->>API: "id, username, passwordHash"
  API->>API: "Verifica senha com Argon2id"
  API->>DB: "Salva hash do RefreshToken + expira antigos"
  API-->>Trainer: "200 OK (Access Token JWT em JSON + Set-Cookie Refresh HttpOnly)"

  Note over Trainer,API: "Visitante sem JWT recebe 401 nas rotas privadas"

  Trainer->>API: "POST /api/v1/auth/refresh (Cookie HttpOnly)"
  API->>DB: "Valida hash do RefreshToken e checa revogação"
  API->>DB: "Revoga token atual e cria novo RefreshToken"
  API-->>Trainer: "200 OK (Novo Access Token + Novo Cookie)"
```

### Matriz RBAC (`@Public()` vs. `JwtAuthGuard`)
- O `JwtAuthGuard` é registrado como **Guard Global (`APP_GUARD`)** no NestJS para adotar o princípio *Secure by Default*: toda rota é protegida por padrão.
- Endpoints estritamente abertos a **Visitantes** recebem explicitamente o decorator `@Public()` (ex.: consulta à PokéAPI via proxy cacheado, catálogo de nomes para busca *fuzzy*, dados do Museu das Regiões e `/health/*`).
- Qualquer endpoint que grava dados, transmite ROMs do catálogo, sincroniza Overworld, cria equipes ou inicia batalha/mini-game exige token JWT válido e verifica posse do recurso (`resource.trainerId === currentTrainer.id` — prevenção de **IDOR / Broken Object Level Authorization**).

---

## 3. Segurança de Aplicação (AppSec & OWASP Top 10)

1. **Validação Estrita na Fronteira (`ZodValidationPipe`):**
   - Nenhuma entrada vinda de `body`, `query`, `params` ou payload WebSocket chega aos serviços sem passar por schemas **Zod** de `packages/shared`. Campos desconhecidos são rejeitados (`strict()`).
2. **Prevenção contra Injeção:**
   - Queries relacionais executadas via Prisma parametrizado; qualquer SQL bruto excepcional usa exclusivamente `$queryRaw` com *tagged template literals* parametrizadas (jamais `$queryRawUnsafe` com concatenação de strings).
   - Zero concatenação de argumentos de sistema ou caminhos de bucket (chaves de objeto S3/MinIO sempre vêm do banco ou padrão UUID controlado).
3. **Rate Limiting Distribuído (`@nestjs/throttler` + Redis):**
   - Limites mais rígidos em endpoints sensíveis:
     - `/auth/login` e `/auth/register`: máximo de `10 req/min` por IP/usuário;
     - `/arcade/roms/:slug/session`: limite anti-abuso de geração de URLs assinadas;
     - Eventos WebSocket de movimento no Overworld: limite de frequência por conexão para impedir *flooding*.
4. **Hardening HTTP e Sanitização de Erros:**
   - **Helmet:** CSP (*Content Security Policy*), `X-Frame-Options`, `X-Content-Type-Options: nosniff` e ocultação de `X-Powered-By`.
   - **CORS Estrito:** lista explícita de origens permitidas (`FRONTEND_URL`) com `credentials: true` para suportar cookies `HttpOnly`.
   - **`GlobalExceptionFilter`:** converte exceções internas em JSON padronizado (`{ code, message, correlationId }`), registrando detalhes completos somente em logs estruturados internos e **nunca expondo stack traces, queries SQL ou segredos ao cliente**.

---

## 4. Arquitetura dos Gateways WebSocket

O NestJS mantém dois *namespaces* WebSocket dedicados sobre conexão autenticada via `WsJwtGuard` no *handshake*:

- **`/ws/world` (`WorldGateway`):**
  - Mantém presença na sala da Vila Central (`world:join`, `world:move`, `world:leave`);
  - Faz *broadcast* do feed global vindo do consumidor Kafka (`world:global-event`), exibindo conquistas, recordes e vitórias no Ticker do HUD Angular.
- **`/ws/battle` (`BattleGateway` — Fase 6):**
  - Gerencia salas autoritativas de batalha PvE e PvP (`match:ready`, `turn:submit-action`, `turn:resolved`, `match:finished`);
  - O cliente envia apenas a **intenção** (*usar golpe #2* ou *trocar para Pokémon #4*), e nunca envia cálculo de dano ou alteração de HP — toda resolução matemática roda no servidor para impedir qualquer trapaça.

---

## 5. Evolução Planejada (Onda 1 de Blindagem)

A entrega inicial da Fase 2 utiliza **JWT Access Token (`900s`) em RAM** combinado a **Refresh Token opaco em cookie `HttpOnly` (`pokeverse_refresh`)**. Para elevar o nível de segurança ao padrão ouro Web/SaaS (sem token exposto ao JS do navegador, revogação imediata no `/logout`, proteção CSRF `Origin`/`Sec-Fetch-Site`, throttling distribuído no Redis, login constant-time e CSP estrita), consulte o plano completo no **[13 — Dossiê Completo de Segurança e Blindagem](13-dossie-de-seguranca-e-blindagem.md)**.
