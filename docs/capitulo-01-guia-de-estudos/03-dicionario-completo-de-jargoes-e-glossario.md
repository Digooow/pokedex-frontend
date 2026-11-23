<p align="center">
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="02-linguagens-estruturas-de-dados-e-pacote-shared.md">Anterior: Vol. 02 (Linguagens, Estruturas &amp; Shared)</a>
  &nbsp;·&nbsp;
  <a href="../../README.md">README atual</a>
</p>

# Volume 03 — Glossário Técnico Completo: Linguagens, Frameworks, Arquitetura, Dados e Segurança

> **Escopo deste volume:** dicionário de referência técnica cobrindo linguagens de programação, frameworks, bibliotecas, estruturas de dados, padrões arquiteturais, protocolos de rede, segurança da informação e ferramentas de infraestrutura empregados no **PokéVerse OS** (`docs/00` a `docs/18`, `ARCHITECTURE.md` e código-fonte), com definição conceitual, funcionamento prático e localização exata no repositório.

---

## Índice Temático

1. [Linguagens, Runtimes, Frameworks e Ferramentas de Build](#1-linguagens-runtimes-frameworks-e-ferramentas-de-build)
2. [Arquitetura de Software, Monorepo e Padrões de Projeto](#2-arquitetura-de-software-monorepo-e-padrões-de-projeto)
3. [Tipagem Avançada, Estruturas de Dados e Algoritmos](#3-tipagem-avançada-estruturas-de-dados-e-algoritmos)
4. [Front-end Moderno, Cinemática 3D, Hardware e Acessibilidade](#4-front-end-moderno-cinemática-3d-hardware-e-acessibilidade)
5. [Back-end, HTTP, APIs e Comunicação em Tempo Real](#5-back-end-http-apis-e-comunicação-em-tempo-real)
6. [Banco de Dados Relacional e Armazenamento de Objetos](#6-banco-de-dados-relacional-e-armazenamento-de-objetos)
7. [Cache Distribuído, Concorrência e Mensageria Assíncrona](#7-cache-distribuído-concorrência-e-mensageria-assíncrona)
8. [Segurança da Informação (AppSec), Identidade (IAM) e LGPD](#8-segurança-da-informação-appsec-identidade-iam-e-lgpd)
9. [Infraestrutura, Containers, Observabilidade, Testes e CI/CD](#9-infraestrutura-containers-observabilidade-testes-e-cicd)

---

## 1. Linguagens, Runtimes, Frameworks e Ferramentas de Build

- **JavaScript (`ECMAScript / ES2022`):** linguagem de programação padrão dos navegadores Web e do ambiente servidor Node.js, executada pelo motor V8 (com compilação *Just-In-Time*). Opera com tipagem dinâmica (os tipos são verificados em tempo de execução) e programação assíncrona baseada em *event loop*, `Promise` e `async/await`. Utilizada diretamente na Fase 0 ([`js/app.js`](../../js/app.js)), no script [`scripts/ui-quality-gate.mjs`](../../scripts/ui-quality-gate.mjs) e como código de saída gerado pelo compilador para todo o monorepo.
- **TypeScript `6.0` (`strict`) e *Type Erasure*:** extensão estaticamente tipada do JavaScript que verifica contratos de variáveis, funções, interfaces e genéricos durante a compilação (`tsc --noEmit`), antes da execução. No momento em que transpila código `.ts` para `.js`, realiza *Type Erasure* — remove todas as declarações de tipo do JavaScript gerado. Por esse motivo, validações de entradas externas em runtime ficam a cargo do **Zod**. *(Configurado em [`tsconfig.base.json`](../../tsconfig.base.json)).*
- **HTML5 (*HyperText Markup Language*, versão 5):** linguagem de marcação declarativa que estrutura documentos Web por meio de tags semânticas (`<header>`, `<nav>`, `<main>`, `<search>`, `<section>`, `<article>`, `<fieldset>`, `<dialog>`, `<footer>`), interpretadas pelo navegador na construção do DOM e da árvore de acessibilidade.
- **CSS3 (*Cascading Style Sheets*, versão 3) e SCSS (*Sass*):** CSS define layout, tipografia, cores perceptuais (`oklch`), camadas de prioridade (`@layer`), consultas de contêiner (`@container`), propriedades animáveis (`@property`) e transformações 3D (`preserve-3d`). **SCSS** é o pré-processador usado em [`apps/web/src/styles/`](../../apps/web/src/styles/) para modularizar a folha de estilos em parciais `_*.scss` compilados em CSS padrão no build.
- **SQL (*Structured Query Language*) e PSL (*Prisma Schema Language*):** SQL é a linguagem declarativa de consulta, definição de esquema e controle transacional usada nos bancos relacionais (PostgreSQL) — presente nas migrações em [`apps/api/prisma/migrations/`](../../apps/api/prisma/migrations/) e em consultas atômicas como a CTE de [`outbox-event.repository.ts`](../../apps/api/src/modules/events/outbox-event.repository.ts#L29-L45). **PSL** é a sintaxe declarativa de modelagem usada em [`schema.prisma`](../../apps/api/prisma/schema.prisma).
- **Lua:** linguagem de script leve embutida no servidor Redis para executar blocos de múltiplos comandos (`INCR`, `PTTL`, `PEXPIRE`, `SET`) de forma atômica e indivisível na thread principal do Redis ([`redis.service.ts`](../../apps/api/src/infra/redis.service.ts#L10-L48)).
- **Node.js `22`:** ambiente de execução (*runtime*) JavaScript fora do navegador, baseado no motor V8 e em I/O assíncrono não bloqueante, responsável por executar a API NestJS, a compilação dos pacotes e os pipelines de teste.
- **Angular `22`:** framework front-end baseado em TypeScript utilizado em [`apps/web/`](../../apps/web/) para construir a aplicação Web de página única (*SPA*) com componentes autônomos (*Standalone*), primitivas reativas (*Signals*), detecção de mudanças *OnPush* / *Zoneless*, roteamento *lazy*, guardas de rota e interceptadores HTTP.
- **NestJS `11`:** framework back-end TypeScript para Node.js usado em [`apps/api/`](../../apps/api/). Organiza o servidor em módulos, controladores, provedores de injeção de dependência, *middlewares*, *guards*, *pipes* e filtros globais de exceção sobre o servidor HTTP **Express**.
- **Prisma ORM `6.19.3`:** biblioteca de mapeamento objeto-relacional (*Object-Relational Mapper*) que lê o `schema.prisma`, gera um cliente TypeScript tipado (`PrismaClient`), executa queries SQL parametrizadas contra *SQL Injection*, coordena transações `$transaction` e gerencia migrações de esquema.
- **Zod `v4`:** biblioteca de declaração de esquemas e validação de dados em tempo de execução (*runtime*). Confere formato, limites, expressões regulares e campos permitidos de payloads externos via `.parse()` / `.safeParse()` e gera automaticamente os tipos TypeScript correspondentes via `z.infer<>` e `z.input<>`. *(Usado em [`packages/shared/src/schemas/`](../../packages/shared/src/schemas/) e [`ZodValidationPipe`](../../apps/api/src/common/pipes/zod-validation.pipe.ts)).*
- **`tsup` e `esbuild` (*Bundlers*):** ferramentas que compilam TypeScript em JavaScript, resolvem módulos e removem código não referenciado (*tree-shaking*). O `tsup` compila `@pokeverse/shared` simultaneamente para ESM (`.mjs`) e CommonJS (`.js`), enquanto o `esbuild` (via `@angular/build:application`) empacota a SPA Angular.
- **Bibliotecas Especializadas da API e Web:** **`ioredis`** (cliente Redis com suporte a TLS e scripts Lua), **`kafkajs`** (produtor e consumidor Apache Kafka com suporte a mTLS), **`argon2`** (hashing de senhas com Argon2id), **`@simplewebauthn/server` e `@simplewebauthn/browser`** (registro e autenticação WebAuthn/Passkeys FIDO2), **`helmet`** (configuração automática de cabeçalhos de segurança HTTP), **`cookie-parser`** (análise de cookies HTTP), **`nodemailer`** (envio SMTP em desenvolvimento), **`qrcode`** (geração de QR Code TOTP em Data URL) e **`socket.io` / `socket.io-client`** (comunicação em tempo real via WebSockets).

---

## 2. Arquitetura de Software, Monorepo e Padrões de Projeto

- **Monorepo (*Monolithic Repository*) & `npm workspaces`:** organização em que múltiplas aplicações e pacotes compartilham o mesmo repositório Git (`apps/web`, `apps/api`, `packages/shared`). O `npm workspaces` (em [`package.json`](../../package.json)) conecta esses pacotes internamente sem publicação prévia em registro externo e sem depender da complexidade adicional do Turborepo. *(Ver [`docs/01`](../01-arquitetura-monorepo-e-padroes.md)).*
- **DRY (*Don't Repeat Yourself*) e Single Source of Truth:** princípio que proíbe duplicação de regras, constantes e contratos. No projeto, validações Zod, cálculo de busca e constantes de plataforma residem exclusivamente em `@pokeverse/shared`, enquanto metadados regionais residem em [`regions-atlas.data.ts`](../../apps/web/src/app/shared/data/regions-atlas.data.ts).
- **SOLID (Os 5 Princípios de Design):**
  - **S — SRP (*Single Responsibility Principle*):** cada classe, serviço ou componente possui um único eixo de responsabilidade (travado pelo ESLint em `300` linhas para serviços/stores e `200` para componentes Web; ex.: decomposição do `AuthService` em 5 serviços especializados).
  - **O — OCP (*Open/Closed Principle*):** comportamento extensível via registro declarativo sem modificar condicionais existentes (ex.: `EMAIL_TEMPLATE_RENDERERS` em [`mail.service.ts`](../../apps/api/src/modules/notifications/mail.service.ts#L35-L72) e `DIALOG_VALIDATORS` em [`auth-dialog-validator.util.ts`](../../apps/web/src/app/shared/hud/auth-dialog-validator.util.ts)).
  - **L — LSP (*Liskov Substitution Principle*):** implementações concretas de produção (Prisma, Redis, Resend) e substitutos de teste (*fakes* e mocks) devem preservar as mesmas pré-condições, pós-condições e contratos de erro.
  - **I — ISP (*Interface Segregation Principle*):** interfaces e repositórios segmentados por caso de uso para evitar dependências desnecessárias (ex.: os 5 repositórios especializados em `apps/api/src/modules/auth/`).
  - **D — DIP (*Dependency Inversion Principle*):** regras de domínio e stores dependem de abstrações, nunca diretamente de detalhes concretos de banco ou APIs imperativas de DOM (uso de diretivas `[pvRpgFocusable]` no Angular e repositórios dedicados na API).
- **Clean Architecture & SoC (*Separation of Concerns*):** divisão estrita de camadas onde Controllers cuidam apenas do transporte HTTP, Services implementam regras de negócio e Repositories isolam o acesso à persistência SQL/Prisma.
- **Shift-Left:** prática de antecipar a detecção de defeitos para as etapas iniciais do ciclo (verificação estática de tipos em compilação e validação de borda `ZodValidationPipe` na entrada da requisição) antes de atingir lógica interna ou banco de dados. *(Ver [`ARCHITECTURE.md`](../ARCHITECTURE.md)).*
- **Repository Pattern:** padrão de encapsulamento de consultas de dados (`PokedexSlotRepository`, `OutboxEventRepository` e os 5 repositórios do módulo `auth/`), isolando sintaxe SQL/Prisma do restante da aplicação.
- **Facade Pattern:** interface unificada que delega operações a subsistemas especializados (ex.: `AuthService` coordenando `CredentialsAuthService`, `TokenRefreshService`, `AccountRecoveryService`, `SessionManagementService` e `TrainerGdprService`).
- **Lookup Table / Strategy:** substituição de cadeias extensas de `if/else` ou `switch` por objetos ou mapas indexados por chave (ex.: `RARITY_PENALTY` em [`pokemon-lab.ts`](../../packages/shared/src/domain/pokemon-lab.ts#L310-L325)).
- **Guard Clauses & Early Return:** validação de pré-condições e cenários de erro no início da função com retorno ou lançamento imediato de exceção, evitando blocos condicionais profundamente aninhados.
- **Complexidade Ciclomática:** métrica que contabiliza o número de caminhos de decisão independentes (`if`, `&&`, `||`, `case`, `?:`) em uma função; o ESLint do repositório bloqueia valores acima de **`15`**.
- **AI Slop & Boilerplate:** *AI slop* designa código genérico, prolixo, com identificadores vagos (`dataHandler`, `temp`, `processItem`) ou abstrações superficiais; *boilerplate* refere-se a código repetitivo sem ganho semântico. Ambos são vetados pelo [`ARCHITECTURE.md`](../ARCHITECTURE.md).
- **Skeuomorfismo & Regra Zero de UI:** *skeuomorfismo* é a técnica de design digital que reproduz propriedades visuais e táteis de objetos físicos (textura metálica, plástico fosco, lentes de vidro e iluminação LED). A **Regra Zero de UI** em [`AGENTS.md`](../../AGENTS.md) proíbe simplificar ou substituir o visual canônico da Fase 0 sem validação explícita.

---

## 3. Tipagem Avançada, Estruturas de Dados e Algoritmos

- **`any` vs. `unknown` vs. `never`:** `any` desativa o verificador de tipos (proibido via `@typescript-eslint/no-explicit-any: 'error'`); `unknown` representa um valor de tipo desconhecido que exige validação (*Type Narrowing*) antes do uso; `never` representa um estado inalcançável (usado em `assertNever()` para checagem exaustiva de casos).
- **Type Narrowing:** processo pelo qual o compilador reduz um tipo amplo (`unknown` ou união) para um tipo concreto após uma guarda (`if (typeof x === 'string')` ou `schema.safeParse(x)`).
- **Discriminated Union (União Discriminada):** união de tipos de objeto identificados por uma propriedade literal discriminadora comum (ex.: `status` em `AsyncState<T>` e `authenticated` em `SessionBootstrapResponseSchema`), eliminando combinações contraditórias de flags booleanas.
- **Imutabilidade (`readonly` / `as const`):** modificadores que impedem mutação acidental de propriedades ou tuplas literais em tempo de compilação.
- **ESM (*ECMAScript Modules*) vs. CJS (*CommonJS*):** os dois formatos de módulos do ecossistema JavaScript — ESM usa `import`/`export` (usado no navegador e Angular); CJS usa `require()`/`module.exports` (usado no Node.js/NestJS/Jest).
- **Tree-Shaking (`"sideEffects": false` e `/* @__PURE__ */`):** otimização executada pelo bundler que elimina do bundle final módulos e funções nunca referenciados pela aplicação consumidora, reduzindo o tamanho transferido pela rede.
- **Regex (Expressão Regular):** linguagem concisa para correspondência e manipulação de padrões textuais, aplicada na remoção de diacríticos (`/[\u0300-\u036f]/g`), validação de identificadores (`/^[a-z0-9-]{1,64}$/`) e extração de IDs em URLs (`/\/(\d+)\/?$/`).
- **Unicode `NFD` e Diacríticos:** forma de normalização (*Normalization Form Canonical Decomposition*) que decompõe caracteres acentuados em caractere base + marca diacrítica combinante (`é` -> `e` + `\u0301`), permitindo comparações insensíveis a acentuação.
- **Programação Dinâmica & Distância de Damerau-Levenshtein:** técnica algorítmica que armazena subproblemas intermediários em uma matriz para calcular o número mínimo de operações (inserção, remoção, substituição e transposição de dois caracteres adjacentes) entre duas strings, combinada com saída antecipada (*early exit*) quando a diferença de tamanho excede o limite tolerado.
- **Estruturas de Dados do Projeto (`Array`, `Map`, `Set`, `Int32Array` + `stride`, `Record`):**
  - `Array<T>` / `readonly T[]`: coleção sequencial indexada numericamente (`0..N-1`), utilizada em percursos lineares completos de filtragem e ordenação ([`pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts#L138-L160)).
  - `Map<K, V>`: tabela hash chave-valor com leitura e escrita em $O(1)$ médio, usada para indexar itens por ID na filtragem avançada ([`pokeapi-endpoints.ts`](../../packages/shared/src/domain/pokeapi-endpoints.ts#L194-L204)), indexar os 10 slots ([`pokedex-slots.store.ts`](../../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts#L51-L139)), deduplicar requisições HTTP simultâneas ([`pokeapi-cache.service.ts`](../../apps/api/src/modules/pokedex/pokeapi-cache.service.ts#L32-L95)) e controlar cotas WebSocket por IP ([`world.gateway.ts`](../../apps/api/src/modules/world/world.gateway.ts#L51-L99)).
  - `Set<T>`: conjunto hash de elementos únicos com verificação `.has()` em $O(1)$ médio, usado em listas de métodos/origens CSRF ([`csrf-origin.guard.ts`](../../apps/api/src/common/guards/csrf-origin.guard.ts#L12-L50)), deduplicação de slots locais ([`pokedex-local-slots.storage.ts`](../../apps/web/src/app/features/pokedex-device/services/pokedex-local-slots.storage.ts#L46-L58)) e registro de chaves LGPD ([`privacy-consent.store.ts`](../../apps/web/src/app/core/stores/privacy-consent.store.ts#L22)).
  - `Int32Array` & `stride`: vetor tipado em bloco único contíguo de inteiros de 32 bits na RAM, no qual coordenadas bidimensionais `(i, j)` da matriz de Damerau-Levenshtein são endereçadas linearmente via `i * stride + j`, evitando fragmentação de memória no *heap* e pressão no *Garbage Collector* ([`pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts#L46-L105)).
  - `Record<K, V>`: objeto tipado de consulta direta por chave em tempo constante ([`pokemon-lab.ts`](../../packages/shared/src/domain/pokemon-lab.ts#L310-L325), [`mail.service.ts`](../../apps/api/src/modules/notifications/mail.service.ts#L35-L72)).
- **Notação Big-O ($O(1)$, $O(N)$, $O(N^2)$, $O(m \cdot n)$):** notação matemática assintótica que descreve como o custo computacional de um algoritmo escala em função do tamanho da entrada — $O(1)$ constante, $O(N)$ linear, $O(N^2)$ quadrático e $O(m \cdot n)$ proporcional ao produto dos comprimentos de duas strings.

---

## 4. Front-end Moderno, Cinemática 3D, Hardware e Acessibilidade

- **SPA (*Single-Page Application*):** modelo de aplicação Web em que o navegador carrega um documento HTML raiz e gerencia navegação entre rotas, estados e atualizações visuais dinamicamente em JavaScript sem recarregamentos completos de página.
- **Standalone Components:** arquitetura moderna do Angular em que cada componente declara suas importações diretamente no decorator `@Component({ imports: [...] })`, dispensando `NgModule`.
- **Signals (`signal()`, `computed()`, `effect()`):** primitivas reativas síncronas do Angular que rastreiam automaticamente dependências de leitura, recalculam valores derivados apenas quando necessário (`computed`) e executam efeitos colaterais controlados (`effect`).
- **Zoneless & `ChangeDetectionStrategy.OnPush`:** estratégia de renderização sem `Zone.js` em que a atualização do DOM ocorre exclusivamente quando um *Signal* monitorado ou evento de entrada do componente é alterado, reduzindo ciclos de verificação e consumo energético.
- **Lazy Loading (`loadComponent`, `import()`, `@defer`):** carregamento sob demanda de rotas ([`app.routes.ts`](../../apps/web/src/app/app.routes.ts)), bibliotecas pesadas (`socket.io-client`, `@simplewebauthn/browser`) ou blocos de template (`@defer`) somente quando acionados pelo usuário, mantendo o bundle inicial compacto.
- **Route Guard (`authGuard`) & HTTP Interceptor (`authInterceptor`):** o guard intercepta a navegação antes de ativar rotas protegidas ([`auth.guard.ts`](../../apps/web/src/app/core/guards/auth.guard.ts)); o interceptor modifica requisições HTTP de saída para incluir credenciais e tentar renovação automática de sessão em respostas `401` ([`auth.interceptor.ts`](../../apps/web/src/app/core/interceptors/auth.interceptor.ts)).
- **Diretiva Angular (`[pvRequiresTrainer]`, `[pvRpgFocusable]`, `[pvMainHeading]`):** classe associada a atributos em elementos HTML do template para encapsular comportamento reutilizável (controle de acesso visual, registro de foco RPG sem `querySelector` e foco acessível pós-navegação).
- **Injeção de Dependência (`inject()`):** padrão arquitetural em que o contêiner do framework instancia e fornece dependências compartilhadas (`HttpClient`, stores, serviços) aos componentes ou funções por meio de `inject(...)`, evitando acoplamento rígido e facilitando testes unitários.
- **Espaço de Cor `oklch(L C H)`:** modelo perceptual de cor baseado em **L**uminosidade, **C**roma (saturação) e **H**ue (matiz angular), que preserva luminosidade uniforme em gradientes metálicos sem faixas acinzentadas intermediárias.
- **CSS `@layer`, `@container` e `@property`:** `@layer` define ordem determinística de cascata entre camadas sem recorrer a `!important`; `@container` aplica regras responsivas baseadas nas dimensões do contêiner pai; `@property` registra custom properties tipadas (`--luz-x`, `--luz-y` como `<percentage>`) para permitir interpolação numérica animada.
- **`preserve-3d` & `backface-visibility: hidden`:** propriedades CSS que posicionam elementos filhos em espaço tridimensional (eixo Z) e ocultam a face posterior quando rotacionada além de `90°`, permitindo simular a tampa articulada dupla face da Pokédex sem texto espelhado.
- **Reflow, Repaint & GPU Compositing:** *Reflow* recalcula layout e geometria na CPU; *Repaint* redesenha pixels afetados; *GPU Compositing* anima `transform` e `opacity` diretamente na unidade gráfica em 60–120 FPS sem bloquear a thread principal.
- **Core Web Vitals (`LCP`, `CLS`, `INP`):** métricas padronizadas de desempenho percebido pelo usuário — **LCP** (*Largest Contentful Paint*, carregamento do maior elemento visível), **CLS** (*Cumulative Layout Shift*, estabilidade visual sem saltos de layout) e **INP** (*Interaction to Next Paint*, latência de resposta a interações).
- **`FpsWatchdog` & Perfis Adaptativos (`ULTRA` / `BALANCED` / `LITE`):** mecanismo em [`quality.store.ts`](../../apps/web/src/app/core/stores/quality.store.ts) que detecta capacidade de hardware (memória, núcleos de CPU, suporte a WebGL2, `saveData`, movimento reduzido) e queda real de FPS durante transições para reduzir efeitos pesados automaticamente.
- **WCAG 2.2 AA, WAI-ARIA, `<dialog>` e `inert`:** diretrizes internacionais de acessibilidade (**WCAG** — contraste `>= 4.5:1` em texto e `>= 3:1` em controles), atributos semânticos para tecnologias assistivas (**WAI-ARIA**), elemento nativo modal `<dialog>` e atributo `inert` (bloqueia foco, clique e leitura na face oculta da tampa 3D sem removê-la do fluxo de animação).
- **`BroadcastChannel`:** API nativa do navegador usada para sincronizar estado de sessão (`auth-cross-tab-sync.service.ts`) e preferências de consentimento (`privacy-consent.store.ts`) instantaneamente entre abas abertas na mesma origem.

---

## 5. Back-end, HTTP, APIs e Comunicação em Tempo Real

- **API REST (*Representational State Transfer*):** arquitetura de serviços Web baseada em recursos identificados por URLs (como `/api/v1/pokedex/slots/0`) e verbos HTTP padronizados (`GET` leitura, `POST` criação/ação, `PUT` gravação idempotente/substituição, `DELETE` remoção).
- **BFF (*Backend-for-Frontend*) & Proxy Same-Origin:** arquitetura em que o servidor back-end dedicado atua sob o mesmo domínio do front-end por meio de um proxy reverso de borda (`Cloudflare Pages Functions`), permitindo armazenar credenciais exclusivamente em cookies `HttpOnly` inacessíveis ao JavaScript do navegador e simplificando políticas de CORS e CSP.
- **Pipeline de Requisição NestJS (Middleware, Guard, Pipe, Controller, Service, Repository, Exception Filter):**
  - **Middleware (`CorrelationMiddleware`):** primeira camada a processar a requisição HTTP, responsável por anexar `x-correlation-id` e contexto W3C `traceparent`.
  - **Guard (`CsrfOriginGuard`, `ThrottlerGuard`, `SessionAuthGuard`):** validações executadas antes do manipulador da rota que autorizam ou bloqueiam a requisição conforme origem, taxa de chamadas e sessão autenticada.
  - **Pipe (`ZodValidationPipe`):** transforma e valida entradas (`@Param`, `@Query`, `@Body`) contra schemas Zod antes da camada de controle.
  - **Controller:** adaptador fino de transporte que recebe dados validados, invoca o Service e devolve a resposta e o código HTTP.
  - **Service:** camada onde residem as regras de negócio, invariantes de domínio e coordenação de cache ou eventos.
  - **Repository:** camada dedicada à comunicação isolada com o PostgreSQL via Prisma.
  - **Exception Filter (`GlobalExceptionFilter`):** intercepta exceções lançadas em qualquer ponto do pipeline, registra log estruturado com `traceId` e devolve resposta JSON segura sem expor stack traces internos.
- **Códigos de Status HTTP do Projeto:** `200 OK` (sucesso), `201 Created` (recurso criado), `204 No Content` (sucesso sem corpo de resposta), `400 Bad Request` (entrada ou JSON inválido), `401 Unauthorized` (sessão ausente ou expirada), `403 Forbidden` (falha de origem CSRF ou sessão pendente de MFA), `404 Not Found` (recurso inexistente), `409 Conflict` (violação de regra de unicidade — ex.: Pokémon já salvo em outro slot), `413 Payload Too Large` (corpo acima de `64kb`), `429 Too Many Requests` (limite de taxa atingido), `500 Internal Server Error` (falha inesperada), `502 Bad Gateway` e `503 Service Unavailable` (erro de comunicação do proxy ou dependência indisponível).
- **WebSocket (`Socket.IO`) & Handshake:** protocolo de canal bidirecional persistente sobre TCP iniciado por um *handshake* HTTP. Em [`world.gateway.ts`](../../apps/api/src/modules/world/world.gateway.ts), o *handshake* valida a origem em produção e aplica cotas por IP (`10`) e globais (`1000`) antes de enviar eventos recentes aos clientes.
- **Coalescência de Requisições (*Request Deduplication*):** técnica em [`pokeapi-cache.service.ts`](../../apps/api/src/modules/pokedex/pokeapi-cache.service.ts#L32-L95) que compartilha a mesma `Promise` em andamento via `Map` quando múltiplas requisições simultâneas pedem a mesma chave ausente no cache, evitando chamadas redundantes à API externa.
- **Circuit Breaker & Fallback (Modo Degradado):** padrão de resiliência que interrompe temporariamente chamadas a um serviço externo após falhas consecutivas (`CB_FAILURE_THRESHOLD = 3`, cooldown de `30s` em `PokeApiCacheService`), acionando cópias reserva em cache (`stale-fallback` de 7 dias no Redis) ou consulta direta pelo cliente Angular para leitura pública quando a API central está indisponível.

---

## 6. Banco de Dados Relacional e Armazenamento de Objetos

- **RDBMS (Sistema Gerenciador de Banco Relacional / PostgreSQL 16):** banco estruturado em tabelas tipadas ligadas por chaves estrangeiras e restrições de integridade verificadas pelo motor de armazenamento.
- **ORM (*Object-Relational Mapping* — Prisma 6.19):** camada que converte operações orientadas a objetos em código TypeScript para instruções SQL parametrizadas seguras contra *SQL Injection*.
- **Schema & Migration:** `schema.prisma` descreve o estado atual desejado das tabelas e índices; arquivos *migration* (`migration.sql`) versionam cada alteração estrutural aplicada ao banco em ordem cronológica segura.
- **ACID (*Atomicity, Consistency, Isolation, Durability*):** conjunto de propriedades transacionais que garante que todas as operações dentro de um bloco `$transaction` executem integralmente em conjunto ou sejam integralmente revertidas em caso de erro (como gravar `PokedexSlot` e `OutboxEvent` juntos em [`pokedex-slot.repository.ts`](../../apps/api/src/modules/pokedex/pokedex-slot.repository.ts#L60-L115)).
- **Primary Key (`UUID`) & Foreign Key (`onDelete: Cascade`):** `UUID` (*Universally Unique Identifier*) é uma chave primária de 128 bits resistente a enumeração sequencial; `onDelete: Cascade` assegura que, ao remover um registro `Trainer`, todas as sessões, tokens, passkeys e slots dependentes sejam removidos atomicamente pelo PostgreSQL.
- **Unique Constraint (`P2002`):** restrição física no banco garantindo que valores ou combinações (ex.: `email`, `username`, `[trainerId, slotIndex]`) não se repitam; `P2002` é o código de erro retornado pelo Prisma quando uma escrita viola essa restrição.
- **Problema N+1 & Projeção Estrita (`select`):** antipadrão em que uma consulta inicial retorna $N$ registros e um loop dispara $N$ novas consultas individuais para carregar relações. Mitigado usando inclusões/joins em uma única consulta, limites explícitos (`take`) e projeção estrita (`select`) apenas dos campos requeridos.
- **Índice Composto & Índice Parcial (`WHERE "status" = 'PENDING'`):** estruturas auxiliares em B-Tree que aceleram filtros e ordenações no PostgreSQL sem varredura sequencial completa da tabela. O índice parcial `idx_outbox_pending` indexa exclusivamente eventos pendentes, mantendo seu tamanho mínimo na memória.
- **CTE (*Common Table Expression* — `WITH claimed AS (...)`):** subconsulta nomeada temporária dentro de um comando SQL único, usada para selecionar, travar linhas pendentes e atualizar o campo de reserva (`processedAt`) em uma operação atômica única.
- **Connection Pooling (`DATABASE_URL` vs. `DATABASE_URL_UNPOOLED`):** no **Neon Postgres**, a URL *pooled* utiliza o multiplexador PgBouncer para reaproveitar conexões entre centenas de requisições simultâneas da API; já a URL *unpooled* estabelece conexão direta sem pooler intermediário, requisito necessário para locks DDL de `prisma migrate deploy` no CI/CD.
- **Object Storage S3 (`pgsty/silo`) & Presigned URLs:** serviço de armazenamento de arquivos binários compatível com a API Amazon S3, reservado para ROMs e *save states* futuros acessados diretamente pelo cliente via URLs temporárias assinadas criptograficamente, evitando tráfego de blobs pelo servidor API ou pelo PostgreSQL.

---

## 7. Cache Distribuído, Concorrência e Mensageria Assíncrona

- **Redis `7` (*In-Memory Data Store*):** banco chave-valor residente em memória RAM com latência sub-milissegundo, utilizado para sessões autenticadas, códigos OTP, contadores atômicos de taxa/bloqueio, travas de idempotência e cache da PokéAPI.
- **Cache `HIT`, `MISS` e `STALE` (`stale-fallback`):**
  - `HIT`: chave válida encontrada no Redis (`TTL` de 24h para respostas da PokéAPI).
  - `MISS`: chave ausente ou expirada; a API consulta o serviço externo, grava o cache principal (`24h`) e grava uma chave paralela `:stale` com validade de `7` dias (`604.800s`).
  - `STALE`: na falha da fonte externa ou abertura do *Circuit Breaker*, o servidor devolve a cópia `:stale` de até 7 dias para manter disponibilidade.
- **AOF (*Append-Only File*):** mecanismo de persistência no Redis local (`--appendonly yes` no Docker Compose) que registra operações de escrita em log de disco para recuperação após reinício do contêiner.
- **Rate Limiting / Throttling:** limitação controlada de requisições por IP ou chave em janelas de tempo configuradas (`@Throttle`, `RedisThrottlerStorage`) para conter ataques de força bruta e abuso automatizado de endpoints.
- **Race Condition (Condição de Corrida) & TOCTOU (*Time-of-Check to Time-of-Use*):** falha de concorrência em que dois fluxos paralelos leem um estado compartilhado antes de modificá-lo (ex.: dois processos leem `tentativas = 2` no Redis via `GET` e ambos escrevem `3` via `SET`, permitindo ultrapassar o limite máximo de 3 tentativas).
- **Atomicidade com Lua Script (`INCR` + `EXPIRE`) & `GETDEL`:** como o Redis processa comandos em thread única sequencial, executar `THROTTLE_LUA_SCRIPT` e `INCR_WITH_TTL_LUA_SCRIPT` via `EVAL` impede qualquer interferência entre incremento e definição de validade. De forma análoga, `GETDEL` lê e remove desafios de uso único (OAuth `state` e WebAuthn `challenge`) em comando indivisível.
- **Arquitetura Orientada a Eventos & Kafka / Redpanda:** modelo assíncrono em que serviços publicam fatos de domínio em tópicos de um barramento distribuído (*Broker*) consumidos de forma independente por grupos de consumidores (*Consumer Groups*). **Redpanda** é utilizado localmente em Docker por implementar o protocolo Kafka nativamente em C++ com baixo consumo de memória; em nuvem opera **Aiven Kafka**.
- **At-Least-Once Delivery & Dual-Write Problem:** sistemas distribuídos de mensageria garantem entrega *pelo menos uma vez* (*at-least-once*), podendo entregar mensagens repetidas após falhas ou rebalanceamentos; além disso, gravar no banco e publicar no broker como duas chamadas separadas (*Dual-Write*) pode deixar um atualizado e o outro perdido em quedas parciais.
- **Transactional Outbox + `FOR UPDATE SKIP LOCKED` + Atomic Lease:** solução para o problema *Dual-Write* em [`outbox-event.repository.ts`](../../apps/api/src/modules/events/outbox-event.repository.ts#L24-L46). Os eventos são persistidos na tabela `OutboxEvent` na mesma transação ACID da operação de negócio; o `OutboxRelayService` reivindica lotes atomicamente combinando `FOR UPDATE SKIP LOCKED` com `UPDATE "OutboxEvent" SET "processedAt" = NOW() ... RETURNING`, impedindo que réplicas paralelas processem as mesmas linhas e liberando o *lease* após 60 segundos caso um worker caia.
- **Idempotência (`SET NX` + Rollback no `catch`):** propriedade que garante resultado equivalente caso uma mensagem seja entregue mais de uma vez. Os consumidores Kafka registram uma trava temporária via `SET NX` no Redis; caso o efeito colateral (envio SMTP/Resend ou broadcast) lance exceção transiente, o bloco `catch` remove a trava via `releaseIdempotencyLock()` para permitir reprocessamento válido na tentativa seguinte.
- **Exponential Backoff & DLQ (*Dead Letter Queue*):** estratégia de aguardar intervalos crescentes entre retentativas em falhas temporárias e isolar mensagens que excederam o limite máximo de tentativas ou apresentaram erro estrutural no tópico morto `pokeverse.dlq.v1` sem travar a fila principal.

---

## 8. Segurança da Informação (AppSec), Identidade (IAM) e LGPD

- **OWASP Top 10:** catalogação de referência mundial dos dez riscos de segurança mais críticos em aplicações Web (quebra de controle de acesso, falhas criptográficas, injeção, falhas de configuração, entre outros).
- **Sessão Opaca BFF vs. JWT no `localStorage`:** tokens JWT armazenados em `localStorage` ficam expostos a scripts em ataques XSS e dificultam revogação imediata antes da expiração. A plataforma adota **Sessão Opaca** (identificador criptograficamente aleatório armazenado no Redis) trafegada apenas em cookie **`HttpOnly`** (inacessível a `document.cookie`), **`Secure`** (restrito a HTTPS) e **`SameSite`** (mitigação contra envio automático entre sites).
- **Máquina de Sessão (`MFA_PENDING` -> `AUTHENTICATED`) & Refresh Token Rotation:** contas com MFA ativo recebem sessão restrita `MFA_PENDING` após validação da senha, liberando acesso completo (`AUTHENTICATED`) apenas após verificação do segundo fator. Na renovação de sessão, o *Refresh Token* utilizado é invalidado e substituído por novo token na mesma família (`familyId`); qualquer tentativa de reuso de token já consumido revoga imediatamente toda a família de sessões no PostgreSQL e no Redis.
- **Argon2id & Dummy Hash (Mitigação de *Timing Attack*):** função de derivação de chave resistente à força bruta em GPU/ASIC usada para armazenar senhas. Durante tentativas de login para e-mails inexistentes, o servidor executa uma verificação simulada (*dummy hash*) de custo computacional equivalente para impedir que variações de tempo de resposta revelem quais e-mails estão cadastrados.
- **OTP (*One-Time Password*), MFA/2FA & TOTP (RFC 6238):** OTP é o código numérico temporário de 6 dígitos enviado por e-mail; **MFA** (*Multi-Factor Authentication*) exige múltiplos fatores independentes de prova de identidade; **TOTP** (*Time-based One-Time Password*) gera códigos temporários de 30 segundos em aplicativos autenticadores (acompanhados de 8 códigos de recuperação de uso único).
- **WebAuthn / Passkeys (FIDO2):** autenticação sem senha baseada em **criptografia assimétrica** vinculada ao domínio e validada por biometria ou PIN do dispositivo: a chave privada permanece no autenticador do usuário e o servidor armazena apenas a chave pública, enviando desafios únicos consumidos via `GETDEL`.
- **OAuth 2.0 com PKCE & OIDC (`id_token` / JWKS):** protocolo de delegação de autenticação com o Google. O **PKCE** (*Proof Key for Code Exchange*) protege a troca do código de autorização contra interceptação por meio de `code_verifier` e `code_challenge`; o servidor valida a assinatura criptográfica do `id_token` **OIDC** contra as chaves públicas **JWKS** do provedor e bloqueia vinculação silenciosa sobre contas locais pré-existentes (*Account Takeover*).
- **AES-256-GCM:** algoritmo de criptografia simétrica autenticada (*Authenticated Encryption with Associated Data*) utilizado por [`CryptoService`](../../apps/api/src/common/security/crypto.service.ts) para proteger segredos TOTP em repouso e dados pessoais contidos nos eventos `OutboxEvent`.
- **CSRF (*Cross-Site Request Forgery*) & `Sec-Fetch-Site`:** vetor de ataque em que um site externo induz o navegador autenticado da vítima a disparar requisições mutáveis indesejadas. Mitigado pelo `CsrfOriginGuard` checando `Origin`, `Referer`, `Sec-Fetch-Site` e bloqueando `Content-Type` de formulários HTML simples.
- **CORS, CSP e XSS:**
  - **CORS (*Cross-Origin Resource Sharing*):** controle de origens autorizadas a ler respostas da API (`CORS_ORIGINS`).
  - **CSP (*Content Security Policy*):** diretiva HTTP restritiva em [`apps/web/public/_headers`](../../apps/web/public/_headers) que define origens permitidas para scripts, estilos e conexões, bloqueando scripts inline arbitrários.
  - **XSS (*Cross-Site Scripting*):** execução indevida de JavaScript injetado na página, mitigada pela ausência de `innerHTML`, sanitização automática do Angular e política CSP estrita.
- **Mass Assignment:** vulnerabilidade em que propriedades extras injetadas no JSON de entrada sobrescrevem campos protegidos internos; neutralizada pelo modificador `.strict()` nos schemas Zod da borda.
- **Fail-Fast Env Validation:** validação de todas as variáveis de ambiente na partida em [`env.schema.ts`](../../apps/api/src/config/env.schema.ts), encerrando a inicialização imediatamente diante de configuração ausente ou inválida sem registrar segredos nos logs.
- **LGPD (Lei Geral de Proteção de Dados):** conformidade implementada por meio de banner e modal de consentimento versionado (`pokeverse_consent`), opt-in explícito para preferências não essenciais, endpoint de portabilidade em JSON (`GET /api/v1/auth/me/export`), exclusão definitiva em cascata (`DELETE /api/v1/auth/me`) e expurgo programado de tokens e eventos expirados.

---

## 9. Infraestrutura, Containers, Observabilidade, Testes e CI/CD

- **Docker, Multi-Stage Build & Non-Root User:** conteinerização que empacota runtime, código compilado e dependências de forma isolada e reprodutível. Em [`api.Dockerfile`](../../infra/docker/api.Dockerfile), o *Multi-Stage Build* compila `shared` e `api` em um estágio intermediário e copia apenas os artefatos de produção e `node_modules` enxutos para a imagem final `node:22-slim`, executando sob o usuário sem privilégios `USER node`.
- **Docker Compose:** definição declarativa em [`docker-compose.yml`](../../infra/docker/docker-compose.yml) que inicializa localmente PostgreSQL 16, Redis 7, Redpanda, Redpanda Console, S3 (`pgsty/silo`) e Mailpit com checagens de saúde configuradas (`npm run infra:up`).
- **Liveness Probe (`/health/live`) vs. Readiness Probe (`/health/ready`):** *Liveness* informa ao orquestrador se o processo HTTP está responsivo (ou deve ser reiniciado); *Readiness* verifica conectividade real com PostgreSQL, Redis, Kafka e S3 (quando ativo) antes de direcionar tráfego de produção à réplica.
- **Observabilidade (Logs Estruturados e Distributed Tracing):** emissão de eventos em JSON padronizado contendo `timestamp`, `level`, `trace_id`, contexto e redação automática de campos sensíveis (`StructuredLoggerService`), correlacionada ao cabeçalho `x-correlation-id` e ao padrão W3C `traceparent` do navegador até os consumidores Kafka.
- **Pirâmide de Testes (`118` verificações automatizadas pós-Onda 4):**
  - **Unitários (`104` testes):** executam regras isoladas e serviços em memória (`17` em Vitest para `@pokeverse/shared`, `56` em Jest para `apps/api` e `31` em Vitest + TestBed/`jsdom` para `apps/web`).
  - **E2E de Borda HTTP (`11` testes):** exercitam a aplicação NestJS real com **Supertest** ([`app.e2e-spec.ts`](../../apps/api/test/app.e2e-spec.ts)), verificando Helmet CSP, CSRF, limite `64kb` (`413`), JSON inválido (`400`), restrição `MFA_PENDING` e `ZodValidationPipe`.
  - **Integração Real (`3` testes):** executam contra contêineres reais de PostgreSQL 16, Redis 7 e Apache Kafka 3.9 no CI ([`app.integration-spec.ts`](../../apps/api/test/app.integration-spec.ts)).
- **Chrome Headless & CDP (*Chrome DevTools Protocol*):** automação em [`scripts/ui-quality-gate.mjs`](../../scripts/ui-quality-gate.mjs) que controla um navegador Chromium sem interface gráfica via WebSocket CDP para validar contraste WCAG 2.2 AA com composição alfa, ausência de overflow horizontal, recorte e tipografia em `1440×900` e `375×812`.
- **Ferramentas de Qualidade Estática e Segurança no CI/CD:** **ESLint 9** (regras de tipagem estrita, `max-lines` e `complexity <= 15`), **Prettier** (formatação determinística), **Gitleaks** (detecção de segredos em histórico e arquivos), **`npm audit`** (vulnerabilidades críticas em dependências de produção), **Trivy** (varredura de vulnerabilidades `CRITICAL` na imagem Docker) e **SonarQube Cloud** (análise contínua de qualidade e duplicação), orquestrados por **GitHub Actions** ([`ci.yml`](../../.github/workflows/ci.yml) e [`deploy.yml`](../../.github/workflows/deploy.yml)) para publicação contínua em **Cloudflare Pages** e **Azure Container Apps**.
- **TLS & mTLS (*Mutual TLS*):** protocolo criptográfico de transporte de rede (**TLS** sobre HTTPS e `rediss://`). No **mTLS** exigido pelo cluster **Aiven Kafka**, tanto o servidor quanto a aplicação cliente apresentam certificados digitais assinados para autenticação mútua antes da troca de mensagens.

---

<p align="center">
  <a href="02-linguagens-estruturas-de-dados-e-pacote-shared.md">Anterior: Vol. 02 (Linguagens, Estruturas &amp; Shared)</a>
  &nbsp;·&nbsp;
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
</p>
