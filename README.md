<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img src="docs/assets/banner.svg" alt="PokéVerse OS — Pokédex 3D interativa e plataforma full-stack" width="100%">
</p>

<p align="center">
  <a href="https://pokeverse.pages.dev/"><strong>Abrir a plataforma ao vivo</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/capitulo-00-como-tudo-comecou.md">Capítulo 00: como tudo começou</a>
  &nbsp;·&nbsp;
  <a href="docs/00-visao-geral-e-roadmap.md">Roadmap</a>
  &nbsp;·&nbsp;
  <a href="docs/ARCHITECTURE.md">Contrato de Qualidade</a>
  &nbsp;·&nbsp;
  <a href="#documentação">Documentação</a>
</p>

<p align="center">
  <img alt="Angular 22" src="https://img.shields.io/badge/Angular-22_Zoneless-DD0031?logo=angular&logoColor=white">
  <img alt="NestJS 11" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0_strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white">
  <img alt="Kafka" src="https://img.shields.io/badge/Kafka-Redpanda-231F20?logo=apachekafka&logoColor=white">
  <img alt="Zod" src="https://img.shields.io/badge/Zod-v4-3E67B1">
  <img alt="Testes" src="https://img.shields.io/badge/testes-187_unit_%2B_24_E2E_%2B_4_integra%C3%A7%C3%A3o-3ddc84">
  <img alt="Fase" src="https://img.shields.io/badge/fase-4B_passo_2A.3-ffd23f">
</p>

# PokéVerse OS

**Uma Pokédex 3D skeuomórfica, com tampa que gira, LEDs, metal e vidro, construída sobre uma plataforma full-stack real.** Ela tem autenticação segura, cache distribuído, mensageria, deploy em nuvem e uma auditoria visual automatizada que reprova regressões de contraste e layout.

O projeto começou como a **atividade final de Front-end no Senac**: uma Pokédex em HTML, CSS e JavaScript puro. Eu gostei do tema e decidi continuar por conta própria. O resultado é este monorepo. A história completa está no **[Capítulo 00](docs/capitulo-00-como-tudo-comecou.md)**, junto com o README original, preservado como recordação.

<p align="center">
  <img src="docs/assets/screenshots/03-pokedex-pikachu-desktop.webp" alt="Pokédex 3D aberta exibindo o Pikachu, com o slot 01 salvo e o HUD autenticado" width="100%">
</p>

---

## Sumário

1. [Estado atual em um olhar](#estado-atual-em-um-olhar)
2. [Galeria](#galeria)
3. [Arquitetura](#arquitetura)
4. [Fluxos principais](#fluxos-principais)
5. [Modelo de dados](#modelo-de-dados)
6. [API](#api)
7. [Qualidade, testes e CI/CD](#qualidade-testes-e-cicd)
8. [Segurança e privacidade](#segurança-e-privacidade)
9. [Performance](#performance)
10. [Roadmap: o que vem a seguir](#roadmap-o-que-vem-a-seguir)
11. [Como executar](#como-executar)
12. [Estrutura do repositório](#estrutura-do-repositório)
13. [Documentação](#documentação)
14. [Princípios de engenharia](#princípios-de-engenharia)
15. [Créditos e avisos](#créditos-e-avisos)

---

## Estado atual em um olhar

A plataforma tem **cinco módulos**, acessíveis pelo seletor de módulos na barra superior ao lado de **PokéVerse OS** (ou pelos atalhos `1` a `5`). Hoje a prioridade é o módulo 2, a Pokédex, que vai virar a enciclopédia Pokémon mais completa possível. Os outros módulos usarão os dados dela.

| # | Módulo | Rota | Acesso | Estado | Progresso |
| :-: | :--- | :--- | :---: | :--- | :--- |
| 1 | **Vila Central** (overworld 2D/HD-2D) | `/mundo` | Treinador | Em construção (tela de status) | `█░░░░░░░░░` 18% |
| 2 | **Pokédex 3D** | `/` e `/pokedex` | Público | **Em produção** | `██████████` Fase 4A |
| 3 | **Museu das Regiões** | `/museu` | Público | Base com 6 gerações | `███░░░░░░░` 36% |
| 4 | **Arcade Retrô** (WASM + cloud saves) | `/arcade` | Treinador | Em construção (tela de status) | `█░░░░░░░░░` 14% |
| 5 | **Battle Frontier** (PvE/PvP e mini-games) | `/arena` | Treinador | Em construção (tela de status) | `██░░░░░░░░` 28% |

> Os percentuais são os exibidos nas telas de módulo em construção ([`under-construction.data.ts`](apps/web/src/app/features/under-construction/under-construction.data.ts)). Eles medem preparação (modelagem, contratos, schema), não entrega do módulo.

### O que já funciona

<table>
<tr>
<td width="50%" valign="top">

#### Pokédex 3D e experiência

- Chassi skeuomórfico fiel, com luz que segue o ponteiro, microtexturas WebP, dobradiça, lente de safira e LEDs reativos
- Abertura e fechamento 3D **reversíveis em voo**
- Catálogo completo da PokéAPI (1351 entradas) com busca por ID ou nome, chave fonética PT/EN e aproximação Damerau-Levenshtein
- Seleção em 2 passos: o 1º clique destaca, o 2º (ou `A` / `Enter`) abre no visor
- Botão vermelho com **histórico progressivo** de navegação
- **10 slots azuis** de gravação, com luz azul (livre) ou verde (ocupado), 1 Pokémon por botão, confirmação ao tentar sobrescrever slot ocupado com outro Pokémon no visor, badge animada de salvamento e apelidos
- 4 cenários (**Hoenn, Cidade, Vila, Floresta**), modo Auto e detector de hardware
- Topbar tática full-width ancorada nas extremidades (Pokébola SVG no botão `PokéVerse OS`, seletor de módulos `1`–`5`, painel do jogador, configurações e status da nuvem), menus em dobra suave estilo Pokédex, botões com feedback tátil, ticker temporário animado ao vivo (`6s`) e rodapé discreto com créditos & cookies/LGPD

</td>
<td width="50%" valign="top">

#### Plataforma e back-end

- Proxy e cache da PokéAPI no Redis: `24h` de TTL + `stale-fallback` de `7d` (incluindo `/catalog/enriched` via GraphQL v1beta2 com fallback REST, `/bundle` com matriz defensiva `0x..4x`, `/encounters`, `/forms` e rotas enciclopédicas paginadas + busca reversa em `/moves`, `/abilities`, `/items`, `/berries` e `/locations`, além de `/meta/filters`, `/regions`, `/pokedexes`, `/egg-groups`, `/growth-rates`, `/natures` e `/types` em `7d` + `14d` stale)
- Sessões **BFF opacas** no Redis, cookie `HttpOnly` e zero JWT no JavaScript do navegador
- MFA: **TOTP** com QR Code e 8 códigos de backup, **Passkeys WebAuthn** e **Google OAuth PKCE**
- Verificação de e-mail e recuperação de senha por **OTP**
- **Transactional Outbox**, Redpanda/Kafka, consumidores idempotentes e DLQ
- Gateway WebSocket `/ws/world` com ticker global
- Banner de cookies e **LGPD** (consentimento versionado, exportação JSON e eliminação em cascata `DELETE /auth/me`)
- Deploy contínuo em **Cloudflare Pages + Azure Container Apps**

</td>
</tr>
</table>

### Domínio futuro já modelado

Estes módulos estão em [`@pokeverse/shared`](packages/shared/src) com testes, mas ainda **sem tela nem endpoint**:

- **Catálogo dos 51 endpoints da PokéAPI v2** com modelo de filtros avançados: [`pokeapi-endpoints.ts`](packages/shared/src/domain/pokeapi-endpoints.ts)
- **Laboratório Genético**: atributos e XP por nível, chance de evolução, clonagem e replicação, e conversão em **Bio-Essência** (ranks `E`, `D`, `C`, `B`, `A`, `S` e `APEX`): [`pokemon-lab.ts`](packages/shared/src/domain/pokemon-lab.ts)

---

## Galeria

### Pokédex 3D

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshots/01-pokedex-fechada-desktop.webp" alt="Pokédex fechada: tampa vermelha metálica com câmera, LEDs e emblema"><br><sub><b>Fechada:</b> tampa, dobradiça lateral, lente de safira e LEDs.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/02-pokedex-aberta-desktop.webp" alt="Pokédex aberta: módulo de busca à esquerda e visor de resultados à direita"><br><sub><b>Aberta:</b> módulo de busca, D-pad, botões e visor de resultados.</sub></td>
</tr>
</table>

### Módulos e responsividade

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshots/04-museu-desktop.webp" alt="Museu das Regiões com cards de Kanto, Johto, Hoenn, Sinnoh, Unova e Paldea"><br><sub><b>Museu:</b> 6 gerações, cada uma com um inicial para inspecionar na Pokédex.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/05-vila-central-em-construcao-desktop.webp" alt="Tela de módulo em construção da Vila Central com Dragonite"><br><sub><b>Em construção:</b> telas dedicadas, com especificação e progresso por módulo.</sub></td>
</tr>
</table>

<table>
<tr>
<td align="center" width="50%"><img src="docs/assets/screenshots/07-pokedex-pikachu-mobile.webp" alt="Pokédex no mobile 375 por 812" width="260"><br><sub><b>Mobile (375×812):</b> a tampa gira no eixo X.</sub></td>
<td align="center" width="50%"><img src="docs/assets/screenshots/08-museu-mobile.webp" alt="Museu no mobile 375 por 812" width="260"><br><sub><b>Museu no mobile</b></sub></td>
</tr>
</table>

### Cenários

<table>
<tr>
<td width="50%"><img src="assets/backgrounds/mirante-hoenn-desktop.webp" alt="Cenário Mirante de Hoenn"><br><sub><b>Hoenn</b></sub></td>
<td width="50%"><img src="assets/backgrounds/cidade-anime-desktop.webp" alt="Cenário Cidade"><br><sub><b>Cidade</b></sub></td>
</tr>
<tr>
<td width="50%"><img src="assets/backgrounds/vila-pallet-desktop.webp" alt="Cenário Vila de Pallet"><br><sub><b>Vila</b></sub></td>
<td width="50%"><img src="assets/backgrounds/floresta-sol-desktop.webp" alt="Cenário Floresta ao sol"><br><sub><b>Floresta</b></sub></td>
</tr>
</table>

> As capturas foram geradas automaticamente com Chrome headless sobre o build de produção, em `1440×900` e `375×812`. Para refazê-las, consulte [`docs/assets/README.md`](docs/assets/README.md).

---

## Arquitetura

### Visão de contexto

```mermaid
flowchart LR
  user(["Treinador ou visitante<br/>navegador"])

  subgraph edge["Borda: Cloudflare Pages"]
    spa["Angular 22 SPA<br/>Standalone, Signals, Zoneless"]
    fn["Pages Functions<br/>proxy same-origin<br/>/api, /health, /socket.io"]
  end

  subgraph compute["Azure Container Apps, brazilsouth"]
    api["NestJS 11<br/>API REST + Socket.IO<br/>imagem Docker não-root"]
  end

  subgraph data["Dados e mensageria"]
    pg[("PostgreSQL<br/>Neon, via Prisma")]
    redis[("Redis<br/>Upstash, TLS")]
    kafka[["Kafka<br/>Aiven, mTLS"]]
  end

  resend["Resend<br/>e-mail transacional"]
  pokeapi["PokéAPI v2<br/>fonte dos dados Pokémon"]
  google["Google OAuth<br/>PKCE"]

  user -->|HTTPS| spa
  spa -->|"mesma origem"| fn
  fn --> api
  api --> pg
  api --> redis
  api <--> kafka
  api --> resend
  api -->|"cache miss"| pokeapi
  api <--> google
  spa -.->|"fallback direto se a API cair"| pokeapi

  classDef edge fill:#1b2a4a,stroke:#6aa7ff,color:#fff
  classDef cmp fill:#2a1b3a,stroke:#b58cff,color:#fff
  classDef dat fill:#10301f,stroke:#3ddc84,color:#fff
  class spa,fn edge
  class api cmp
  class pg,redis,kafka dat
```

O proxy **same-origin** é essencial: os cookies `HttpOnly` de sessão ficam no domínio do front-end, o CSP pode ser estrito e o CSRF fica mais simples de defender.

### Monorepo e dependências

```mermaid
flowchart TD
  root["pokeverse-monorepo<br/>npm workspaces"]

  subgraph packages["packages/"]
    shared["@pokeverse/shared<br/>Schemas Zod v4, busca fuzzy,<br/>51 endpoints, Laboratório Genético<br/>tsup: ESM + CJS + d.ts"]
  end

  subgraph apps["apps/"]
    web["pokeverse-web<br/>Angular 22"]
    api["pokeverse-api<br/>NestJS 11 + Prisma"]
  end

  infra["infra/docker<br/>Postgres, Redis, Redpanda,<br/>MinIO/S3, Mailpit"]
  gate["scripts/ui-quality-gate.mjs<br/>Chrome headless + CDP"]
  legacy["Fase 0 (index.html, css/, js/)<br/>removida por desuso (histórico Git)"]

  root --- packages
  root --- apps
  shared -->|"contratos e regras de domínio"| web
  shared -->|"contratos e regras de domínio"| api
  api -.->|"docker compose"| infra
  gate -.->|"audita o build de"| web

  classDef sh fill:#3a2a10,stroke:#ffd23f,color:#fff
  classDef old fill:#2a0f1a,stroke:#ff3b4e,color:#fff
  class shared sh
  class legacy old
```

**Regra de ouro:** contratos Zod, schemas de eventos e regras de domínio vivem **somente** em `@pokeverse/shared`. Front-end e back-end importam de lá e nunca duplicam.

### Stack em detalhe

| Camada | Tecnologias |
| :--- | :--- |
| **Front-end** | Angular 22 (Standalone, Signals, Zoneless, `@defer`), SCSS com tokens `oklch`, `socket.io-client` e `@simplewebauthn/browser` carregados sob demanda |
| **Back-end** | NestJS 11, Express, Socket.IO, Helmet, Throttler com storage em Redis, `argon2` (Argon2id), `qrcode`, `nodemailer` |
| **Dados** | PostgreSQL com Prisma 6.19 (14 modelos, 5 enums, 3 migrações), Redis 7 via `ioredis`, Kafka via `kafkajs` (Redpanda no local, Aiven na nuvem) |
| **Contratos** | Zod v4 em `@pokeverse/shared`, compilado com `tsup` |
| **Qualidade** | Vitest 5, Jest 30, `jest-mock-extended`, Playwright, ESLint 9, Prettier, SonarCloud, UI Quality Gate próprio |
| **Observabilidade** | OpenTelemetry SDK (Traces, Metrics e Logs OTLP), OTel Collector, Prometheus + Postgres/Redis Exporters + alertas, Grafana Loki + Promtail, Grafana Tempo, Grafana, Sentry Envelope v7 e Datadog Agent |
| **Infra** | Docker multi-stage não-root, GitHub Actions, Cloudflare Pages, Azure Container Apps, Neon, Upstash, Aiven, Resend |

---

## Fluxos principais

### Busca de Pokémon com cache e degradação graciosa

A Pokédex **nunca fica inutilizável**. Se a API estiver fora do ar, o front-end consulta a PokéAPI direto e o visitante continua navegando.

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuário
  participant W as Angular (PokedexStore)
  participant A as NestJS (/api/v1/pokedex)
  participant R as Redis
  participant P as PokéAPI

  U->>W: Seleciona "Pikachu" (2º clique, A ou Enter)
  W->>A: GET /pokedex/pokemon/pikachu
  A->>R: GET cache do Pokémon
  alt cache HIT (TTL 24 h)
    R-->>A: JSON
    A-->>W: 200, X-Cache: HIT
  else cache MISS
    A->>P: GET /pokemon/pikachu
    alt PokéAPI respondeu
      P-->>A: JSON
      A->>R: SET cache (24 h) + cópia stale (7 d)
      A-->>W: 200, X-Cache: MISS
    else PokéAPI indisponível
      A->>R: GET cópia stale
      R-->>A: JSON antigo
      A-->>W: 200, stale-fallback
    end
  else API NestJS fora do ar
    W->>P: fallback direto (modo degradado)
    P-->>W: JSON
  end
  W->>W: Valida com Zod (PokemonDetailSchema)
  W-->>U: Exibe no visor LCD
```

### Controles da Pokédex: a máquina de estados do botão vermelho

O botão vermelho volta **um passo por clique**, para o usuário nunca se perder em uma lista de 1351 itens.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Fechada
  Fechada --> Aberta: clique na tampa
  Aberta --> Fechada: clique fora, Esc ou tampa
  state Aberta {
    direction LR
    [*] --> Todos
    Todos --> Busca: digita "pikachu"
    Busca --> Detalhe: 2 cliques, A ou Enter
    Detalhe --> Busca: vermelho 1x (mantém o item destacado)
    Busca --> Todos: vermelho 2x (na posição do Pokémon)
    Todos --> Topo: vermelho 3x
    Topo --> [*]
  }
  note right of Aberta
    Abrir ou fechar pode ser
    revertido em pleno giro
    (rotateY -180° no desktop,
    rotateX 180° no mobile)
  end note
```

### Autenticação BFF com MFA

Nenhum token de acesso chega ao JavaScript. A sessão é um identificador **opaco** guardado em cookie `HttpOnly`, e o estado vive no Redis, o que permite revogação instantânea.

```mermaid
stateDiagram-v2
  [*] --> Visitante
  Visitante --> Registrando: POST /auth/register
  Registrando --> AguardandoOTP: Argon2id + OTP por e-mail (Outbox)
  AguardandoOTP --> Visitante: POST /auth/verify-email (conta verificada)
  Visitante --> Autenticando: POST /auth/login
  Autenticando --> AUTHENTICATED: sem MFA
  Autenticando --> MFA_PENDING: MFA ativo
  MFA_PENDING --> AUTHENTICATED: TOTP, código de backup ou Passkey
  MFA_PENDING --> Visitante: 5 a 8 falhas, bloqueio atômico no Redis
  Visitante --> AUTHENTICATED: Google OAuth PKCE ou Passkey
  AUTHENTICATED --> AUTHENTICATED: POST /auth/refresh (rotação de família)
  AUTHENTICATED --> Visitante: POST /auth/logout, revogação ou DELETE /auth/me
```

### Eventos confiáveis: Transactional Outbox

O envio de e-mail e a atualização do ticker **nunca** acontecem no meio de uma transação de banco. O evento é gravado junto com o dado e publicado depois, de forma atômica e idempotente.

```mermaid
sequenceDiagram
  autonumber
  participant S as AuthService
  participant DB as PostgreSQL
  participant O as OutboxRelayService
  participant K as Kafka / Redpanda
  participant C as EmailNotificationsConsumer
  participant X as Redis
  participant M as MailService (SMTP ou Resend)

  S->>DB: BEGIN, INSERT Trainer + OutboxEvent (PII cifrada AES-256-GCM), COMMIT
  loop polling
    O->>DB: WITH claimed AS (... FOR UPDATE SKIP LOCKED)<br/>UPDATE processedAt = NOW() RETURNING (lease de 60 s)
    O->>K: publish no tópico
    alt falha retentável
      O->>DB: libera o lease (processedAt = NULL)
    end
  end
  K->>C: entrega a mensagem (at-least-once)
  C->>X: SET NX (trava de idempotência)
  alt duplicata
    X-->>C: já existe, descarta
  else nova mensagem
    C->>M: envia o e-mail
    alt falha transitória
      C->>X: libera a trava, relança para retry ou DLQ
    end
  end
```

**Tópicos Kafka** (definidos em [`events.schemas.ts`](packages/shared/src/schemas/events.schemas.ts)):

| Tópico | Uso |
| :--- | :--- |
| `pokeverse.world.events.v1` | Eventos do mundo e ticker global (`/ws/world`) |
| `pokeverse.notifications.email.v1` | E-mails transacionais (OTP, recuperação) |
| `pokeverse.arcade.savestate.v1` | Cloud saves do Arcade (reservado) |
| `pokeverse.battle.matchmaking.v1` | Matchmaking da Arena (reservado) |
| `pokeverse.battle.results.v1` | Resultados de batalhas (reservado) |
| `pokeverse.dlq.v1` | Dead Letter Queue, com payload e metadados de erro |

---

## Modelo de dados

O schema Prisma tem **14 modelos**, **5 enums** (`TrainerRole` incluído) e **3 migrações** (incluindo `AuditLog` protegido por trigger SQL *append-only*). Os módulos futuros (Arcade, Arena, times) já têm tabelas para não exigir reestruturação depois.

```mermaid
erDiagram
  Trainer ||--o{ RefreshToken : "sessões rotacionadas"
  Trainer ||--o{ MfaBackupCode : "8 códigos"
  Trainer ||--o{ TrainerOAuthAccount : "Google"
  Trainer ||--o{ TrainerPasskey : "WebAuthn"
  Trainer ||--o{ PokedexSlot : "10 slots"
  Trainer ||--o{ PokemonTeam : monta
  PokemonTeam ||--o{ PokemonTeamMember : contem
  Trainer ||--o{ ArcadeSaveState : grava
  ArcadeRom ||--o{ ArcadeSaveState : "save de"
  Trainer ||--o{ MinigameScore : pontua
  Trainer ||--o{ BattleMatch : "player 1"
  Trainer |o--o{ BattleMatch : "player 2"
  OutboxEvent {
    uuid id PK
    string aggregateId
    string eventType "tópico Kafka"
    json payload
    datetime processedAt "lease"
  }
  Trainer {
    uuid id PK
    string email UK
    string username UK
    int eloRating
    string lastMapId
  }
  PokedexSlot {
    uuid id PK
    uuid trainerId FK
    int pokemonId
    int slotIndex
  }
```

`OutboxEvent` não tem relação com `Trainer` de propósito: ele é infraestrutura de mensageria. Há um índice parcial `idx_outbox_pending` para o polling.

---

## API

Prefixo global `/api/v1` (exceto `/health`). Validação de entrada com Zod na fronteira, `CsrfOriginGuard` e throttling em Redis.

| Domínio | Método e rota | Descrição |
| :--- | :--- | :--- |
| **Saúde** | `GET /health/live` · `GET /health/ready` | Liveness e readiness (Postgres, Redis, Kafka e S3) |
| **Sistema** | `GET /system/bootstrap` | Fase atual e módulos da plataforma |
| **Pokédex** | `GET /pokedex/catalog` | Catálogo completo da PokéAPI v2 (cache Redis `24h` + `stale-fallback` `7d`) |
| | `GET /pokedex/catalog/enriched` | Catálogo enriquecido em 1 query GraphQL v1beta2 (`24h` + `7d` stale + fallback REST degradado) |
| | `GET /pokedex/meta/filters` | Metadados de filtros (`types`, `generations`, `habitats`, `colors`, `shapes`, `eggGroups`, `growthRates`, `regions`) cacheados `7d` + `14d` stale |
| | `GET /pokedex/pokemon/:idOrName` | Detalhe de um Pokémon na PokéAPI v2 (cache Redis `24h` + `stale-fallback` `7d`) |
| | `GET /pokedex/pokemon/:idOrName/bundle` | Bundle agregado (`pokemon` + `species` + `evolution-chain` + matriz defensiva `0x..4x` via `/type` `7d`) |
| | `GET /pokedex/pokemon/:idOrName/encounters` | Locais de encontro por versão, nível, método e condições (`24h` + `stale-fallback` `7d`) |
| | `GET /pokedex/pokemon/:idOrName/forms` | Formas alternativas (`/pokemon-form`) e variedades da espécie (`24h` + `stale-fallback` `7d`) |
| | `GET /pokedex/{moves,abilities,items,berries,locations}` + `/:idOrName` | Listagem paginada (`limit`/`offset`/`q`) com chave de índice única e detalhe com busca reversa (`24h` + `7d` stale) |
| | `GET /pokedex/{regions,pokedexes,egg-groups,growth-rates}` + `/:idOrName` | Listagem paginada (`limit`/`offset`/`q`) e detalhe com entradas/espécies/localizações (`7d` + `14d` stale) |
| | `GET /pokedex/{natures,types}` + `/:idOrName` | Tabelas completas enriquecidas e detalhe com busca reversa de Pokémon e golpes (`7d` + `14d` stale) |
| | `GET /pokedex/slots` | Lista os slots do treinador |
| | `PUT /pokedex/slots/:index` | Grava um slot (`409` se o Pokémon já estiver em outro) |
| | `DELETE /pokedex/slots/:index` · `DELETE /pokedex/slots` | Remove um slot ou todos (atômico) |
| **Auth** | `GET /auth/providers` · `GET /auth/session` | Provedores ativos e estado da sessão |
| | `POST /auth/register` · `login` · `refresh` · `logout` | Ciclo de vida da conta e da sessão |
| | `POST /auth/verify-email` · `resend-verification` | Verificação por OTP |
| | `POST /auth/forgot-password` · `reset-password` | Recuperação por OTP |
| | `GET /auth/me` · `me/export` · `DELETE /auth/me` | Perfil, portabilidade e eliminação em cascata (LGPD) |
| | `GET /auth/sessions` · `POST /auth/sessions/revoke-others` | Gestão de dispositivos |
| **Google** | `GET /auth/google/start` · `callback` · `DELETE /auth/google` | OAuth com PKCE e vínculo de conta |
| **MFA** | `GET /auth/security/overview` | Painel de segurança |
| | `POST /auth/mfa/totp/setup` · `enable` · `disable` · `POST /auth/mfa/verify` | TOTP e códigos de backup |
| | `GET /auth/passkeys` · `DELETE /auth/passkeys/:id` | Gestão de Passkeys |
| | `POST /auth/passkeys/register/{options,verify}` · `login/{options,verify}` | Fluxos WebAuthn |
| **Tempo real** | `WS /ws/world` | Ticker global (Socket.IO) |

---

## Qualidade, testes e CI/CD

### Pipeline

```mermaid
flowchart LR
  push(["push / PR"]) --> v
  push --> integ

  subgraph v["CI Verification (ci.yml: verify)"]
    direction LR
    s0["Gitleaks<br/>+ npm audit critical"] --> s1["Prisma generate<br/>+ build shared"] --> s2["Typecheck<br/>+ Lint + Prettier"]
    s2 --> s4["Testes unitários<br/>182 Vitest + Jest"]
    s4 --> s5["E2E HTTP Edge<br/>22 testes (infra mockada)"]
    s5 --> s6["Build<br/>+ legado da raiz"]
    s6 --> s7["UI Quality Gate"]
    s7 --> s7b["Playwright E2E Web<br/>2 jornadas reais"]
    s7b --> s8["Docker build<br/>+ Trivy CRITICAL"]
  end

  subgraph integ["Backing Services (ci.yml: integration-e2e)"]
    direction LR
    i1["Postgres 16 + Redis 7<br/>+ Kafka 3.9 + S3 (pgsty/silo)"] --> i2["prisma migrate deploy"] --> i3["Integração Real<br/>4 testes sem mocks"]
  end

  push2(["push na main<br/>e ENABLE_CLOUD_DEPLOY=true"]) --> d

  subgraph d["Cloud Deploy (deploy.yml)"]
    direction LR
    a1["Build e push ACR"] --> a1b["prisma migrate deploy<br/>único pré-deploy"] --> a2["Atualiza Azure Container App"] --> a3["Verifica /health/live"]
    a3 -->|"needs: deploy-api-azure"| b1["Build Angular"] --> b2["UI Quality Gate"] --> b3["Publica Cloudflare Pages"]
  end

  classDef gate fill:#3a1020,stroke:#ff3b4e,color:#fff
  class s7,b2 gate
```

### UI Quality Gate

`npm run audit:ui` ([`scripts/ui-quality-gate.mjs`](scripts/ui-quality-gate.mjs)) abre o **bundle compilado** em Chrome headless via CDP, em Desktop (`1440×900`) e Mobile (`375×812`). Ele percorre `/`, `/pokedex?q=pikachu`, `/museu` e `/mundo`, e **reprova o build** quando encontra:

| Verificação | Critério de reprovação |
| :--- | :--- |
| Texto sobre cenário sem fundo adequado | `effectiveSurfaceAlpha < 0.55` |
| Contraste WCAG AA | `< 4.5:1` (texto normal) ou `< 3.0:1` (texto grande), também simulado sobre fundo diurno claro |
| Layout | Overflow horizontal, clipping lateral ou texto vazando de botões e caixas |
| Tipografia e console | Fonte menor que `10.5px` ou erros no console |

### Testes

| Workspace | Runner | Testes |
| :--- | :--- | :-: |
| `@pokeverse/shared` | Vitest 5 | 31 (8 arquivos) |
| `pokeverse-api` (unit) | Jest 30 + `jest-mock-extended` | 112 (40 suítes) |
| `pokeverse-api` (E2E HTTP edge) | Jest + Supertest | 22 (5 suítes) |
| `pokeverse-api` (integração real CI / Testcontainers) | Jest + Postgres/Redis/Kafka/S3 | 4 (1 suíte) |
| `pokeverse-web` (unit) | Vitest 5 + TestBed | 44 (11 arquivos) |
| `pokeverse-web` (E2E navegador) | Playwright | 2 (1 arquivo) |
| **Total** | | **187 unitários + 24 E2E + 4 integração real (215 verificações)** |

```mermaid
xychart-beta
  title "Testes automatizados por workspace"
  x-axis ["shared", "api unit", "api edge", "api integ", "web unit", "web e2e"]
  y-axis "Testes" 0 --> 120
  bar [31, 112, 22, 4, 44, 2]
```

Os testes cobrem busca fuzzy, catálogo dos 51 endpoints e consultas avançadas (`pokeapi-endpoints.spec.ts`), contratos de catálogo enriquecido, filtros e enciclopédia paginada via subpath `@pokeverse/shared/pokedex-encyclopedia` (`pokedex-catalog.schemas.spec.ts`, `pokedex-encyclopedia.schemas.spec.ts`), matriz defensiva `0x..4x` (`type-effectiveness.spec.ts`), schemas de bundle/encontros/formas (`pokedex-bundle.schemas.spec.ts`), regras do Laboratório, schemas (incluindo validação `https:` em URLs, parâmetros de rota da Pokédex, callback Google OAuth, Passkey ID e contratos RUM/Crash Reporting), `ZodValidationPipe`, `SessionAuthGuard`, `CsrfOriginGuard`, `TrainerThrottlerGuard`, `RbacGuard` (*deny-by-default* em rotas privadas), `GlobalExceptionFilter`, `AuditTrailService` + `TrainerGdprService` (`export`/`delete` pseudonimizado), `assertSafeOutboundUrl` (anti-SSRF pós-DNS), `StructuredLoggerService` (redator DLP de segredos/PII + OTel Logs), `SentryErrorReporterService` (Envelope HTTP v7 + anti-SSRF), `TelemetryIngestionService` (`/api/v1/telemetry/{rum,errors}`), `WorldGateway` (origem em produção, cota/IP e anti-spoofing de `x-forwarded-for`), `UpstreamCircuitBreaker` + `PokeApiHttpCacheClient`, `PokeApiCacheService`, `PokedexCatalogService`, `PokedexEncyclopediaService`, `PokedexEnrichmentService`, `PokedexSlotRepository`, `PokedexSlotsService`, `totp-crypto.util`, `TrainerAccountRepository`, `AuthTokenRepository`, `MfaTotpRepository`, `TrainerOAuthRepository`, `PasskeyRepository`, `MailService`, `S3ObjectStorageAdapter` (`assertSafeStorageKey` anti-traversal + SHA-256), `InfraProbesService`, TOTP, Passkeys WebAuthn, OAuth PKCE (`GETDEL` atômico), OTP concorrente, `OutboxEventRepository`, `OutboxRelayService`, consumidores Kafka, deleção LGPD, expurgo temporal, limites `413`/`400` de body parser, E2E HTTP simulado de Google OAuth PKCE + cache `MISS -> HIT -> STALE-FALLBACK` ([`oauth-cache-storage.e2e-spec.ts`](apps/api/test/oauth-cache-storage.e2e-spec.ts)), enriquecimento `/bundle`, `/encounters` e `/forms` ([`pokedex-enrichment.e2e-spec.ts`](apps/api/test/pokedex-enrichment.e2e-spec.ts)), catálogo enriquecido + metadados de filtros ([`pokedex-catalog.e2e-spec.ts`](apps/api/test/pokedex-catalog.e2e-spec.ts)) e enciclopédia paginada + busca reversa ([`pokedex-encyclopedia.e2e-spec.ts`](apps/api/test/pokedex-encyclopedia.e2e-spec.ts)), integração real com PostgreSQL/Redis/Kafka/S3 (`pgsty/silo`), testes unitários Angular (`app-shell.spec.ts`, `auth-guard-interceptor.spec.ts`, `pokedex-device.spec.ts`, `pokedex-ui-states.spec.ts`, `privacy-consent.store.spec.ts`, `auth-iam.spec.ts`, `world-ticker.store.spec.ts`, `web-telemetry.spec.ts`, `pokedex-view-mapper.util`, `PokedexLocalSlotsStorage`, `auth-dialog-validator.util` e `test-fixtures.spec-helper.ts`) e jornadas reais no navegador com **Playwright** ([`pokeverse-journey.e2e.ts`](apps/web/e2e/pokeverse-journey.e2e.ts)).

### Bundle do front-end

`546.28 kB` raw e `136.99 kB` de transferência estimada no bundle inicial (`0` warnings de budget). O CSS global tem `71.87 kB` (`12.42 kB` transferido) e o `main` tem `73.23 kB` (`14.93 kB` transferido). O resto é carregado sob demanda: Pokédex (`89.65 kB`), `socket.io-client` (`42.17 kB`), telas em construção (`22.72 kB`), diálogo de visitante (`18.34 kB`), configurações de segurança (`18.28 kB`), diálogo de privacidade/LGPD (`11.50 kB`), diálogo de créditos e APIs (`9.28 kB`) e Museu (`3.89 kB`).

---

## Segurança e privacidade

```mermaid
flowchart TB
  subgraph browser["Navegador"]
    b1["Zero JWT no JS"]
    b2["CSP estrita<br/>inlineCritical: false"]
    b3["Sem innerHTML não sanitizado"]
  end
  subgraph edge["Borda"]
    e1["Proxy same-origin"]
    e2["Cookies HttpOnly + Secure + SameSite"]
  end
  subgraph app["API NestJS"]
    a1["CsrfOriginGuard<br/>Origin + Sec-Fetch-Site"]
    a2["Zod em toda entrada"]
    a3["Argon2id + hash dummy<br/>contra enumeração"]
    a4["Throttler em Redis"]
    a5["Helmet + CORS por allowlist"]
  end
  subgraph data["Dados"]
    d1["Contadores atômicos Lua<br/>INCR + EXPIRE"]
    d2["PII de e-mail cifrada<br/>AES-256-GCM"]
    d3["Env validado fail-fast<br/>sem vazar valores"]
  end
  browser --> edge --> app --> data
```

| Tema | Como está resolvido |
| :--- | :--- |
| **Sessão** | Opaca, no Redis, com `MFA_PENDING` → `AUTHENTICATED`, rotação de refresh por família e revogação instantânea |
| **MFA** | TOTP (QR Code + 8 backup codes), Passkeys WebAuthn e proteção contra *account takeover* no Google PKCE |
| **Concorrência** | Zero TOCTOU em contadores (Lua), consumo one-time atômico via `GETDEL` (OAuth/Passkey) e `DEL` (OTP), zero efeito externo antes da constraint `UNIQUE`, lease atômico no Outbox e rollback de idempotência no `catch` |
| **WebSockets & Logs** | `/ws/world` rejeita `!origin` em produção e aplica cota (`10`/IP, `1000` globais); `StructuredLoggerService` mascara segredos/tokens e logs HTTP gravam só `req.path`; `bodyParser: false` com `64kb` (`413`/`400`) |
| **LGPD** | Cookie de consentimento versionado (`pokeverse_consent`, 180 dias), chaves não essenciais registradas declarativamente, portabilidade em `GET /auth/me/export`, eliminação definitiva em cascata via `DELETE /auth/me` (confirmação em 2 etapas na UI), expurgo automático a cada `6h` de tokens/eventos expirados e zero rastreadores de terceiros |
| **Infra & CI/CD** | Container multi-stage não-root stateless (migrations pré-deploy separadas em `deploy.yml` via `DATABASE_URL_UNPOOLED` e step `db-secret`), backing services reais no `ci.yml` (`postgres`, `redis`, `apache/kafka`), **Testcontainers** local (`test:integration:tc`), **Gitleaks** (pré-`npm ci` + `.gitleaks.toml`), **Trivy** (`CRITICAL`, pinado por SHA + SBOM CycloneDX), **CodeQL** SAST, `npm audit --omit=dev --audit-level=high` (`0` vulnerabilidades), `.github/CODEOWNERS` + template de PR, TLS e mTLS em nuvem |
| **Observabilidade** | **OpenTelemetry SDK (3 sinais OTLP)** ponta a ponta (HTTP, Prisma, Redis, KafkaJS + *Child Spans*, WebSocket e RUM Angular via `/api/v1/telemetry/rum` sob gate LGPD) -> **OTel Collector** -> **Prometheus** (+ Postgres/Redis Exporters e `alerts.yml`), **Grafana Loki** (`30d`) + Promtail, **Grafana Tempo** e **Grafana** (`:3005` autenticado em `127.0.0.1`), além de **`SentryErrorReporterService`** (Envelope v7 + anti-SSRF pós-DNS via `/api/v1/telemetry/errors`) e perfil paralelo `datadog` (`Datadog Agent`) ([doc 19](docs/19-observabilidade-telemetria-e-monitoramento.md)) |
| **Governança & Gate Pré-IA (35 controles)** | Matriz completa `REQ-SEC-01..35` documentada: RBAC granular/escopos, WAF/DDoS, CORS/CSP estritos, anti-SSRF, rate limit por usuário/chave, proteção EDoS, cofre centralizado de segredos, KMS em repouso, DLP runtime, TTLs automatizados, trilha de auditoria imutável, SCA/SBOM + SAST/DAST, revisão de terceiros, controle estrito de logs/métricas, alertas + playbooks IRP, limitações/AUP, SLAs de responsabilidade compartilhada e portões obrigatórios antes de qualquer uso de IA/modelos (tokenização PII, filtro de *prompt injection*, moderação, Red Teaming, vieses, sandboxing sem rede, HITL, privacidade diferencial e assinatura de respostas) |

Os detalhes estão no [Dossiê 13](docs/13-dossie-de-seguranca-e-blindagem.md) e nos [requisitos de privacidade, LGPD e segurança (`REQ-SEC-01..35`)](docs/16-cookies-lgpd-e-requisitos.md).

---

## Performance

O projeto detecta o hardware e escolhe um perfil. Isso mantém a fidelidade visual em desktops e a fluidez em celulares fracos. O seletor `Perf: Auto` fica visível na HUD.

```mermaid
flowchart TD
  probe["Probe de hardware<br/>RAM, CPU, toque, WebGL2,<br/>saveData, reduced-motion"] --> q1{"RAM menor que 4 GB<br/>ou saveData<br/>ou sem WebGL2<br/>ou reduced-motion?"}
  q1 -->|Sim| lite["Perfil LITE<br/>economia e mobile fraco"]
  q1 -->|Não| q2{"Mobile touch<br/>ou 4 núcleos ou menos?"}
  q2 -->|Sim| bal["Perfil BALANCED<br/>mobile médio e ultrabook"]
  q2 -->|Não| ultra["Perfil ULTRA<br/>desktop com GPU dedicada"]
  ultra --> wd["FpsWatchdog<br/>rebaixa se os quadros caírem"]
  bal --> wd

  classDef l fill:#3a2a10,stroke:#ffd23f,color:#fff
  classDef b fill:#10283a,stroke:#6aa7ff,color:#fff
  classDef u fill:#10301f,stroke:#3ddc84,color:#fff
  class lite l
  class bal b
  class ultra u
```

As animações dos LEDs usam apenas `opacity` e `transform` (sem `filter` nem `box-shadow` por quadro), e os cenários têm variantes `-desktop` e `-mobile` em WebP. Veja o [documento 11](docs/11-performance-hardware-gates-e-mobile.md).

---

## Roadmap: o que vem a seguir

```mermaid
flowchart LR
  f0["Fase 0<br/>Pokédex estática<br/>(atividade do Senac)"]:::done
  f1["Fase 1<br/>Monorepo + shell Angular"]:::done
  f2["Fase 2<br/>API, Prisma, Redis,<br/>Outbox e WebSocket"]:::done
  f2b["Etapas 2A e 2B<br/>IAM BFF, MFA<br/>e hardening"]:::done
  f3["Fase 3<br/>Deploy em nuvem"]:::done
  f4a["Fase 4A<br/>Restauração fiel 3D,<br/>CSP e bundle"]:::done
  f4b["Fase 4B<br/>Pokédex Suprema"]:::next
  f5["Fase 5<br/>Back-end do Laboratório<br/>e mecânicas de jogo"]:::plan
  f6["Fase 6<br/>Overworld, Museu 3D,<br/>Arcade e Battle Frontier"]:::plan

  f0 --> f1 --> f2 --> f2b --> f3 --> f4a --> f4b --> f5 --> f6

  classDef done fill:#10301f,stroke:#3ddc84,color:#fff
  classDef next fill:#3a2a10,stroke:#ffd23f,color:#fff
  classDef plan fill:#1b2a4a,stroke:#6aa7ff,color:#fff
```

| Etapa | Nome | Estado | Entregas |
| :--- | :--- | :---: | :--- |
| Fase 0 | Pokédex 3D estática (vanilla) | Concluída *(legado removido por desuso)* | `index.html`, `css/style.css` e `js/app.js` portados integralmente para `apps/web`/`@pokeverse/shared` e **apagados da raiz** (referências preservadas em [`docs/`](docs/capitulo-00-como-tudo-comecou.md) e no histórico Git) |
| Fase 1 | Fundação do monorepo e shell Angular | Concluída | Workspaces, `docker-compose` saudável |
| Fase 2 | API, Prisma, Redis, Outbox e WebSocket | Concluída | Cache PokéAPI, 10 slots em ACID, ticker ao vivo |
| 2A e 2B | IAM Enterprise BFF e hardening | Concluída | MFA, Passkeys, OAuth PKCE, OTP, SonarCloud |
| Fase 3 | Deploy em nuvem | Concluída | Cloudflare Pages, Azure, Neon, Upstash, Aiven, Resend, CI/CD |
| Fase 4A | Restauração fiel 3D, CSP e bundle | Concluída | Giro reversível, unicidade de slots, `stale-fallback`, 51 endpoints e Lab modelados |
| **Fase 4B** | **Pokédex Suprema** | **Em andamento (Passos 2A.1, 2A.2 e 2A.3 concluídos)** | `22/51` endpoints ativos no BFF (`/catalog/enriched` via GraphQL v1beta2 + fallback REST, `/meta/filters` `7d`/`14d`, `/bundle` + matriz `0x..4x`, `/encounters`, `/forms`, enciclopédia paginada + busca reversa em `/moves`, `/abilities`, `/items`, `/berries`, `/regions`, `/pokedexes`, `/locations`, `/egg-groups`, `/growth-rates` e `/natures`/`/types` `7d` via subpath `@pokeverse/shared/pokedex-encyclopedia`); próximo: **2B** (5 abas LCD + filtros combinados + áudio/Holocron) |
| Fase 5 | Back-end do Laboratório e mecânicas | Modelada | Atributos por nível, evolução, clonagem, Bio-Essência, encontros e combate |
| Fase 6 | Expansões do mundo | Futura | Overworld Phaser 3, Museu em globo 3D, Arcade WASM e Battle Frontier |

### Em andamento: Fase 4B, Pokédex Suprema

- **Passo 2A.1 (Concluído):** refatoração SOLID do cliente HTTP/Redis (`PokeApiHttpCacheClient` + `PokeApiResourceFetcher` + mappers dedicados), cálculo defensivo `0x..4x` em `@pokeverse/shared` (`computeDefensiveTypeEffectiveness`) e rotas `GET /pokedex/pokemon/:idOrName/{bundle,encounters,forms}` com cache `24h` + `7d` stale (`/type` em `7d` + `14d` stale).
- **Passo 2A.2 (Concluído):** subpath export `@pokeverse/shared/pokedex-encyclopedia`, `UpstreamCircuitBreaker` por host (`pokeapi.co` e `graphql.pokeapi.co`), `GET /pokedex/catalog/enriched` em 1 query via **PokéAPI GraphQL v1beta2** (`24h` + `7d` stale + fallback degradado REST sem envenenar o cache enriquecido) e `GET /pokedex/meta/filters` (`7d` + `14d` stale + fallback paralelo REST).
- **Passo 2A.3 (Concluído):** rotas enciclopédicas (`/moves`, `/abilities`, `/items`, `/berries`, `/regions`, `/pokedexes`, `/locations`, `/egg-groups`, `/growth-rates`) com **listagem paginada (`limit`/`offset`/`q` sobre chave única Redis) + detalhe `/:idOrName`** (busca reversa) e `/natures`/`/types` cacheados `7d` + `14d` stale via `PokedexEncyclopediaController`, `PokedexEncyclopediaService` e mappers dedicados (`22/51` ativos no BFF).
- **Passo 2B (Próximo no Front-end & Motor Audiovisual):** 5 abas internas LCD no visor, filtros combinados no painel esquerdo, comparador 1v1, Enciclopédia Global, Museu expandido, espectrograma Web Audio nos *Cries* e projetor **Holocron** em Three.js (`@defer`), respeitando `ULTRA`, `BALANCED` e `LITE`
- **`TrainerPokemonSnapshot` no PostgreSQL**: snapshot dos favoritos para continuar disponível mesmo com as APIs externas fora do ar
- Fontes complementares: **Pokémon TCG API** e histórico de anime e filmes

### Dívidas técnicas conhecidas

Aqui está o estado atualizado das dívidas mapeadas após a execução do [doc 17](docs/17-plano-solid-clean-code-e-engenharia-big-tech.md) e a auditoria frente ao Contrato de Qualidade no [doc 18](docs/18-auditoria-e-plano-divida-tecnica-arquitetura.md):

| Item | Situação |
| :--- | :--- |
| Adequação ao Contrato de Qualidade (`ARCHITECTURE.md` — Ondas 1–4) | **Concluída no [doc 18](docs/18-auditoria-e-plano-divida-tecnica-arquitetura.md) (Nota `10,0 / 10` — Ondas 1, 2, 3 e 4 concluídas):** 100% de `@pokeverse/shared`, `apps/api` e `apps/web` atendem ao contrato (`DT-01..DT-06` resolvidos, guardrails automáticos de `max-lines`/`complexity`/Prettier e `app.spec.ts` fatiado por domínio) |
| Lint, formatação e SonarCloud no CI | **Concluída (Onda 4 + Remediação SonarCloud + Fechamento Doc 17):** `npm run lint` (`--max-warnings=0`, `eslint-plugin-prettier/recommended`, `@typescript-eslint/no-explicit-any: error`, `complexity: ['error', 15]`, `max-depth: ['error', 3]`, `max-lines` `300`/`200` no web e `max-lines-per-function: 65` em código de produção) via base compartilhada [`eslint.base.mjs`](eslint.base.mjs) e `npm run format:check` ativos nos 3 workspaces e no `ci.yml`, além da correção dos `18` apontamentos iniciais e dos `10` apontamentos posteriores do SonarCloud (`ensureS3BucketsExist`, `toBeUndefined()`, `export ... from` e `String.raw`), eliminação das duplicações CPD (incluindo `eslint.config.mjs` dos workspaces e `BaseIdempotentKafkaConsumer` entre os consumidores Kafka), `0` cores literais em `apps/web/src/app/**/*.scss` (tokens `--pv-*`) e governança `.github/CODEOWNERS` + template de PR |
| Decomposição SOLID, Portas DIP/LSP e IAM | **Concluída:** `AuthService` fatiado em 5 serviços especializados + 5 repositórios isolados (`TrainerAccount`, `AuthToken`, `MfaTotp`, `Passkey`, `TrainerOAuth`) + portas DIP/LSP (`EmailTransport`, `SessionRepository`, `OtpStore`, `ObjectStoragePort`, `TelemetryMetricsPort`) + `totp-crypto.util` + `TrainerSessionIssuer` + `AuthOutboxPublisher`; `GoogleOAuthService` em 3 serviços; `AuthStore` (`<= 291` linhas) com `AuthRecoveryService` + `AuthCrossTabSyncService` e validação do diálogo em `auth-dialog-validator.util.ts` (`DIALOG_VALIDATORS`) |
| Pokédex 3D, DIP e Tokens HUD (`apps/web`) | **Concluída (Ondas 3–4 + Doc 17 + Refino HUD):** stores e serviços (`PokedexStore` + `PokedexApiClient` + `pokedex-view-mapper.util`, `PokedexSlotsStore` + `PokedexLocalSlotsStorage`, `PokedexRpgNavService` + `pokedex-rpg-nav.util`, `PokedexInputShortcutsService`, `PokedexLidPhysicsService`) e componentes UI (`PokedexDevicePage`, `PokedexCover`, `PokedexSearchPanel`, `PokedexPhysicalControls`, `PokedexVisor`, `PokedexSlotsConfig`, `PokedexSlotsGrid`, `SlotConfirmDialog`, `HudTopbar`, `HudModulesMenu`, `HudUserMenu`, `HudSettingsMenu`, `TitleScreen`) fatiados com `.html`/`.scss` dedicados (`_hud-controls.scss` com dobra 3D e tato físico, Pokébola SVG no emblema e confirmação de sobrescrita `overwrite-click` restaurada nos slots), diretivas `[pvRpgFocusable]`, `[pvRpgAction]`, `[pvRpgEditForm]` e `[pvMainHeading]` (zero `getElementById`/`querySelector`/`.dataset`), tokens `--pv-*`/`--pv-hud-*` em `_tokens.scss` e 5 parciais `styles/pokedex/` |
| Cobertura e integração reais | **187 unitários + 24 E2E + 4 integração real (`215` verificações):** `31` shared (`8` arquivos), `112` api unit (`40` suítes com `jest-mock-extended`), `22` api E2E HTTP edge (`app.e2e-spec.ts` + `oauth-cache-storage.e2e-spec.ts` + `pokedex-enrichment.e2e-spec.ts` + `pokedex-catalog.e2e-spec.ts` + `pokedex-encyclopedia.e2e-spec.ts`), `4` integração real (`app.integration-spec.ts` com Postgres 16 + Redis 7 + Apache Kafka 3.9 + `pgsty/silo` S3 no job `integration-e2e` do CI e Testcontainers local via `test:integration:tc`), `44` web Vitest em `11` arquivos e `2` jornadas Playwright E2E em `pokeverse-journey.e2e.ts` |
| Observabilidade & Segurança (Ondas 2–5) | **Onda 1 + Onda 4 (Código + CI/CD) + Fechamento Doc 17 concluídos** (`gitleaks`, `Trivy` + **SBOM CycloneDX**, **SAST CodeQL**, `npm audit --omit=dev --audit-level=high` zerado, **OpenTelemetry SDK + métricas RED** em `/api/v1/system/telemetry`, migrations pré-deploy fora do container, `RbacGuard` *deny-by-default* em todas as rotas privadas com preservação de `TrainerRole` e rotação de `sid` no MFA, `TrainerThrottlerGuard`, `assertSafeOutboundUrl` anti-SSRF pós-DNS, `AuditLog` append-only por trigger SQL + `AuditTrailService`, DLP ampliado e `WorldGateway` com resolução direita-esquerda); pendente `WsAuthGuard` + `ngCspNonce` + regras R2/WASM (**Ondas 2–3 / Fase 6**), WAF/cofre centralizado/DAST/playbooks IRP/revisão de terceiros (**Onda 4 Cloud/Ops**) e gate pré-IA + EDoS (**Onda 5**) conforme [Dossiê 13](docs/13-dossie-de-seguranca-e-blindagem.md) e [doc 16](docs/16-cookies-lgpd-e-requisitos.md) |
| Domínio próprio | Opcional: conectar `pokedex.<domínio>` no Cloudflare e atualizar `CORS_ORIGINS`, `WEBAUTHN_*` e `GOOGLE_REDIRECT_URI` |
| `WsAuthGuard` | O `/ws/world` aceita visitantes para o ticker. Ações do Overworld exigirão sessão autenticada |

---

## Como executar

### Pré-requisitos

- **Node.js 22+** e **npm 11+**
- **Docker** (opcional, para PostgreSQL, Redis, Redpanda, MinIO/S3 e Mailpit locais)
- **Chrome, Chromium ou Edge** (só para `npm run audit:ui`; defina `CHROME_BIN` se necessário)

### Modo rápido: só o front-end

Sem Docker e sem API, a Pokédex funciona em **modo degradado**, direto contra a PokéAPI.

```bash
npm install
npm run build:shared
npm run dev:web
```

Abra `http://localhost:4200`.

### Modo completo: com API, banco, cache e mensageria

```bash
npm install
npm run build:shared

cp .env.example .env          # ajuste os segredos locais
npm run infra:up              # Postgres, Redis, Redpanda, MinIO e Mailpit

npx --workspace=pokeverse-api prisma generate
npx --workspace=pokeverse-api prisma migrate deploy

npm run dev:api               # API em http://localhost:3000
npm run dev:web               # Web em http://localhost:4200 (proxy para /api, /health, /socket.io)
```

| Serviço local | Porta | Observação |
| :--- | :---: | :--- |
| Web (Angular) | `4200` | Proxy automático para a API |
| API (NestJS) | `3000` | Prefixo `/api/v1` |
| PostgreSQL | `5433` | Porta alterada para não colidir com um Postgres local |
| Redis | `6379` | AOF habilitado |
| Redpanda (Kafka) / Console | `19092` / `8085` | Console web para inspecionar tópicos |
| MinIO (S3) / Console | `9000` / `9001` | Buckets privados `pokeverse-roms` e `pokeverse-saves` |
| Mailpit | `1025` / `8025` | Captura os e-mails de OTP em desenvolvimento |
| Grafana | `3005` | Dashboards correlacionados em `127.0.0.1:3005` (login via `.env`) |
| Prometheus | `9090` | Séries temporais, Exporters (`9187` / `9121`) e `alerts.yml` |
| Loki / Tempo | `3100` / `3200` | Logs centralizados (`30d`) e Traces distribuídos |
| OTel Collector | `4317` / `4318` | Ingestão OTLP gRPC / HTTP (métricas Prometheus em `8889`) |

### Scripts do monorepo

| Comando | O que faz |
| :--- | :--- |
| `npm run build` | Build de `shared`, `api` e `web` |
| `npm run typecheck` | `tsc --noEmit` nos 3 workspaces |
| `npm run lint` | ESLint (`--max-warnings=0`, `complexity`, `max-depth`, `max-lines`, `max-lines-per-function`) nos 3 workspaces |
| `npm run format:check` | Valida formatação Prettier nos 3 workspaces (`shared`, `api`, `web`) |
| `npm run test` | Vitest (`shared`, `web`) e Jest (`api` unitários) |
| `npm run test:e2e` | Suítes E2E completas (`test:e2e:api` + `test:e2e:web`) |
| `npm run test:e2e:api` | Suítes E2E da borda HTTP (`app.e2e-spec.ts`, `oauth-cache-storage.e2e-spec.ts`, `pokedex-enrichment.e2e-spec.ts`, `pokedex-catalog.e2e-spec.ts` e `pokedex-encyclopedia.e2e-spec.ts`) |
| `npm run test:e2e:web` | Jornadas visuais E2E com Playwright no navegador (`pokeverse-journey.e2e.ts`) |
| `npm run test:integration --workspace=pokeverse-api` | Integração real sem mocks contra Postgres, Redis, Kafka e S3 (`app.integration-spec.ts`) |
| `npm run test:integration:tc --workspace=pokeverse-api` | Integração real autocontida via Testcontainers (Postgres, Redis, Redpanda e `pgsty/silo` S3 locais) |
| `npm run audit:ui` | UI Quality Gate sobre o build do front-end |
| `npm run infra:up` / `infra:down` | Sobe e derruba a infraestrutura Docker (incluindo stack de observabilidade) |
| `npm run infra:datadog:up` / `infra:datadog:down` | Sobe e derruba a stack incluindo o perfil paralelo `datadog` (`DD_API_KEY`) |

> **Antes de abrir um PR**, rode a sequência: `typecheck`, `lint`, `format:check`, `test`, `build` e `audit:ui`. O CI executa exatamente esses passos.

### Variáveis de ambiente

Todas as chaves estão em [`.env.example`](.env.example) e são validadas **na inicialização** da API ([`env.schema.ts`](apps/api/src/config/env.schema.ts)). Se algo estiver errado, ela falha sem imprimir os valores. Os grupos principais são:

`NODE_ENV`, `API_PORT` · `CORS_ORIGINS`, `COOKIE_*` · `APP_ENCRYPTION_KEY` · `DATABASE_URL`, `DATABASE_URL_UNPOOLED` · `REDIS_URL` · `KAFKA_*` · `MAIL_*`, `SMTP_*`, `RESEND_API_KEY` · `GOOGLE_*` · `WEBAUTHN_*` · `S3_*`

> Nunca faça commit de `.env` ou `.env.cloud`. Eles estão no `.gitignore`.

### Versão estática anterior (Fase 0 — removida por desuso)

Os arquivos estáticos da Fase 0 (`index.html`, `css/style.css` e `js/app.js`, que iniciaram o projeto em HTML, CSS e JavaScript puro) foram integralmente portados para o motor **Angular 22 + `@pokeverse/shared` + NestJS** e **removidos da raiz por não serem mais utilizados**. O histórico completo e as referências técnicas continuam preservados no Git e nos documentos [`Capítulo 00`](docs/capitulo-00-como-tudo-comecou.md) e [`Guia 00`](docs/capitulo-00-guia-de-estudos-pokedex.md).

---

## Estrutura do repositório

```text
pokedex-frontend/
├── apps/
│   ├── api/                       # NestJS 11 + Prisma 6 + Redis + Kafka + Socket.IO
│   │   ├── prisma/                #   schema.prisma (14 modelos, 5 enums) e 3 migrações
│   │   └── src/
│   │       ├── common/            #   guards, filtros, pipes, middleware, telemetria (OTel 3 sinais + Sentry Envelope v7 + AuditTrail), crypto
│   │       ├── config/            #   env.schema.ts (validação fail-fast com Zod)
│   │       ├── infra/             #   Prisma, Redis, Kafka e probes de saúde
│   │       └── modules/           #   auth (SOLID IAM: AuthService fachada, 5 services, 5 repositórios [TrainerAccount, AuthToken, MfaTotp, Passkey, TrainerOAuth], totp-crypto.util, SessionIssuer, OutboxPublisher, GoogleOAuth*), pokedex (UpstreamCircuitBreaker, PokeApiHttpCacheClient, PokeApiResourceFetcher, PokeApiCacheService, PokedexCatalogService, PokedexEnrichmentService, PokedexEncyclopediaController, PokedexEncyclopediaService, specs, mappers e PokedexSlotRepository) · events (OutboxEventRepository, BaseIdempotentKafkaConsumer) · notifications · world · health · system (System, Telemetry, ClientTelemetry)
│   └── web/                       # Angular 22 Standalone + Zoneless
│       ├── functions/             #   Cloudflare Pages Functions (proxy same-origin)
│       └── src/
│           ├── app/core/          #   guards · interceptors (auth + telemetryTrace) · http (api-error.util) · telemetry (WebTelemetryService RUM + GlobalErrorHandler + traceparent) · stores (ApiCredits, Auth, AuthCrossTabSync, AuthRecovery, SecurityIam, PrivacyConsent, Quality, Scenario, SystemStatus, WorldTicker) · suítes auth-iam, privacy-consent e web-telemetry
│           ├── app/features/      #   pokedex-device (services/ [PokedexApiClient, PokedexLocalSlotsStorage, PokedexInputShortcuts, PokedexLidPhysics, PokedexRpgNav, mapper/nav utils], directives/ [pvRpgFocusable, pvRpgEditForm], components/ [Cover, SearchPanel, PhysicalControls, Visor, SlotsConfig, SlotsGrid, SlotConfirmDialog] e pokedex-device.spec.ts) · regions-museum · title-screen · under-construction
│           ├── app/shared/        #   data (regions-atlas.data.ts) · HUD (_hud-controls.scss, Topbar, ModulesMenu, UserMenu, SettingsMenu, CenariosBackdrop) · diálogos (ApiCredits, VisitorLock + auth-dialog-validator.util, SecuritySettings, PrivacyConsent) e diretivas (RequiresTrainer, MainHeading)
│           ├── app/testing/       #   test-fixtures.spec-helper.ts (fixtures e helpers compartilhados do Vitest) + app-shell.spec.ts na raiz de app/
│           └── styles/            #   _tokens.scss (--pv-*, --pv-hud-*) · _pokedex-classic.scss + parciais styles/pokedex/ (_chassis-3d, _search-scanner, _controls-dpad, _slots-grid, _visor-lcd)
├── packages/
│   └── shared/                    # @pokeverse/shared (+ subpath @pokeverse/shared/pokedex-encyclopedia): schemas Zod, busca fuzzy, matriz 0x..4x, 51 endpoints, Laboratório
├── infra/
│   ├── docker/                    # api.Dockerfile e docker-compose.yml (dados + observabilidade + perfil datadog)
│   └── observability/             # otel-collector, prometheus (+ alerts.yml), loki, promtail, tempo e grafana
├── scripts/ui-quality-gate.mjs    # Auditoria de contraste, overflow e tipografia
├── .github/                       # CODEOWNERS, pull_request_template.md e workflows (ci.yml, deploy.yml)
├── assets/                        # Cenários WebP (-desktop e -mobile) e texturas da galeria
├── docs/                          # Documentação (00 a 19), Capítulo 00 e Manual Capítulo 01 (`capitulo-01-guia-de-estudos/`)
├── eslint.base.mjs                # Base compartilhada do ESLint v9 para os 3 workspaces
└── AGENTS.md                      # Regras inegociáveis de fidelidade visual e engenharia
```

---

## Documentação

| Doc | Assunto |
| :-: | :--- |
| **Arch** | **[Contrato de Qualidade: Diretrizes de Arquitetura e Padrões de Código (Anti-AI Slop)](docs/ARCHITECTURE.md)** |
| **Cap. 00** | **[Capítulo 00: como tudo começou](docs/capitulo-00-como-tudo-comecou.md)**, com o README original e a história da atividade do Senac |
| 00 | [Visão geral, regras de acesso e roadmap](docs/00-visao-geral-e-roadmap.md) |
| 01 | [Arquitetura do monorepo e padrões de engenharia](docs/01-arquitetura-monorepo-e-padroes.md) |
| 02 | [Front-end Angular, HUD de jogo e gerenciamento de estado](docs/02-frontend-angular-hud-e-estado.md) |
| 03 | [Motores gráficos: Phaser 3 e Three.js (WebGL2/GLSL)](docs/03-motores-graficos-phaser-e-threejs.md) |
| 04 | [Back-end NestJS, autenticação e segurança](docs/04-backend-nestjs-auth-e-seguranca.md) |
| 05 | [PostgreSQL e Prisma ORM](docs/05-banco-de-dados-postgresql-e-prisma.md) |
| 06 | [Cache Redis e mensageria Kafka / Redpanda](docs/06-cache-redis-e-eventos-kafka.md) |
| 07 | [Arcade Retrô 3D (WebAssembly) e cloud save states](docs/07-arcade-retro-wasm-e-cloud-saves.md) |
| 08 | [Museu das Regiões, lore e Pokédex Holocron 3D](docs/08-museu-lore-e-holocron-pokedex.md) |
| 09 | [Arena de batalha (PvE/PvP), Team Builder e mini-games](docs/09-arena-batalha-teambuilder-e-minigames.md) |
| 10 | [Infraestrutura Docker, observabilidade e CI/CD](docs/10-infraestrutura-docker-ci-cd-e-deploy.md) |
| 11 | [Desempenho, detecção de hardware, mobile e release gates](docs/11-performance-hardware-gates-e-mobile.md) |
| 12 | [Pokédex 2.0: catálogo completo da PokéAPI v2 e controles](docs/12-pokedex-2-0-pokeapi-e-controles.md) |
| 13 | [Dossiê de segurança e blindagem (AppSec, Auth e Infra)](docs/13-dossie-de-seguranca-e-blindagem.md) |
| 14 | [**Status real da implementação**, mudanças vs. plano original e backlog](docs/14-status-e-changelog-implementacao.md) |
| 15 | [Pokédex Suprema: auditoria, 51 endpoints e Laboratório Genético](docs/15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md) |
| 16 | [Cookies, LGPD e requisitos (RF, RNF e `REQ-SEC-01..35`)](docs/16-cookies-lgpd-e-requisitos.md) |
| 17 | [Plano SOLID, Clean Code e engenharia Big Tech](docs/17-plano-solid-clean-code-e-engenharia-big-tech.md) |
| 18 | [Auditoria técnica e plano de dívida técnica (`ARCHITECTURE.md`)](docs/18-auditoria-e-plano-divida-tecnica-arquitetura.md) |
| 19 | [Observabilidade híbrida: OpenTelemetry, Prometheus, Loki, Tempo, Grafana, Sentry e Datadog](docs/19-observabilidade-telemetria-e-monitoramento.md) |
| Guia 00 | **[Capítulo 00 — Guia de estudos da Pokédex (Fase 0)](docs/capitulo-00-guia-de-estudos-pokedex.md)**, a "colinha" e manual técnico para a apresentação no Senac |
| Guia 01 | **[Capítulo 01 — Manual Técnico e Guia de Estudos Full-Stack](docs/capitulo-01-guia-de-estudos-pokedex.md)** (`docs/capitulo-01-guia-de-estudos/`: Vols. 01–03 concluídos — Anatomia de Pastas/Arquivos, Linguagens/Frameworks/Estruturas de Dados com exemplos reais + `@pokeverse/shared` e Glossário Técnico; Vols. 04–10 planejados) |

> **Por onde começar?** Para entender o que existe hoje, leia o [doc 14](docs/14-status-e-changelog-implementacao.md). Para entender o rumo, leia o [doc 00](docs/00-visao-geral-e-roadmap.md) e o [doc 15](docs/15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md).

---

## Princípios de engenharia

As regras completas e o Contrato de Qualidade estão em [`AGENTS.md`](AGENTS.md) e [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), valendo para qualquer pessoa ou agente que contribua.

1. **Regra Zero de UI.** Nenhum componente, animação 3D, textura ou fluxo visual é substituído ou simplificado sem validação explícita. A referência canônica originada na Fase 0 foi portada integralmente para `apps/web`.
2. **Conferência visual real.** Nenhuma mudança de interface é "pronta" antes de ser comparada no navegador, em Desktop `1440×900` e Mobile `375×812`, com zero erros no console, zero falhas de rede inesperadas e zero overflow horizontal.
3. **Preservar o que já funciona.** `assets/` e o código ativo em `apps/web`, `apps/api` e `@pokeverse/shared` não têm funcionalidades degradadas; os arquivos legados da Fase 0 (`index.html`, `css/style.css` e `js/app.js`) foram removidos da raiz por desuso. Nada testado é degradado.
4. **Shift-Left, SoC e Repositórios isolados.** A infraestrutura obedece ao domínio; contratos Zod vivem em `@pokeverse/shared` (DRY real); Controllers apenas recebem payloads validados e retornam HTTP status codes; consultas Prisma ficam isoladas em Repositórios sem poluir Services.
5. **Estado Stateless, MinIO/S3 e Kafka idempotente.** Sessões e dados transitórios vivem no Redis (Lua atômico anti-TOCTOU, zero efeito externo antes da constraint); arquivos pesados vão para MinIO/S3 via URLs geradas (nunca no PostgreSQL); Outbox usa *atomic lease* e consumidores liberam idempotência no `catch`.
6. **Zero N+1 e paginação desde a v1.** Buscas relacionais usam joins nativos do Prisma em uma única ida ao banco com projeção estrita (`select`), índices definidos e paginação obrigatória (`limit`/`offset` ou cursor) em todo endpoint de lista.
7. **SOLID & Clean Code Anti-AI Slop.** Services/stores até ~300 linhas e UI até ~150–200 linhas; nomenclatura ubíqua (proibido `dataHandler`/`processor`), zero valores mágicos, **Early Returns** sem código em flecha e alterações atômicas sem boilerplate para ciclos curtos de até 5 prompts seguidos de `git commit`.
8. **Documentação e README sempre sincronizados.** Toda implementação, alteração estrutural ou remoção no projeto atualiza também [`README.md`](README.md) e os documentos em [`docs/`](docs/) na mesma entrega.

Os commits seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `chore:`).

---

## Créditos e avisos

- **API de Terceiros Ativa (Dados, Sprites e Áudios):**
  - **[PokéAPI v2](https://pokeapi.co/)** — API RESTful pública e open-source (`BSD-3-Clause`), criada por **Paul Hallett** e mantida pelos contribuidores da comunidade PokéAPI, fornecendo dados de espécies, tipos, habilidades, atributos base e catálogo completo das gerações I–IX.
  - **[PokeAPI/sprites](https://github.com/PokeAPI/sprites)** — Sprites oficiais, *official-artwork*, renders *HOME*, *Dream World* e animações *Showdown*.
  - **[PokeAPI/cries](https://github.com/PokeAPI/cries)** — Áudios oficiais de gritos (*cries* `latest` e `legacy`).
  - **Conformidade com a [PokéAPI Fair Use Policy](https://pokeapi.co/docs/v2#fairuse):** o back-end NestJS aplica cache distribuído no Redis (`24h` TTL quente + `7 dias` *stale-fallback*), deduplicação *singleflight* em voo e *Circuit Breaker*, minimizando requisições ao upstream; a interface web exibe créditos discretos no rodapé global (`Créditos & APIs` ao lado de `Cookies & LGPD`) abrindo o diálogo dedicado [`ApiCreditsDialogComponent`](apps/web/src/app/shared/hud/api-credits-dialog.component.ts).
- **Fontes Complementares Planejadas (Roadmap):** **[Pokémon TCG API](https://pokemontcg.io/)** e catálogos públicos de séries/filmes (ainda não integrados ao runtime atual).
- **Origem:** atividade final da matéria de Front-end no **Senac**, expandida por iniciativa própria. Veja o [Capítulo 00](docs/capitulo-00-como-tudo-comecou.md).
- **Aviso legal e propriedade intelectual:** este é um **projeto de fã, educacional e sem fins lucrativos**. **Pokémon** e todos os nomes, personagens, artes, sprites, áudios e marcas relacionados pertencem a **Nintendo, Creatures Inc., Game Freak Inc. e The Pokémon Company International**. Este projeto **não** é afiliado, patrocinado, endossado nem mantido pela Nintendo, The Pokémon Company ou pelos mantenedores da PokéAPI. Se você é titular de algum direito e deseja a remoção de algum asset, abra uma issue.
- **Licença:** não há licença de código aberto declarada. Por padrão, todos os direitos sobre o código original são reservados ao autor.

<p align="center">
  <sub>Feito com carinho por <a href="https://github.com/digooow">@digooow</a>, de uma atividade de faculdade a uma plataforma inteira.</sub>
</p>
