# 01 — SEO Técnico e Presença no Google

> **Objetivo:** garantir que o **PokéVerse OS** seja rastreado, indexado, ranqueado para buscas relevantes em português e inglês e gere previews visuais atrativos ao ser compartilhado no WhatsApp, Discord, X, LinkedIn e Reddit.

---

## 1. Diagnóstico Atual no Repositório

Inspeção direta do código atual (`apps/web`):

| Ponto verificado | Estado atual | Impacto em SEO / Social |
| :--- | :--- | :--- |
| [`apps/web/src/index.html`](../../apps/web/src/index.html) | Contém apenas `<title>PokéVerse OS — Plataforma Interativa</title>`, `charset`, `viewport` e `favicon.svg`. | Sem `meta description`, `canonical`, Open Graph (`og:*`), Twitter Cards ou JSON-LD; o Google cria snippets genéricos e links compartilhados não exibem imagem nem descrição rica. |
| [`apps/web/public/`](../../apps/web/public) | Possui `_headers`, `_routes.json`, `favicon.ico` e `assets/`, mas **não possui** `robots.txt` nem `sitemap.xml`. | Rastreamento subótimo; crawlers não recebem o mapa das rotas públicas (`/`, `/inicio`, `/pokedex`, `/museu`). |
| [`apps/web/public/_routes.json`](../../apps/web/public/_routes.json) | Roteia apenas funções Cloudflare (`/api/*`, `/health/*`, `/socket.io/*`). | Positivo para performance estática; se criarmos uma Pages Function de SEO para `/pokedex`, será necessário ajustar `_routes.json` com precisão para não interceptar `.js`/`.css`/`.webp`. |
| **Domínio de produção** | Publicado em `https://pokeverse.pages.dev/` (domínio próprio pendente em [`docs/10`](../10-infraestrutura-docker-ci-cd-e-deploy.md)). | Subdomínios gratuitos têm menor confiança percebida pelo usuário final e risco de fragmentação caso mude de URL sem redirecionamento `301`. |
| **Renderização** | Angular 22 SPA *client-side* (sem SSR/prerender habilitado). | O Googlebot renderiza JS (em duas ondas, mais lento), porém bots de preview social (**WhatsApp, Discord, Telegram, Slack, X, LinkedIn**) **não executam JavaScript** e leem apenas o HTML inicial estático. |

---

## 2. Domínio Próprio vs. `pokeverse.pages.dev`

Embora `https://pokeverse.pages.dev/` já esteja no ar com HTTPS e CDN global, conectar um **domínio próprio** traz ganhos diretos:

1. **Autoridade de domínio acumulativa:** todo backlink de TabNews, GitHub, Reddit e YouTube passa a fortalecer seu próprio domínio, não o domínio compartilhado `pages.dev`.
2. **Confiança e CTR no Google:** resultados de busca com domínio próprio claro têm maior taxa de clique (CTR) e melhor memorização.
3. **Alinhamento com Auth/E-mail:** permite configurar SPF/DKIM/DMARC no **Resend** (evitando e-mails de OTP caírem em spam) e estabiliza `WEBAUTHN_RP_ID`, `CORS_ORIGINS` e `GOOGLE_REDIRECT_URI`.

> **Regra de migração:** ao ativar o domínio próprio no Cloudflare, mantenha um redirecionamento `301` permanente de `pokeverse.pages.dev/*` para o domínio canônico (`https://pokedex.<domínio>/$1`) e atualize `canonical`, `sitemap.xml` e Search Console.

---

## 3. SEO On-Page e Metadados Dinâmicos (`MEL-07`)

### 3.1. Metadados Base no `apps/web/src/index.html`

O `index.html` deve conter fallback semântico completo para qualquer rota antes da hidratação do Angular:

- `<meta name="description" content="...">` (140–160 caracteres com palavras-chave naturais em PT-BR).
- `<link rel="canonical" href="https://pokeverse.pages.dev/">` (atualizado dinamicamente por rota).
- **Open Graph:** `og:type="website"`, `og:site_name="PokéVerse OS"`, `og:locale="pt_BR"`, `og:title`, `og:description`, `og:url`, `og:image` (`1200×630` usando imagem dedicada em `apps/web/public/assets/og-cover.webp` ou PNG compatível com crawlers sociais — **nota:** WhatsApp/X preferem `.jpg`/`.png` em `og:image`, então gere também `og-cover.png` de `1200×630`).
- **Twitter Cards:** `twitter:card="summary_large_image"`, `twitter:title`, `twitter:description`, `twitter:image`.
- **JSON-LD (`application/ld+json`):** schema `WebApplication` descrevendo nome, URL, categoria (`GameApplication` / `ReferenceApplication`), idioma (`pt-BR`), preço (`0`) e recursos (Pokédex 3D, Holocron 3D, Calculadora VGC/Showdown, Museu das Regiões).

### 3.2. Serviço Angular de Metadados por Rota (`SeoMetaService`)

Criar um serviço leve no Angular usando `Title`, `Meta` (`@angular/platform-browser`) e `DOCUMENT`:

| Rota / Estado | `<title>` sugerido | Foco da `<meta name="description">` |
| :--- | :--- | :--- |
| `/` | `PokéVerse OS — Pokédex 3D Interativa, Holocron e Calculadora VGC` | Apresentação direta do ecossistema e acesso rápido. |
| `/inicio` | `Hub Central — PokéVerse OS` | Visão dos módulos disponíveis (Pokédex, Museu, futuros módulos). |
| `/pokedex` | `Pokédex 3D Online — Ficha, Holocron 3D, Comparador 1v1 e Calculadora` | Busca fonética PT/EN, 1351 entradas, 18 tipos e Showdown. |
| `/pokedex?q=pikachu` | `Pikachu (#025) — Status, Evoluções, Golpes e 3D | PokéVerse OS` | Ficha do Pokémon selecionado com tipos e recursos de análise. |
| `/pokedex?mode=calculadora` | `Calculadora de Atributos & Dano Pokémon (VGC / Showdown) | PokéVerse OS` | 25 naturezas, presets Smogon/VGC, 16 rolls e Import/Export. |
| `/pokedex?mode=comparar` | `Comparador Pokémon 1v1 — Stats, BST e Efetividade | PokéVerse OS` | Comparação lado a lado e matriz defensiva `0x..4x`. |
| `/museu` | `Museu das Regiões Pokémon (Kanto a Paldea) | PokéVerse OS` | Linha do tempo de 1996–2022, mapas e iniciais das 9 regiões. |

> **Atenção a rotas privadas:** rotas protegidas por `authGuard` (`/mundo`, `/arcade`, `/arena` e o futuro `/admin`) devem receber `<meta name="robots" content="noindex, nofollow">` para não desperdiçar *crawl budget* nem indexar telas bloqueadas.

---

## 4. Indexação de SPA Angular e Previews Sociais no Cloudflare Pages

Como a aplicação roda em Angular *client-side* sobre Cloudflare Pages, existem **dois problemas distintos** a resolver:

1. **Crawlers de redes sociais/mensageiros (WhatsApp, Discord, Telegram, X, LinkedIn):** não executam JS. Se alguém compartilhar `/pokedex?q=charizard&mode=holocron`, o bot lê o `index.html` cru.
2. **Googlebot / Bingbot:** executam JS, mas páginas pré-renderizadas ou com resposta HTML semântica instantânea reduzem latência de indexação e melhoram o LCP.

### Solução recomendada em 2 camadas (custo zero no Cloudflare Pages)

1. **Camada A — Prerender estático ou rotas públicas limpas:**
   - Avaliar `prerender` do `@angular/build` para as rotas estáticas principais (`/`, `/inicio`, `/pokedex`, `/museu`) respeitando `inlineCritical: false` (para manter o CSP estrito de `apps/web/public/_headers`).
2. **Camada B — Cloudflare Pages Function com `HTMLRewriter` para URLs com `?q=` ou `?mode=`:**
   - Criar uma Function leve que só atua quando a requisição **não** é asset estático e contém query params compartilháveis (`q`, `mode`) ou vem de User-Agent de bot social (`WhatsApp`, `Discordbot`, `Twitterbot`, `LinkedInBot`, `Slackbot`, `TelegramBot`, `Googlebot`).
   - Ela busca o `index.html` estático da borda (`env.ASSETS.fetch(request)`) e reescreve `<title>`, `meta[name="description"]`, `meta[property^="og:"]`, `link[rel="canonical"]` em streaming com `HTMLRewriter` — mantendo zero backend extra e respeitando o CSP.

---

## 5. Arquivos `robots.txt` e `sitemap.xml` (`apps/web/public/`)

### 5.1. `apps/web/public/robots.txt`

```txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /health/
Disallow: /admin

Sitemap: https://pokeverse.pages.dev/sitemap.xml
```

### 5.2. `apps/web/public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://pokeverse.pages.dev/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://pokeverse.pages.dev/inicio</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pokeverse.pages.dev/pokedex</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://pokeverse.pages.dev/museu</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

> **Evolução futura de cauda longa:** quando houver páginas indexáveis por espécie (ex.: `/pokedex/pikachu` ou sitemap dinâmico servido por Pages Function para os 1025 Pokémon principais), gere `sitemap-pokemon.xml` referenciado via `<sitemapindex>` para capturar buscas específicas por nome de Pokémon.

---

## 6. Google Search Console, Bing Webmaster Tools e Palavras-Chave

### 6.1. Checklist de Cadastro

1. Acessar [Google Search Console](https://search.google.com/search-console) e adicionar a propriedade:
   - Se usar `pokeverse.pages.dev`: usar método **Prefixo do URL** com `<meta name="google-site-verification" ...>` ou upload do arquivo HTML de verificação em `apps/web/public/`.
   - Se usar domínio próprio no Cloudflare: usar método **Domínio** com registro `TXT` no DNS do Cloudflare (cobre todos os subdomínios).
2. Enviar `https://<seu-dominio>/sitemap.xml` em **Sitemaps**.
3. Usar **Inspeção de URL** em `/`, `/pokedex` e `/museu` e clicar em **Testar URL publicado** → verificar a captura de tela renderizada pelo Googlebot (confirmar que não há bloqueio de CSP ou erro de console) → clicar em **Solicitar indexação**.
4. Importar a propriedade do Search Console diretamente no **Bing Webmaster Tools** (1 clique) para ganhar indexação no Bing, DuckDuckGo e Ecosia.

### 6.2. Clusters de Palavras-Chave Alvo

| Intenção de Busca | Termos em Português (Brasil) | Termos em Inglês (Cauda Internacional) | Página Alvo |
| :--- | :--- | :--- | :--- |
| **Experiência Visual / Marca** | `pokedex 3d online`, `pokedex interativa`, `pokedex online portugues` | `3d pokedex web app`, `interactive 3d pokedex` | `/pokedex` |
| **Modelos 3D** | `modelos 3d pokemon`, `ver pokemon em 3d shiny` | `pokemon 3d model viewer`, `shiny pokemon 3d holocron` | `/pokedex?mode=holocron` |
| **Competitivo / VGC** | `calculadora pokemon vgc`, `calculadora dano pokemon showdown`, `simulador dano pokemon` | `pokemon damage calculator showdown`, `pokemon stat ev iv calculator` | `/pokedex?mode=calculadora` |
| **Comparação** | `comparar dois pokemon`, `comparador de status pokemon`, `fraqueza e resistencia pokemon` | `compare two pokemon stats`, `pokemon 1v1 comparator` | `/pokedex?mode=comparar` |
| **Lore / História** | `regioes pokemon ordem`, `iniciais de todas as regioes pokemon` | `pokemon regions timeline`, `all pokemon regions starters` | `/museu` |

---

## 7. Core Web Vitals como Fator de Ranking

O Google usa **Core Web Vitals** (`LCP <= 2.5s`, `INP <= 200ms`, `CLS <= 0.1`) como critério real de qualidade de página. O repositório já possui infraestrutura favorável:

- Orçamento de bundle inicial estrito (`<= 501 kB`) e chunk lazy para `three` (`@defer` no Holocron 3D).
- Auditoria visual automática (`npm run audit:ui`) e suíte Playwright (`npm run test:e2e:web`).
- **Cuidados práticos ao evoluir SEO:**
  - Não injetar scripts de terceiros bloqueantes no `<head>`.
  - Garantir `width`/`height` e `aspect-ratio` nas imagens de previews e cards do `/inicio` e `/museu` para manter `CLS` próximo de `0`.
  - Verificar no Search Console (relatório *Principais métricas da Web*) a experiência real de campo após atingir volume mínimo de visitas no Chrome User Experience Report (CrUX).
