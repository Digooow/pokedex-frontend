# 16 — Cookies, Privacidade (LGPD) e Levantamento de Requisitos

> **Objetivo deste documento:** registrar a arquitetura oficial de **Cookies**, **Armazenamento Local**, **Conformidade LGPD (Lei nº 13.709/2018)** e o **Levantamento Completo de Requisitos (Funcionais, Não-Funcionais e Catálogo Normativo de Segurança `REQ-SEC-01` a `REQ-SEC-35`)** para consolidar o **PokéVerse OS** em nível de estúdio.

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
   - **Front-end ([auth.store.ts](../apps/web/src/app/core/stores/auth.store.ts) + [auth-cross-tab-sync.service.ts](../apps/web/src/app/core/stores/auth-cross-tab-sync.service.ts)):** `navigator.locks.request('pokeverse-auth-refresh')` serializa renovações simultâneas entre abas abertas e `BroadcastChannel('pokeverse_auth_sync')` propaga sessão renovada e logout imediatamente entre todas as abas.
   - **Back-end ([token-refresh.service.ts](../apps/api/src/modules/auth/token-refresh.service.ts) via fachada [auth.service.ts](../apps/api/src/modules/auth/auth.service.ts)):** ao rotacionar um `RefreshToken`, uma janela de graça curta de **10 segundos** (`refresh_grace:{tokenHash}` cifrada em AES-256-GCM no Redis) atende chamadas concorrentes da mesma família enquanto a nova sessão ainda estiver ativa. Passados 10s (ou após logout), qualquer reuso aciona `REFRESH_REUSE_DETECTED` e revoga toda a `familyId` e todas as sessões Redis do treinador.
2. **Proxy Same-Origin da Cloudflare Pages ([api-proxy.ts](../apps/web/cloudflare/api-proxy.ts)):**
   - Preserva explicitamente múltiplos headers `Set-Cookie` via `getSetCookie()` e remove qualquer atributo `Domain=` do upstream quando `upstreamBase.hostname !== incomingUrl.hostname`, garantindo cookies *host-only* íntegros no domínio do front-end.
3. **CSRF & Bloqueio de Formulários Cross-Origin ([csrf-origin.guard.ts](../apps/api/src/common/guards/csrf-origin.guard.ts)):**
   - Valida `Sec-Fetch-Site`, `Origin` e `Referer` contra `CORS_ORIGINS`.
   - Bloqueia `Content-Type` típicos de formulários HTML simples (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) em rotas JSON mutáveis (`CSRF_UNSAFE_CONTENT_TYPE`), reconhecendo tanto cookies dev quanto prefixados (`__Host-` / `__Secure-`).

---

## 3. Conformidade LGPD (Lei nº 13.709/2018)

| Princípio / Direito (LGPD) | Implementação no PokéVerse OS |
| :--- | :--- |
| **Transparência & Finalidade (Art. 6º / Art. 9º)** | Aviso discreto inicial e modal **Privacidade, Cookies & LGPD** acessível a qualquer momento no rodapé compacto (`.app-footer`), detalhando cookies, `localStorage`, prazos de retenção e operadores (Neon Postgres, Upstash Redis, Aiven Kafka, Resend e Google OAuth opcional). |
| **Consentimento Livre e Sem Dark Patterns (Art. 8º)** | Botões equivalentes (**"Apenas essenciais"**, **"Configurar"**, **"Aceitar tudo"**). Nenhum rastreador ou cookie de marketing/analytics de terceiros é carregado antes de opt-in explícito. Caso futuros módulos de IA/personalização venham a processar dados pessoais, exigirá categoria de opt-in separada e revogável no `PrivacyConsentSchema` (`REQ-SEC-18`). |
| **Minimização & Segurança (Art. 6º / Art. 46)** | Senhas em Argon2id, segredos TOTP e payloads de e-mail Outbox cifrados em AES-256-GCM, zero PII em eventos públicos do Kafka (`WorldTicker`) e redação automática de credenciais nos logs; antes de qualquer envio a modelo externo/interno, aplicar tokenização de PII (`REQ-SEC-06`) e testes de anonimização estrutural / privacidade diferencial para conjuntos analíticos (`REQ-SEC-26`). |
| **Controle de Sessões & Portabilidade (Art. 18)** | Endpoints autenticados `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke-others` e `GET /api/v1/auth/me/export` (download JSON completo sem hashes ou segredos via [trainer-gdpr.service.ts](../apps/api/src/modules/auth/trainer-gdpr.service.ts)), integrados ao painel **Segurança & Privacidade**. |
| **Eliminação de Dados & TTL Automatizado (`DELETE /api/v1/auth/me`)** | Endpoint `DELETE /api/v1/auth/me` ([trainer-gdpr.service.ts](../apps/api/src/modules/auth/trainer-gdpr.service.ts)) integrado com confirmação em duas etapas na UI ([security-settings-dialog.component.ts](../apps/web/src/app/shared/hud/security-settings-dialog.component.ts)): valida frase de confirmação, revoga todas as sessões Redis, limpa cookies `HttpOnly` e remove a conta `Trainer` em cascata no PostgreSQL, somado a TTLs Redis (`15m` sessão, `10m` OTP, `24h`/`7d` cache), retenção Kafka (`3d`), expurgo temporal a cada `6h` (`7d`) e teto formal `<= 30–90d` para logs operacionais (`REQ-SEC-19`). |

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
| **RF-07** | **Gestão de Conta, Sessões & LGPD Self-Service** | Gerenciador de preferências de cookies/LGPD (`PrivacyConsentStore.registerNonEssentialStorageKey`), listagem e revogação remota de sessões ativas, exportação de dados em JSON (`GET /api/v1/auth/me/export`) e exclusão definitiva de conta em cascata (`DELETE /api/v1/auth/me` + confirmação em 2 etapas na UI). | **P0** | **Entregue** |

### 4.2. Requisitos Não-Funcionais (RNF)

| Código | Categoria | Meta Mensurável / Critério de Aceite |
| :--- | :--- | :--- |
| **RNF-01** | **Performance & Orçamento de Bundle** | Bundle inicial Angular `<= 500 kB` raw (Three.js, Phaser, WASM, `@simplewebauthn/browser` e `socket.io-client` sempre lazy); LCP `<= 2.0s`, INP `<= 100ms`, CLS `<= 0.05`; `preserve-3d` restrito à animação; downgrade automático de `tier` se o FPS degradar. |
| **RNF-02** | **Segurança, Cookies, WebSockets & Borda** | `__Host-` / `__Secure-` em HTTPS, `CsrfOriginGuard` com validação de origem + `Content-Type` JSON, janela de graça anti-race em refresh multi-aba, `WsAuthGuard` + rate limit por socket antes do Overworld/Arena, WAF/anti-DDoS na borda, CORS estrito por allowlist sem `*`, CSP sem `script-src 'unsafe-inline'` (e `COOP`/`COEP` no Arcade WASM), prevenção SSRF e evolução para RBAC granular + auth M2M (`REQ-SEC-01..03, 16, 20, 23, 28, 33, 34`). |
| **RNF-03** | **Privacidade, Criptografia, Segredos & LGPD** | Zero rastreadores não essenciais sem opt-in; zero PII em tópicos públicos Kafka, RUM e logs (`req.path` + redação recursiva); TLS + AES-256-GCM/KMS; cofre centralizado de segredos; portabilidade e exclusão em cascata em 1 clique; TTL automatizado por classe de dado; DLP/detecção de exfiltração e tokenização pré-modelo + privacidade diferencial quando aplicável (`REQ-SEC-04..06, 08, 10, 18, 19, 26, 30`). |
| **RNF-04** | **Resiliência & Consistência** | Cache multicamadas (*Browser/IndexedDB → Redis 24h → Redis Stale 7d → Postgres Snapshot*); `noeviction` ou isolamento lógico para sessões/idempotência no Redis; Outbox (`SKIP LOCKED`) → Kafka com idempotência e DLQ. |
| **RNF-05** | **Acessibilidade (WCAG 2.2 AA)** | Operação integral via teclado, `:focus-visible` distinto de mouse, área tátil `>= 44×44px` no mobile, contraste `>= 4.5:1` (texto) / `>= 3:1` (UI), `<dialog>` nativos com `Escape` e `prefers-reduced-motion` respeitado. |
| **RNF-06** | **Qualidade & Portões DevSecOps de CI/CD** | Validação contínua obrigatória via `tsc --noEmit`, lint, unit/E2E (`@pokeverse/shared`, `apps/api`, `apps/web`), `npm run audit:ui` em `1440×900` e `375×812`, mais `gitleaks`, `npm audit` + geração de SBOM, Trivy, SonarCloud e evolução para SAST/DAST bloqueantes no pipeline (`REQ-SEC-31, 32`). |
| **RNF-07** | **Governança de Acessos, Borda, Terceiros & Auditoria** | Matriz RBAC com papéis/escopos mínimos, WAF/DDoS, CORS/CSP estritos, anti-SSRF, restrição de acesso a logs/métricas sensíveis, bloqueio de geração/execução automática de comandos de sistema e rotina trimestral de revisão de permissões de terceiros (`REQ-SEC-01, 02, 16, 20, 23, 28, 33, 34`). |
| **RNF-08** | **Segurança de Conteúdo & Blindagem de IA/Modelos** | Gate obrigatório antes de qualquer recurso generativo/ML: filtragem de *prompt injection*, moderação de conteúdo nocivo, dados anotados e auditáveis para fine-tuning, *Red Teaming* periódico, mitigação de vieses, sandboxing isolado sem rede para execução dinâmica de código e assinatura criptográfica de respostas críticas (`REQ-SEC-07, 09, 11, 14, 15, 22, 24`). |
| **RNF-09** | **Operações, EDoS, Auditoria Imutável, Incidentes & SLAs** | Proteção contra EDoS (*hard limits* de faturamento e *budget* de tokens), monitoramento de performance e *data/model drift*, versionamento imutável e rollback rápido de modelos, gatilhos *Human-in-the-loop* (HITL), trilha de auditoria imutável (WORM/append-only), alertas automatizados + playbooks IRP, política de limitações e usos proibidos, e matriz de contratos/SLAs (`REQ-SEC-03, 12, 13, 17, 21, 25, 27, 29, 31, 32, 35`). |

### 4.3. Catálogo Normativo de Requisitos de Segurança (`REQ-SEC-01` a `REQ-SEC-35`)

A matriz abaixo detalha os **35 requisitos de segurança** integrados ao [Dossiê 13](13-dossie-de-seguranca-e-blindagem.md#9-governança-ampliada-de-segurança-privacidade-operações-e-ia-35-controles), distinguindo o estado real atual da plataforma (Web/API/LGPD sem modelo LLM em produção) dos requisitos normativos da **Onda 4 (Plataforma/Ops/CI-CD)** e da **Onda 5 (Gate Pré-IA)**.

#### Pilar 1 — Acesso, Borda e Controle de Permissões

| Código | Requisito de Segurança | Escopo | Estado Atual | Critério de Aceite & Onda Alvo |
| :--- | :--- | :---: | :---: | :--- |
| **`REQ-SEC-01`** | Autenticação forte para chamadas de API | Plataforma + IA | Parcial | Sessão BFF opaca + MFA/Passkeys para usuários ativos; exigir credenciais M2M assinadas/escopadas ou mTLS para chamadas a eventual API de modelo (**Onda 5**). |
| **`REQ-SEC-02`** | Autorização baseada em escopos e papéis (RBAC) | Plataforma + IA | Implementado (Onda 4) | `@Roles` (`VISITOR`, `TRAINER`, `MODERATOR`, `ADMIN`) e `@Scopes` aplicados com `RbacGuard` *deny-by-default* em todas as rotas privadas (`Auth`, `MFA`, `Google OAuth`, `Pokedex`), preservação de `role` no refresh/passkey e expansão futura para `lab:run`/`ops:audit` nas Fases 5–6. |
| **`REQ-SEC-16`** | Limitação de capacidade para ações sensíveis (impedir geração/execução automática de comandos no sistema) | Gate Pré-IA | Novo | Bloquear geração/execução automática de comandos de shell, DDL ou mutações destrutivas por modelo/agente; tools usam Zod estrito e aprovação explícita (**Onda 5**). |
| **`REQ-SEC-20`** | Rotinas de revisão de permissões concedidas a serviços de terceiros | Plataforma | Novo | Checklist e auditoria trimestral (mais revisão pós-incidente) de escopos OAuth, chaves API, tokens CI/CD e roles IAM em todos os provedores (**Onda 4**). |
| **`REQ-SEC-23`** | Controle estrito de acesso aos logs e métricas sensíveis da aplicação | Plataforma | Parcial -> Endurecido | Redação estruturada + `GET /api/v1/system/telemetry` por RBAC `ops:audit` + binds em `127.0.0.1` e Grafana autenticado (`GF_AUTH_ANONYMOUS_ENABLED=false`); manter SSO/VPN em consoles cloud (**Onda 4**). |
| **`REQ-SEC-28`** | Proteção contra DDoS e WAF (Web Application Firewall) | Plataforma + IA | Parcial | Manter Cloudflare Pages + `RedisThrottlerStorage` + limites de payload/WS; ativar regras gerenciadas OWASP WAF, anti-bot e bloqueio de acesso direto à origem Azure fora do WAF (**Onda 4**). |
| **`REQ-SEC-33`** | Prevenção contra SSRF (Server-Side Request Forgery) | Plataforma + IA | Implementado pós-DNS (Onda 4) | `assertSafeOutboundUrl` (allowlist HTTPS, `redirect: 'error'` e bloqueio RFC1918/loopback/`169.254.169.254`/IPv6 local pós-DNS) ativo em `PokeApiCacheService`, `GoogleOAuthHttpClient` e `MailService`; manter pinagem/conector caso tools dinâmicas de IA entrem na **Onda 5**. |
| **`REQ-SEC-34`** | Configuração estrita de CORS e CSP | Plataforma | Implementado c/ ressalva | Manter `CORS_ORIGINS` sem `*` (`app.setup.ts`, `WorldGateway`) e CSP em `_headers`; substituir `style-src 'unsafe-inline'` por `ngCspNonce` (**Onda 2**) e isolar `'wasm-unsafe-eval'` em `/arcade` (**Onda 3**). |

#### Pilar 2 — Privacidade e Proteção de Dados

| Código | Requisito de Segurança | Escopo | Estado Atual | Critério de Aceite & Onda Alvo |
| :--- | :--- | :---: | :---: | :--- |
| **`REQ-SEC-04`** | Logging mínimo e seguro, garantindo ausência de PII nos registros | Plataforma + IA | Coberto (API/Web) | Manter redação recursiva + `req.path` + zero PII no Kafka/RUM e estender proibição a prompts/respostas brutas de eventual IA (**Onda 1 / Onda 5**). |
| **`REQ-SEC-05`** | Criptografia de ponta a ponta (em trânsito e em repouso) | Plataforma + IA | Parcial | Manter TLS/mTLS em todos os canais e AES-256-GCM nos campos críticos; formalizar KMS/criptografia gerenciada em repouso e cifragem E2E para payloads sensíveis de IA (**Onda 4 / Onda 5**). |
| **`REQ-SEC-06`** | Tokenização de dados sensíveis antes do envio ao modelo | Gate Pré-IA | Novo | Pseudonimizar/tokenizar PII, credenciais e identificadores reais com mapeamento efêmero local antes de enviar qualquer contexto ao modelo (**Onda 5**). |
| **`REQ-SEC-08`** | Sanitização de saída contra chaves de API, senhas e segredos internos | Plataforma + IA | Parcial | `GlobalExceptionFilter` ativo para HTTP; adicionar filtro DLP de saída bloqueando padrões de segredos/chaves/PII antes de retornar respostas geradas (**Onda 5**). |
| **`REQ-SEC-10`** | Detectores de vazamento de dados e tentativas de exfiltração | Plataforma + IA | Parcial (Gitleaks + DLP) | Mantidos Gitleaks no CI, redação DLP ampliada (JWT, PEM, e-mail) em logs/auditoria e throttle em `GET /auth/me/export`; adicionar detectores comportamentais runtime de volume/scraping (**Cloud/Onda 4**). |
| **`REQ-SEC-18`** | Consentimento explícito para utilização e processamento de dados pessoais | Plataforma + IA | Parcial (LGPD Web) | `PrivacyConsentStore` ativo para cookies/telemetria; ampliar `PrivacyConsentSchema` com opt-in separado e revogável antes de qualquer processamento por IA (**Onda 5**). |
| **`REQ-SEC-19`** | Políticas automatizadas de retenção e deleção de dados (TTL) | Plataforma + IA | Parcial -> Consolidado (Infra) | TTLs automatizados no Redis (`15m`/`10m`/`24h`/`7d`), expurgo `6h` de tokens/outbox, Kafka `3d`, Loki `720h` (`30d` com `compactor`), Prometheus `15d`, Tempo `72h` + `DELETE /auth/me`; definir TTLs futuros para prompts de IA (`<= 24h`) (**Onda 4 / Onda 5**). |
| **`REQ-SEC-26`** | Testes de privacidade diferencial (ou técnicas similares) para anonimização estrutural | Gate Pré-IA / Analytics | Novo | Aplicar testes de *k*-anonimato ou privacidade diferencial com orçamento `epsilon` documentado antes de exportar datasets analíticos ou treinar modelos (**Onda 5**). |
| **`REQ-SEC-30`** | Cofre de segredos centralizado | Plataforma + IA | Parcial | Consolidar segredos hoje distribuídos em GitHub/Azure/Cloudflare/.env em cofre dedicado criptografado (Azure Key Vault / HashiCorp Vault / Doppler) com auditoria de leitura e rotação centralizada (**Onda 4**). |

#### Pilar 3 — Segurança de Conteúdo e Comportamento do Modelo

| Código | Requisito de Segurança | Escopo | Estado Atual | Critério de Aceite & Onda Alvo |
| :--- | :--- | :---: | :---: | :--- |
| **`REQ-SEC-07`** | Filtragem ativa de prompts maliciosos na camada de entrada | Gate Pré-IA | Novo | Isolar *system prompt* de texto do usuário, validar limites via Zod e filtrar tentativas de *prompt injection* e *jailbreak* antes da inferência (**Onda 5**). |
| **`REQ-SEC-09`** | Filtros de conteúdo seguro (injúria, violência, discurso de ódio) na saída | Gate Pré-IA | Novo | Classificador/guardrail de moderação obrigatório bloqueando respostas abusivas antes da entrega ao usuário, com fallback neutro (**Onda 5**). |
| **`REQ-SEC-11`** | Treinamento e fine-tuning apenas com dados anotados e auditáveis | Gate Pré-IA | Novo | Exigir linhagem rastreável, licença/consentimento válido e catálogo auditável de amostras para qualquer fine-tuning ou base vetorial (**Onda 5**). |
| **`REQ-SEC-14`** | Testes adversariais regulares (Red Teaming) no modelo | Gate Pré-IA | Novo | Suíte automatizada de *Red Teaming* em CI pré-release e ciclos periódicos testando *jailbreak*, extração de segredos e abuso lógico (**Onda 5**). |
| **`REQ-SEC-15`** | Avaliação técnica e mitigação de vieses (bias) | Gate Pré-IA | Novo | Suite de métricas de equidade/viés executada antes da aprovação de versões de modelo em produção (**Onda 5**). |
| **`REQ-SEC-22`** | Sandboxing completo para execuções dinâmicas de código sugerido pela IA | Gate Pré-IA | Novo (WASM hoje só p/ ROMs) | Proibir execução no runtime da API; qualquer código dinâmico sugerido por IA só executa em sandbox efêmero sem rede, sem FS gravável e com limite de CPU/RAM/tempo (**Onda 5**). |
| **`REQ-SEC-24`** | Assinatura e verificação de respostas para integridade quando exigido | Plataforma + IA | Parcial (SHA-256/OIDC) | Assinar criptograficamente (HMAC/Ed25519) respostas ou decisões críticas geradas e verificar assinatura na camada consumidora antes de persistir/aplicar (**Onda 5**). |

#### Pilar 4 — Monitoramento, Operações e Conformidade

| Código | Requisito de Segurança | Escopo | Estado Atual | Critério de Aceite & Onda Alvo |
| :--- | :--- | :---: | :---: | :--- |
| **`REQ-SEC-03`** | Rate limiting configurado por chave ou por usuário | Plataforma + IA | Implementado por Usuário/IP (Onda 4) | `TrainerThrottlerGuard` sobre `RedisThrottlerStorage` Lua chaveando por `trainerId` autenticado ou IP + trava `(IP, email)` e salto proxy confiável no WS; estender na **Onda 5** para `apiKeyId` e orçamento de tokens de IA. |
| **`REQ-SEC-12`** | Monitoramento contínuo de performance e deriva (`data/model drift`) | Plataforma + IA | Parcial (Web/API) | Manter OTel + RED/USE + RUM e adicionar métricas contínuas de qualidade, taxa de recusa, latência de inferência e *data/model drift* (**Onda 5**). |
| **`REQ-SEC-13`** | Mecanismos de rollback rápido e versionamento controlado de modelos | Plataforma + IA | Parcial (CI/Docker) | Associar ID imutável de versão de modelo/prompt a cada inferência e manter *feature flag* para *rollback* imediato sem rebuild (**Onda 5**). |
| **`REQ-SEC-17`** | Gatilhos de revisão humana (*Human-in-the-loop*) para alto risco | Plataforma + IA | Novo | Interceptar ações irreversíveis, moderações críticas ou falhas de confiança do modelo exigindo aprovação humana auditada antes da efetivação (**Onda 5**). |
| **`REQ-SEC-21`** | Alertas automatizados e playbooks para resposta rápida a incidentes | Plataforma | Parcial -> Alertas Ativos | Regras de alerta em [`alerts.yml`](../infra/observability/prometheus/alerts.yml) (`5xx`, `p95`, `DLQ`, `cache hit`, `Postgres/Redis down`, `UI crashes`) + `errorCode`s do `StructuredLoggerService` + Sentry; conectar Alertmanager externo e manter playbooks IRP testados (**Onda 4**). |
| **`REQ-SEC-25`** | Documentação clara de limitações arquitetônicas e usos estritamente proibidos | Plataforma + IA | Parcial -> Formalizado | Limitações conhecidas e Política de Uso Proibido formalizadas no [Dossiê 13 §9.5](13-dossie-de-seguranca-e-blindagem.md#95-limitações-arquitetônicas-e-casos-de-uso-estritamente-proibidos-25--req-sec-25) (**Onda 4**). |
| **`REQ-SEC-27`** | Contratos e SLAs mapeando responsabilidades e garantias entre as partes | Plataforma | Parcial -> Formalizado | Matriz de Responsabilidade Compartilhada e metas/SLAs documentadas no [Dossiê 13 §9.6](13-dossie-de-seguranca-e-blindagem.md#96-matriz-de-responsabilidade-compartilhada-contratos-e-slas-27--req-sec-27) (**Onda 4**). |
| **`REQ-SEC-29`** | Proteção contra EDoS (Economic Denial of Sustainability) | Plataforma + IA | Novo | Definir *hard limits* e alertas de faturamento (50%/80%/100%) nas contas de provedores/APIs de IA, limitar tamanho de contexto/tokens no Zod e acionar *kill-switch* de custo (**Onda 4 / Onda 5**). |
| **`REQ-SEC-31`** | Escaneamento de dependências (SCA / SBOM) | Plataforma | Implementado (SCA `high` + SBOM) | `npm audit --omit=dev --audit-level=high` (`0` vulnerabilidades via `overrides` + `@prisma/config`), Trivy na imagem `pokeverse-api:ci` e artefato **SBOM CycloneDX** ativos no `ci.yml`. |
| **`REQ-SEC-32`** | Testes de segurança no CI/CD (SAST e DAST) | Plataforma | Parcial (SAST ativo; falta DAST) | **CodeQL** (`sast`), SonarCloud, ESLint, Gitleaks e E2E HTTP/integração ativos no `ci.yml`; adicionar suíte **DAST** automatizada (OWASP ZAP/Nuclei) contra container pré-merge na `main` (**Cloud/Onda 4**). |
| **`REQ-SEC-35`** | Trilha de auditoria imutável | Plataforma + IA | Implementado no Postgres (Onda 4) | Tabela `"AuditLog"` protegida por trigger PostgreSQL `prevent_audit_log_mutation()` (`BEFORE UPDATE/DELETE`), fora do expurgo de `6h`/`7d`, com `AuditTrailService` registrando LGPD (`export`/`delete`), negações RBAC e reuso de refresh; expandir para MFA/OAuth/Object Lock S3 conforme evolução. |

---

## 5. Ordem de Execução Recomendada

1. **Onda Atual (Cookies + LGPD + Fase 4B — Pokédex Suprema):** blindagem de cookies multi-aba + LGPD entregues, seguidos pelas 5 abas LCD, filtros combinados dos 51 endpoints, Web Audio FFT, Holocron Three.js e PWA offline.
2. **Onda Diferencial (Fase 5 — Laboratório Genético):** persistência de espécimes, reciclagem (`Rank E..APEX`), evolução autoritativa e simulador competitivo com import/export Showdown.
3. **Onda Mundo (Fase 6 — Expansões Jogáveis):** Museu 3D → Battle Frontier → Arcade WASM (`COOP`/`COEP` + R2) → Overworld Phaser (`WsAuthGuard`), liberando cada módulo no menu de módulos (`HudModulesMenuComponent`) somente após validação visual e de performance completa.
