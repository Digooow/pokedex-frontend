# 16 — Cookies, Privacidade (LGPD) e Levantamento de Requisitos

> **Objetivo deste documento:** registrar a arquitetura oficial de **Cookies**, **Armazenamento Local**, **Conformidade LGPD (Lei nº 13.709/2018)** e o **Levantamento Completo de Requisitos (Funcionais, Não-Funcionais e Ondas de Entrega)** para consolidar o **PokéVerse OS** em nível de estúdio.

---

## 1. Inventário Técnico de Cookies e Armazenamento no Navegador

A plataforma adota arquitetura **BFF (Backend-for-Frontend)** com **zero JWT ou credencial sensível no JavaScript**. Todo tráfego de API em produção passa por proxy same-origin na Cloudflare Pages ([api-proxy.ts](../apps/web/cloudflare/api-proxy.ts)), preservando os cookies como **First-Party**.

### 1.1. Cookies Emitidos pelo Sistema

| Nome do Cookie | Escopo / Flags | Prefixo RFC 6265bis | TTL | Finalidade & Base Legal |
| :--- | :--- | :--- | :---: | :--- |
| **`__Host-pokeverse_session`** *(dev: `pokeverse_session`)* | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (prod) | **`__Host-`** (exige `Path=/`, `Secure` e ausência de `Domain`) | `15 min` (`SESSION_TTL_SEC`) | Identificador opaco (256 bits) mapeado por SHA-256 para `sess:{sidHash}` no Redis (`MFA_PENDING` ou `AUTHENTICATED`). **Estritamente necessário.** |
| **`__Secure-pokeverse_refresh`** *(dev: `pokeverse_refresh`)* | `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` (prod) | **`__Secure-`** (permite isolamento de `Path=/api/v1/auth` sem violar regra `Path=/` de `__Host-`) | `7 dias` (`REFRESH_TTL_DAYS`) | Token opaco rotacionado atomicamente em `$transaction` no PostgreSQL com detecção de reuso por `familyId`. **Estritamente necessário.** |
| **`__Secure-pokeverse_oauth_bind`** *(dev: `pokeverse_oauth_bind`)* | `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` (prod) | **`__Secure-`** | `5 min` (`300s`) | Vínculo anti-CSRF entre o navegador que iniciou o fluxo **Google OAuth 2.0 PKCE** e o callback em `/api/v1/auth/google/callback`. **Estritamente necessário.** |
| **`pokeverse_consent`** | Não-`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (prod HTTPS) | First-party padrão | `180 dias` | Armazena escolha versionada de privacidade/cookies (`PrivacyConsentSchema` v1: `essential`, `functionalPreferences`, `optionalTelemetry`). **Estritamente necessário para cumprir preferência LGPD.** |

### 1.2. Armazenamento Funcional Local (`localStorage`)

| Chave | Origem | Dado Armazenado | Comportamento quando `functionalPreferences = false` |
| :--- | :--- | :--- | :--- |
| **`pokeverse_perf_pref`** | [quality.store.ts](../apps/web/src/app/core/stores/quality.store.ts) | Preferência de tier gráfico (`auto \| ultra \| balanced \| lite`) | Não é gravada; limpeza imediata ao revogar preferências locais. |
| **`pokedex_cenario_ativo` / `pokedex_cenario_auto`** | [scenario.store.ts](../apps/web/src/app/core/stores/scenario.store.ts) | Cenário selecionado (`hoenn`, `cidade`, `vila`, `floresta`) e rotação automática | Não são gravadas; limpeza imediata ao revogar preferências locais. |
| **`pokedex_slots_salvos`** | [pokedex-slots.store.ts](../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts) | Cache local dos 10 slots no **Modo Visitante** (usuários autenticados persistem no PostgreSQL) | Não é gravada; limpeza imediata ao revogar preferências locais. |

---

## 2. Blindagens de Cookie, Proxy Same-Origin e Sincronização Multi-Aba

1. **Prevenção de Falsos Positivos de Reuso de Refresh entre Abas (`Multi-Tab Refresh Race`):**
   - **Front-end ([auth.store.ts](../apps/web/src/app/core/stores/auth.store.ts)):** `navigator.locks.request('pokeverse-auth-refresh')` serializa renovações simultâneas entre abas abertas e `BroadcastChannel('pokeverse_auth_sync')` propaga sessão renovada e logout imediatamente entre todas as abas.
   - **Back-end ([auth.service.ts](../apps/api/src/modules/auth/auth.service.ts)):** ao rotacionar um `RefreshToken`, uma janela de graça curta de **10 segundos** (`refresh_grace:{tokenHash}` cifrada em AES-256-GCM no Redis) atende chamadas concorrentes da mesma família enquanto a nova sessão ainda estiver ativa. Passados 10s (ou após logout), qualquer reuso aciona `REFRESH_REUSE_DETECTED` e revoga toda a `familyId` e todas as sessões Redis do treinador.
2. **Proxy Same-Origin da Cloudflare Pages ([api-proxy.ts](../apps/web/cloudflare/api-proxy.ts)):**
   - Preserva explicitamente múltiplos headers `Set-Cookie` via `getSetCookie()` e remove qualquer atributo `Domain=` do upstream quando `upstreamBase.hostname !== incomingUrl.hostname`, garantindo cookies *host-only* íntegros no domínio do front-end.
3. **CSRF & Bloqueio de Formulários Cross-Origin ([csrf-origin.guard.ts](../apps/api/src/common/guards/csrf-origin.guard.ts)):**
   - Valida `Sec-Fetch-Site`, `Origin` e `Referer` contra `CORS_ORIGINS`.
   - Bloqueia `Content-Type` típicos de formulários HTML simples (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) em rotas JSON mutáveis (`CSRF_UNSAFE_CONTENT_TYPE`), reconhecendo tanto cookies dev quanto prefixados (`__Host-` / `__Secure-`).

---

## 3. Conformidade LGPD (Lei nº 13.709/2018)

| Princípio / Direito (LGPD) | Implementação no PokéVerse OS |
| :--- | :--- |
| **Transparência & Finalidade (Art. 6º / Art. 9º)** | Aviso discreto inicial e modal **Privacidade, Cookies & LGPD** acessível a qualquer momento na Topbar, detalhando cookies, `localStorage`, prazos de retenção e operadores (Neon Postgres, Upstash Redis, Aiven Kafka, Resend e Google OAuth opcional). |
| **Consentimento Livre e Sem Dark Patterns (Art. 8º)** | Botões equivalentes (**"Apenas essenciais"**, **"Configurar"**, **"Aceitar tudo"**). Nenhum rastreador ou cookie de marketing/analytics de terceiros é carregado antes de opt-in explícito. |
| **Minimização & Segurança (Art. 6º / Art. 46)** | Senhas em Argon2id, segredos TOTP e payloads de e-mail Outbox cifrados em AES-256-GCM, zero PII em eventos públicos do Kafka (`WorldTicker`) e redação automática de credenciais nos logs. |
| **Controle de Sessões & Portabilidade (Art. 18)** | Endpoints autenticados `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke-others` e `GET /api/v1/auth/me/export` (download JSON completo sem hashes ou segredos), integrados ao painel **Segurança & Privacidade**. |
| **Eliminação de Dados (Próximo Marco)** | Prevista adição de `DELETE /api/v1/auth/me` com confirmação de senha/2FA para exclusão em cascata no PostgreSQL, Redis e futuros saves no S3/R2. |

---

## 4. Levantamento Completo de Requisitos do Produto

### 4.1. Requisitos Funcionais (RF)

| Código | Módulo / Capacidade | Descrição & Critérios de Entrega | Prioridade | Fase Alvo |
| :--- | :--- | :--- | :---: | :---: |
| **RF-01** | **Pokédex Suprema (5 Abas LCD + 51 Endpoints)** | Visor LCD com 5 abas navegáveis mantendo a carcaça 3D fiel: (1) Resumo/Lore + alternador **Normal / Shiny / Animado / Home**; (2) Base Stats + matriz de fraquezas `0x..4x` + simulador nível `1..100`; (3) Árvore evolutiva clicável + formas regionais/Mega/Gmax; (4) Golpes (`Level-up / TM / Egg`) + itens; (5) Biomas de encontro + Cartas TCG / Lore Anime. Índice compacto enriquecido no Redis permitindo busca combinada em `< 3 ms`. | **P0** | Fase 4B |
| **RF-02** | **Motor Audiovisual Nível Console (WebGL2 + Web Audio)** | Projetor holográfico **Three.js (`@defer`)** respeitando `ULTRA / BALANCED / LITE` + partículas elementais por tipo + **Web Audio API** (`AnalyserNode` animando espectrograma FFT nos *Cries*, sons mecânicos sintetizados na dobradiça/botões e voz opcional `SpeechSynthesis` PT-BR). | **P0** | Fase 4B |
| **RF-03** | **Comparador 1v1 & Busca Inteligente** | Comparação lado a lado entre duas espécies (atributos, BST, tipos e evolução) somada à busca fonética/Damerau-Levenshtein existente em `@pokeverse/shared`. | **P1** | Fase 4B |
| **RF-04** | **Modo Offline-First & PWA Instalável** | Service Worker + IndexedDB espelhando catálogo base, consultas recentes e `TrainerPokemonSnapshot` (10 slots salvos), com funcionamento offline confiável e indicador de sincronização. | **P1** | Fase 4B |
| **RF-05** | **Laboratório Genético & Progressão Autoritativa** | Persistência no PostgreSQL (`TrainerCapturedSpecimen`, `SpeciesAscensionProgress`, `CloningJob`) e endpoints `/api/v1/lab/*` usando as regras puras de [pokemon-lab.ts](../packages/shared/src/domain/pokemon-lab.ts): evolução por nível/item/bioma, reciclagem em **Bio-Essência (`Rank E → APEX`)**, Hyper Training de IVs e replicação controlada. | **P1** | Fase 5 |
| **RF-06** | **Ecossistema Jogável (Museu 3D, Arena, Arcade & Overworld)** | **Museu:** Globo 3D e linha do tempo (1996–presente); **Battle Frontier:** Team Builder com import/export formato Pokémon Showdown, batalha PvE/PvP autoritativa e ranking ELO via Redis/Kafka; **Arcade Retrô WASM:** catálogo GB/GBC/GBA/NDS com Cloud Save States (SHA-256 + S3/R2); **Overworld Phaser 3:** Vila Central com presença multiplayer. | **P2** | Fase 6 |
| **RF-07** | **Gestão de Conta, Sessões & LGPD Self-Service** | Gerenciador de preferências de cookies/LGPD, listagem e revogação remota de sessões ativas, exportação de dados em JSON (entregues) + exclusão definitiva de conta (`DELETE /api/v1/auth/me` como próximo incremento). | **P0** | Entregue / 4B |

### 4.2. Requisitos Não-Funcionais (RNF)

| Código | Categoria | Meta Mensurável / Critério de Aceite |
| :--- | :--- | :--- |
| **RNF-01** | **Performance & Orçamento de Bundle** | Bundle inicial Angular `<= 500 kB` raw (Three.js, Phaser, WASM, `@simplewebauthn/browser` e `socket.io-client` sempre lazy); LCP `<= 2.0s`, INP `<= 100ms`, CLS `<= 0.05`; `preserve-3d` restrito à animação; downgrade automático de `tier` se o FPS degradar. |
| **RNF-02** | **Segurança, Cookies & WebSockets** | `__Host-` / `__Secure-` em HTTPS, `CsrfOriginGuard` com validação de origem + `Content-Type` JSON, janela de graça anti-race em refresh multi-aba, `WsAuthGuard` + rate limit por socket antes do Overworld/Arena, CSP sem `script-src 'unsafe-inline'` (e `COOP`/`COEP` validados na entrada do Arcade WASM). |
| **RNF-03** | **Privacidade & LGPD** | Zero rastreadores não essenciais sem opt-in; zero PII em tópicos públicos Kafka e logs; mascaramento automático de headers sensíveis; portabilidade e transparência acessíveis em 1 clique. |
| **RNF-04** | **Resiliência & Consistência** | Cache multicamadas (*Browser/IndexedDB → Redis 24h → Redis Stale 7d → Postgres Snapshot*); `noeviction` ou isolamento lógico para sessões/idempotência no Redis; Outbox (`SKIP LOCKED`) → Kafka com idempotência e DLQ. |
| **RNF-05** | **Acessibilidade (WCAG 2.2 AA)** | Operação integral via teclado, `:focus-visible` distinto de mouse, área tátil `>= 44×44px` no mobile, contraste `>= 4.5:1` (texto) / `>= 3:1` (UI), `<dialog>` nativos com `Escape` e `prefers-reduced-motion` respeitado. |
| **RNF-06** | **Qualidade & Portões de CI/CD** | Validação contínua obrigatória via `tsc --noEmit`, lint, unit/E2E (`@pokeverse/shared`, `apps/api`, `apps/web`), `npm run audit:ui` em `1440×900` e `375×812`, mais `gitleaks`, `npm audit` e SonarCloud sem apontamentos críticos. |

---

## 5. Ordem de Execução Recomendada

1. **Onda Atual (Cookies + LGPD + Fase 4B — Pokédex Suprema):** blindagem de cookies multi-aba + LGPD entregues, seguidos pelas 5 abas LCD, filtros combinados dos 51 endpoints, Web Audio FFT, Holocron Three.js e PWA offline.
2. **Onda Diferencial (Fase 5 — Laboratório Genético):** persistência de espécimes, reciclagem (`Rank E..APEX`), evolução autoritativa e simulador competitivo com import/export Showdown.
3. **Onda Mundo (Fase 6 — Expansões Jogáveis):** Museu 3D → Battle Frontier → Arcade WASM (`COOP`/`COEP` + R2) → Overworld Phaser (`WsAuthGuard`), liberando cada módulo na `hud-quick-dock` somente após validação visual e de performance completa.
