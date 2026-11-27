# 03 — Métricas de Produto, Funil e Analytics (Privacy-First & LGPD)

> **Objetivo:** medir aquisição, ativação, retenção e uso real das funcionalidades do **PokéVerse OS** sem violar a **LGPD (`REQ-SEC-18`)**, sem degradar o **Core Web Vitals** e sem afrouxar o **CSP estrito** (`apps/web/public/_headers`).

---

## 1. Framework AARRR Aplicado ao PokéVerse OS

| Etapa do Funil | Pergunta que Responde | Métrica / KPI Principal | Onde Medir |
| :--- | :--- | :--- | :--- |
| **1. Aquisição** | Quantas pessoas chegaram e de onde vieram? | Visitantes únicos, *Pageviews*, *Referrers* (Google, TabNews, TikTok, Discord, Direto), Países/Dispositivos. | **Cloudflare Web Analytics** + Google Search Console |
| **2. Ativação** | O visitante entendeu e usou o produto de verdade? | % que passa da rota `/` (`Iniciar Jogo`) para `/pokedex` ou `/museu`; % que busca um Pokémon ou abre **Holocron 3D / Comparar / Calculadora**. | Eventos de produto *first-party* (`MEL-08`) + RUM |
| **3. Conversão** | Quantos criaram conta e verificaram e-mail? | Cadastros/dia (`Trainer`), Taxa de verificação de e-mail (`emailVerifiedAt IS NOT NULL`), Login via Google OAuth vs Senha, % com MFA/Passkey. | **PostgreSQL (Neon)** + Painel `/admin` (`MEL-09`) |
| **4. Retenção** | Quem criou conta voltou e engajou? | **DAU / WAU / MAU**, retorno em D1/D7/D30, Trainers com `>= 1` slot salvo em `PokedexSlot`, médias de slots preenchidos. | **PostgreSQL (Neon)** + Métricas OTel (`MEL-08`) |
| **5. Referência** | Usuários estão trazendo outros usuários? | Cliques/visitas entrando direto em URLs profundas (`/pokedex?q=...&mode=...`), tráfego orgânico de marca (`"pokeverse os"`). | Cloudflare Web Analytics + Search Console |

---

## 2. Arquitetura de Analytics Compatível com CSP e LGPD

O projeto já possui duas proteções rígidas que impedem copiar e colar scripts comuns de analytics (como Google Analytics 4 direto no `index.html`):

1. **CSP Estrito ([`apps/web/public/_headers`](../../apps/web/public/_headers)):** restringe `script-src` e `connect-src`.
2. **Gate LGPD ([`PrivacyConsentStore`](../../apps/web/src/app/core/stores/privacy-consent.store.ts)):** bloqueia telemetria opcional (`optionalTelemetryEnabled()`) enquanto o usuário não der consentimento explícito (`REQ-SEC-18`).

### Solução recomendada em 3 camadas

| Camada | Ferramenta | Exige Cookie / Banner? | O que resolve |
| :--- | :--- | :---: | :--- |
| **Camada 1 — Tráfego Web Agregado** | **Cloudflare Web Analytics** (nativo no Cloudflare Pages) | **Não** (stateless, sem cookies, sem fingerprinting de usuário) | Responde imediatamente *"quantos visitantes entraram hoje, de qual país, celular vs desktop, quais páginas e qual site indicou"*. Nota: caso ative via snippet em vez de injeção automática Cloudflare, valide a diretiva CSP para o script do Beacon ou mantenha via proxy/injeção controlada. |
| **Camada 2 — Funil & Saúde *First-Party*** | **PostgreSQL + OpenTelemetry + Túnel BFF** (`/api/v1/telemetry/*` + `/api/v1/admin/*`) | Só eventos opcionais de UI dependem de opt-in; **contagem de cadastros, logins e uso de API no servidor são eventos operacionais legítimos** | Imune a AdBlockers; alimenta tanto o Grafana/OTel (`MEL-08`) quanto o futuro painel **`/admin` (`MEL-09`)**. |
| **Camada 3 — Analytics Comportamental (Opcional Futuro)** | **Umami** (self-hosted/Cloud Free) ou **PostHog Free** via proxy same-origin | Sim se usar identificação persistente; **Não** no modo anônimo sem cookies | Funis detalhados (ex.: *"Tela Inicial → Pokédex → Holocron → Botão Cadastrar"*), quando o tráfego justificar. |

---

## 3. Catálogo de Eventos de Produto Recomendados (`MEL-08`)

Ao instrumentar métricas de negócio no back-end e no front-end (respeitando `PrivacyConsentStore`), mantenha **cardinalidade baixa** nos labels do OpenTelemetry/Prometheus (nunca coloque `userId`, `email` ou strings livres de busca como label de métrica — use apenas categorias finitas):

| Evento / Métrica | Onde Capturar | Atributos Seguros (Baixa Cardinalidade) | Por que Importa |
| :--- | :--- | :--- | :--- |
| `business_trainer_registrations_total` | `CredentialsAuthService` / `GoogleAccountLinkerService` | `method=password\|google` | Mede crescimento diário de contas reais. |
| `business_trainer_email_verified_total` | `AccountRecoveryService` | `outcome=verified` | Detecta gargalo no envio de OTP (Resend / spam). |
| `business_trainer_logins_total` | `TrainerSessionIssuerService` | `method=password\|google\|passkey`, `mfa=true\|false` | Mede retorno recorrente de usuários reais (DAU). |
| `business_pokedex_slots_saved_total` | `PokedexSlotsService` | `action=save\|swap\|clear` | Mede ativação do recurso exclusivo de quem criou conta. |
| `business_pokedex_api_usage_total` | `PokedexController` / `PokedexEncyclopediaController` | `resource=catalog\|bundle\|holocron\|encyclopedia` | Mostra quais áreas da enciclopédia geram mais demanda. |
| `client_ui_journey_event` *(opt-in LGPD via `/api/v1/telemetry/rum`)* | `WebTelemetryService` | `event=start_clicked\|visor_mode\|compare_opened\|calc_simulated`, `tier=ULTRA\|BALANCED\|LITE` | Mostra quais modos do Visor/Holograma prendem mais atenção e em qual perfil de hardware. |

---

## 4. Rotina Semanal de Análise (15 Minutos)

Toda segunda-feira, antes de decidir o que programar na semana:

1. **Tráfego (3 min — Cloudflare Web Analytics):** quantos visitantes únicos nos últimos 7 dias? Qual canal trouxe mais gente (Google, vídeo curto, TabNews, direto)?
2. **Busca Orgânica (3 min — Google Search Console):** quantas impressões e cliques no Google? Quais consultas já aparecem nas posições 8–20 (oportunidades fáceis de melhorar título/descrição)?
3. **Conversão & Retenção (5 min — Neon SQL ou `/admin`):** quantas novas contas nos últimos 7 dias? Quantas verificaram e-mail? Quantas salvaram ao menos 1 slot na Pokédex?
4. **Saúde & Erros (4 min — Sentry / Azure Logs / Aiven DLQ):** houve erro 5xx, falha no envio de OTP no Resend ou mensagem parada em `pokeverse.dlq.v1`?
5. **Decisão da Semana:** escolher **1 único gargalo** (ex.: *"Muitos visitantes param na tela `/` sem clicar em Iniciar"* ou *"Usuários entram no `/pokedex` mas poucos criam conta"*) para atacar com melhoria no `MEL-02` ou divulgação direcionada.
