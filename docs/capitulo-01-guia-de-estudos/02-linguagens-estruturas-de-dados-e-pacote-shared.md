<p align="center">
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="01-anatomia-do-repositorio-pastas-e-arquivos.md">Anterior: Vol. 01 (Pastas &amp; Arquivos)</a>
  &nbsp;·&nbsp;
  <a href="03-dicionario-completo-de-jargoes-e-glossario.md">Próximo: Vol. 03 (Glossário Técnico)</a>
</p>

# Volume 02 — Linguagens, Frameworks, Estruturas de Dados e Pacote `@pokeverse/shared`

> **Documentos originais consolidados:** [`01 — Arquitetura do Monorepo`](../01-arquitetura-monorepo-e-padroes.md), [`12 — Pokédex 2.0`](../12-pokedex-2-0-pokeapi-e-controles.md), [`15 — Pokédex Suprema e Laboratório Genético`](../15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md) e [`17 — Plano SOLID e Engenharia Big Tech`](../17-plano-solid-clean-code-e-engenharia-big-tech.md).
> **Arquivos-fonte analisados:** [`tsconfig.base.json`](../../tsconfig.base.json), [`packages/shared/`](../../packages/shared/) e implementações reais de estruturas de dados em [`apps/api/`](../../apps/api/) e [`apps/web/`](../../apps/web/).

---

## 1. Linguagens de Programação, Runtimes, Frameworks e Bibliotecas

### 1.1. Linguagens Utilizadas no Repositório

Cada camada do **PokéVerse OS** utiliza a linguagem mais adequada à natureza do problema que resolve:

1. **JavaScript (`ECMAScript / ES2022`):**
   - **O que é:** linguagem de programação padrão da Web, interpretada e compilada em tempo real (*Just-In-Time* — JIT) pelo motor V8 nos navegadores baseados em Chromium e no ambiente servidor Node.js.
   - **O que faz:** controla interatividade, manipulação da árvore DOM, requisições assíncronas (`fetch`, `Promise`, `async/await`) e execução de automações em linha de comando. Possui **tipagem dinâmica**, o que significa que o tipo de uma variável só é verificado enquanto o programa está em execução.
   - **Onde atua:** originalmente na versão estática da Fase 0 (`js/app.js`, já removida por desuso após migração), nos scripts de qualidade visual ([`scripts/ui-quality-gate.mjs`](../../scripts/ui-quality-gate.mjs)) e como formato final gerado pelo compilador para tudo o que roda em navegador e Node.js.

2. **TypeScript `6.0` (Modo `strict`):**
   - **O que é:** um *superset* (extensão sintática e semântica) estaticamente tipado do JavaScript. Todo código JavaScript válido pode ser lido pelo TypeScript, mas o TypeScript acrescenta anotações de tipos (`string`, `number`, `interface`, `type`, genéricos `<T>` e uniões discriminadas).
   - **O que faz e qual problema resolve:** o compilador (`tsc`) analisa o código **antes da execução** (em tempo de compilação), bloqueando incompatibilidades de contrato — como passar `undefined` para uma função que exige `string`, acessar propriedades inexistentes ou esquecer de tratar um estado de erro. Se um contrato em `@pokeverse/shared` muda, front-end e back-end falham na compilação imediatamente até serem alinhados.
   - **Limitação essencial (*Type Erasure*):** ao transpilar TypeScript para JavaScript executável, **todos os tipos e interfaces são apagados**. Portanto, o TypeScript protege o código interno escrito no repositório, mas não consegue validar dados externos recebidos em tempo de execução (corpos JSON de requisições HTTP, respostas da PokéAPI, parâmetros de URL ou dados salvos em `localStorage`). Essa fronteira é coberta pelo **Zod**.

3. **HTML5 e Templates Angular (`*.component.html`):**
   - **O que é:** *HyperText Markup Language*, linguagem de marcação declarativa que define a estrutura semântica e hierárquica de uma página Web. O navegador lê o HTML e constrói na memória RAM a árvore **DOM** (*Document Object Model*) e a árvore de acessibilidade (**WAI-ARIA**).
   - **O que os templates Angular acrescentam:** estendem o HTML5 nativo com sintaxe declarativa para vincular dados reativos da classe TypeScript à tela (`{{ expressao }}`), propriedades e atributos (`[disabled]`, `[attr.src]`), eventos do usuário (`(click)`), blocos condicionais/iterativos (`@if`, `@for`), carregamento tardio de blocos visuais (`@defer`) e sanitização automática contra injeção de código malicioso (**XSS**).

4. **CSS3 e SCSS (`Sass`):**
   - **O que é CSS3:** *Cascading Style Sheets*, linguagem de estilização que define layout (`Flexbox`, `Grid`), responsividade (`@media`, `@container`), hierarquia de prioridades sem `!important` (`@layer`), variáveis customizadas (`--token`), propriedades tipadas animáveis (`@property`), cores perceptuais no espaço `oklch` e transformações espaciais 3D aceleradas pela GPU (`perspective`, `preserve-3d`, `backface-visibility`).
   - **O que é SCSS:** pré-processador CSS usado no front-end (`apps/web/src/styles/`) para dividir o estilo extenso da Pokédex em arquivos parciais modulares e coesos (`_tokens.scss`, `_chassis-3d.scss`, `_search-scanner.scss`, `_controls-dpad.scss`, `_slots-grid.scss`, `_visor-lcd.scss`) importados por `@use`, compilando tudo em CSS padrão no build de produção.

5. **SQL (`PostgreSQL`) e Prisma Schema Language (`PSL`):**
   - **O que é SQL:** *Structured Query Language*, linguagem declarativa padrão de bancos de dados relacionais para definir tabelas, chaves primárias/estrangeiras, índices e executar leituras ou gravações transacionais com garantias **ACID**.
   - **Onde aparece diretamente:** nas migrações versionadas em [`apps/api/prisma/migrations/`](../../apps/api/prisma/migrations/), na criação de índice parcial (`idx_outbox_pending`) e na consulta atômica com *Common Table Expression* (`WITH claimed AS (...)` + `FOR UPDATE SKIP LOCKED` + `UPDATE ... RETURNING`) em [`outbox-event.repository.ts`](../../apps/api/src/modules/events/outbox-event.repository.ts#L29-L45).
   - **O que é PSL:** linguagem declarativa do arquivo [`schema.prisma`](../../apps/api/prisma/schema.prisma) que descreve os `13` modelos e `4` enums do banco em formato único, a partir do qual o Prisma gera tanto os arquivos `.sql` de migração quanto o cliente TypeScript tipado.

6. **Lua (Scripts Atômicos no Redis):**
   - **O que é:** linguagem de programação leve e embutível em motores escritos em C.
   - **Por que é usada no projeto:** o servidor de cache em memória **Redis** executa um único comando por vez em sua thread principal. Enviar scripts **Lua** (`THROTTLE_LUA_SCRIPT` e `INCR_WITH_TTL_LUA_SCRIPT` em [`apps/api/src/infra/redis.service.ts`](../../apps/api/src/infra/redis.service.ts#L10-L48)) faz com que múltiplas operações (`INCR`, `PTTL`, `PEXPIRE`, `SET`) rodem como um bloco indivisível no servidor Redis, eliminando condições de corrida (**TOCTOU**) entre instâncias paralelas da API.

---

### 1.2. Runtimes, Frameworks e Bibliotecas Principais

1. **Node.js `22` e `npm workspaces`:**
   - **Node.js:** ambiente de execução (*runtime*) que permite rodar JavaScript e código TypeScript compilado diretamente no servidor, fora do navegador, utilizando o motor V8 e um loop de eventos assíncrono não bloqueante voltado a I/O de rede e disco.
   - **`npm workspaces`:** recurso nativo do gerenciador de pacotes `npm` declarado no [`package.json`](../../package.json#L5-L8) raiz (`"workspaces": ["packages/*", "apps/*"]`). Ele cria vínculos simbólicos entre as pastas internas do monorepo para que `pokeverse-api` e `pokeverse-web` importem `@pokeverse/shared` diretamente do código local, mantendo scripts unificados de build, tipagem, lint e testes.

2. **Zod `v4` (`zod`):**
   - **O que é:** biblioteca de declaração de esquemas estruturais (*schemas*) e validação de dados em tempo de execução (*runtime*), projetada com integração nativa ao TypeScript.
   - **Por que existe:** como os tipos TypeScript deixam de existir quando o código vira JavaScript em produção, qualquer dado externo que atravessa a fronteira da aplicação (corpo HTTP, parâmetro de rota, query string, cookie, `localStorage`, resposta de API externa ou variável de ambiente) chega como valor desconhecido (`unknown`). Sem validação em tempo de execução, valores inesperados causariam falhas silenciosas, erros `500` ou vulnerabilidades de segurança (como *Mass Assignment*).
   - **O que faz na prática em 4 etapas:**
     1. **Modela o formato e as regras de negócio:** define tipo, faixa numérica, tamanho de string, expressão regular e proibição de campos extras não declarados (`.strict()`).
     2. **Normaliza e transforma na entrada:** remove espaços nas pontas (`.trim()`), padroniza minúsculas (`.toLowerCase()`), converte strings numéricas da URL via `.transform()`/`.pipe()` e valida regras cruzadas via `.refine()`.
     3. **Executa a validação em runtime (`.parse()` / `.safeParse()`):** no back-end, o [`ZodValidationPipe`](../../apps/api/src/common/pipes/zod-validation.pipe.ts#L4-L20) executa `.safeParse(value)` antes de a requisição entrar no Controller e devolve `400 Bad Request` caso haja qualquer violação; no front-end e nas fórmulas de domínio, `.safeParse()` / `.parse()` validam respostas da API, `localStorage` e parâmetros numéricos.
     4. **Infere os tipos TypeScript automaticamente:** `z.infer<typeof Schema>` extrai o tipo exato já validado e normalizado; `z.input<typeof Schema>` extrai o tipo de entrada antes da aplicação de valores padrão (`.default()`), evitando ter de manter duas definições paralelas (um schema Zod e uma `interface` escrita à mão).

   Exemplo real em [`packages/shared/src/schemas/pokedex.schemas.ts`](../../packages/shared/src/schemas/pokedex.schemas.ts#L92-L102):

   ```typescript
   export const SavePokedexSlotSchema = z
     .object({
       slotIndex: z.number().int().min(0).max(MAX_POKEDEX_SLOT_INDEX),
       pokemonId: z.number().int().positive(),
       pokemonName: z.string().trim().min(1).max(64),
       nickname: z.string().trim().min(1).max(40).nullable().optional(),
       spriteUrl: z.url().max(512).nullable().optional(),
     })
     .strict();

   export type SavePokedexSlotInput = z.infer<typeof SavePokedexSlotSchema>;
   ```

3. **Angular `22` (Standalone, Signals e Zoneless):**
   - **O que é:** framework front-end mantido pelo Google para construir **SPAs** (*Single-Page Applications*) — aplicações Web que carregam um documento HTML base e atualizam telas e rotas dinamicamente no cliente sem recarregar a página inteira a cada navegação.
   - **Conceitos estruturais adotados no repositório (`apps/web/`):**
     - **Standalone Components:** componentes independentes (`@Component({ imports: [...] })`) que declaram diretamente os componentes, diretivas e pipes que utilizam, eliminando os antigos módulos intermediários (`NgModule`).
     - **Signals (`signal`, `computed`, `effect`):** primitivas de estado reativo em que cada célula de dado notifica exatamente os pontos do template ou cálculos derivados que dependem dela.
     - **Detecção de Mudanças `OnPush` / Zoneless:** a aplicação opera sem `Zone.js` (removido das dependências em [`apps/web/package.json`](../../apps/web/package.json)) e com `ChangeDetectionStrategy.OnPush`, evitando varreduras globais na árvore de componentes a cada evento do navegador.
     - **Injeção de Dependência (`inject()`):** serviços e stores (`AuthStore`, `PokedexSlotsStore`, `HttpClient`) são fornecidos pelo contêiner do framework via `inject(...)`, facilitando substituição por fakes em testes unitários.
     - **Diretivas, Route Guards e HTTP Interceptors:** diretivas acoplam comportamentos declarativos a tags HTML (como [`[pvRpgFocusable]`](../../apps/web/src/app/features/pokedex-device/directives/rpg-focusable.directive.ts)); guards como [`authGuard`](../../apps/web/src/app/core/guards/auth.guard.ts) bloqueiam rotas protegidas antes da ativação; interceptors como [`authInterceptor`](../../apps/web/src/app/core/interceptors/auth.interceptor.ts) anexam `withCredentials: true` e renovam sessões expiradas (`401`) de forma transparente.

4. **NestJS `11` (Arquitetura Modular e Pipeline HTTP):**
   - **O que é:** framework back-end para Node.js orientado a módulos, classes decoradas e Injeção de Dependência, executado no projeto sobre o adaptador HTTP **Express**.
   - **Como organiza o processamento de cada requisição (`apps/api/`):**
     1. **Middleware** (`CorrelationMiddleware`): lê ou gera identificadores de rastreio (`x-correlation-id` e cabeçalho W3C `traceparent`).
     2. **Guards** (`CsrfOriginGuard`, `ThrottlerGuard`, `SessionAuthGuard`): aplicam verificação de origem/CSRF, limitação de taxa distribuída no Redis e validação da sessão opaca no Redis antes da execução da rota.
     3. **Pipes** (`ZodValidationPipe`): validam e convertem `@Param`, `@Query` e `@Body` contra os contratos de `@pokeverse/shared`.
     4. **Controllers** (ex.: `PokedexController`, `AuthController`): recebem entradas já validadas, delegam aos services e definem status HTTP e cabeçalhos.
     5. **Services** (ex.: `PokedexSlotsService`, `PokeApiCacheService`): aplicam regras de negócio, coordenam cache e fluxos de domínio.
     6. **Repositories** (ex.: `PokedexSlotRepository`, `OutboxEventRepository`): encapsulam todas as queries SQL/Prisma e transações ACID.
     7. **Exception Filters** (`GlobalExceptionFilter`): interceptam exceções (incluindo JSON malformado `400` e payload acima de `64kb` `413`), registram log estruturado com `traceId` e devolvem erro sanitizado ao cliente.

5. **Prisma ORM `6.19.3`:**
   - **O que é:** *Object-Relational Mapper* que traduz operações tipadas em TypeScript para comandos SQL parametrizados no PostgreSQL.
   - **O que faz no projeto:** garante segurança contra *SQL Injection* em consultas construídas via API fluente (`findMany`, `upsert`, `updateMany`), executa transações atômicas (`$transaction`), aplica projeções estritas de colunas (`select`) e controla a evolução do esquema relacional por migrações SQL versionadas.

6. **Empacotadores (`tsup` / `esbuild`) e Executores de Testes (`Vitest`, `Jest`, `Supertest`):**
   - **`tsup` e `esbuild`:** ferramentas de *build* (*bundlers*) que transpilam arquivos TypeScript em JavaScript otimizado, resolvem dependências internas, aplicam *tree-shaking* (remoção de código morto não referenciado) e geram arquivos de definição de tipos (`.d.ts` / `.d.mts`).
   - **`Vitest` e `Jest` + `Supertest`:** frameworks de execução de testes automatizados. O `Vitest` testa o pacote `@pokeverse/shared` e os componentes/stores Angular (em ambiente DOM simulado via `jsdom`); o `Jest` testa os serviços/repositórios da API e, combinado com o `Supertest`, executa requisições HTTP reais contra a aplicação NestJS em testes E2E de borda e testes de integração contra PostgreSQL, Redis e Kafka reais.

---

## 2. Estruturas de Dados, Complexidade Assintótica (`Big-O`) e Exemplos Reais no Repositório

Uma **Estrutura de Dados** define o modelo de organização de valores na memória RAM para otimizar o custo de operações específicas (leitura sequencial, busca por chave, verificação de unicidade ou cálculo matricial).

A **Notação Big-O** expressa o crescimento assintótico do tempo de execução ou da memória consumida à medida que o volume de entrada $N$ aumenta:

| Estrutura / Técnica | Complexidade de Busca | Custo para $N = 1.351$ Pokémon | Onde é Utilizada no Repositório |
| :--- | :---: | :---: | :--- |
| **Lista Sequencial (`Array<T>` / `readonly T[]`)** | $O(N)$ linear | Até $1.351$ iterações | Varredura e pontuação do catálogo em [`pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts#L138-L300) |
| **Buscas Lineares Aninhadas (`Array.find` dentro de loop)** | $O(N^2)$ quadrática | Até $1.351^2 \approx 1,82 \times 10^6$ operações | **Antipadrão evitado** por indexação prévia em `Map` |
| **Tabela Hash (`Map<K, V>` / `ReadonlyMap<K, V>`)** | $O(1)$ constante (média) | $1$ consulta direta por chave | [`pokeapi-endpoints.ts`](../../packages/shared/src/domain/pokeapi-endpoints.ts#L194-L204), [`pokedex-slots.store.ts`](../../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts#L51-L139), [`pokeapi-cache.service.ts`](../../apps/api/src/modules/pokedex/pokeapi-cache.service.ts#L32-L95), [`world.gateway.ts`](../../apps/api/src/modules/world/world.gateway.ts#L51-L99) |
| **Conjunto Hash (`Set<T>` / `ReadonlySet<T>`)** | $O(1)$ constante (média) | $1$ verificação `.has()` | [`csrf-origin.guard.ts`](../../apps/api/src/common/guards/csrf-origin.guard.ts#L12-L50), [`pokedex-local-slots.storage.ts`](../../apps/web/src/app/features/pokedex-device/services/pokedex-local-slots.storage.ts#L46-L58), [`privacy-consent.store.ts`](../../apps/web/src/app/core/stores/privacy-consent.store.ts#L22) |
| **Vetor Tipado Contíguo (`Int32Array` + `stride`)** | $O(m \cdot n)$ por par | $\approx 100$ acessos contíguos por palavra | Matriz linearizada 2D->1D de Damerau-Levenshtein em [`pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts#L46-L105) |
| **Tabela de Consulta (`Record<K, V>`)** | $O(1)$ constante | $1$ acesso direto por propriedade | [`pokemon-lab.ts`](../../packages/shared/src/domain/pokemon-lab.ts#L310-L325) e [`mail.service.ts`](../../apps/api/src/modules/notifications/mail.service.ts#L35-L72) |

### 2.1. Lista Sequencial (`readonly T[]`) — Percurso Linear $O(N)$

Um `Array` armazena elementos em ordem sequencial. Quando uma operação precisa inspecionar todos os elementos (como pontuar e filtrar todo o catálogo de espécies contra o termo digitado), a complexidade linear $O(N)$ é o limite teórico ótimo, pois cada item precisa ser avaliado ao menos uma vez.

Trecho real em [`packages/shared/src/domain/pokedex-search.ts#L138-L160`](../../packages/shared/src/domain/pokedex-search.ts#L138-L160):

```typescript
function filterByNumericId(
  catalog: readonly SearchablePokemonItem[],
  numericQuery: string,
  maxResults: number,
): CatalogFilterResult {
  const exactId = Number(numericQuery);
  const idText = String(exactId);
  const matches: CatalogMatchItem[] = [];

  for (const pokemon of catalog) {
    const strId = String(pokemon.id);
    if (pokemon.id === exactId) {
      matches.push({ ...pokemon, score: 0, approximate: false });
    } else if (strId.startsWith(idText)) {
      matches.push({ ...pokemon, score: 100 + pokemon.id, approximate: false });
    } else if (strId.includes(idText)) {
      matches.push({ ...pokemon, score: 200 + pokemon.id, approximate: false });
    }
  }

  matches.sort((a, b) => a.score - b.score || a.id - b.id);
  return { mode: 'exact', items: matches.slice(0, maxResults) };
}
```

### 2.2. Tabela Hash (`Map<K, V>` e `ReadonlyMap<K, V>`) — Acesso em Tempo Constante $O(1)$

Um `Map` implementa um dicionário chave-valor baseado em tabela hash, permitindo inserir (`.set`) e recuperar (`.get`) um registro diretamente pela chave em tempo médio $O(1)$, independentemente do tamanho da coleção.

#### Caso 1: Prevenção de Complexidade Quadrática $O(N^2)$ na Filtragem Avançada

Em [`packages/shared/src/domain/pokeapi-endpoints.ts#L189-L208`](../../packages/shared/src/domain/pokeapi-endpoints.ts#L189-L208), a função `filterCatalogWithAdvancedQuery` precisa executar a busca textual (`filterPokemonCatalog`, que retorna itens base `CatalogMatchItem`) e depois recuperar os objetos enriquecidos originais do tipo genérico `T` (com `types`, `generation`, `habitat`, `baseStatTotal`). Se usasse `catalog.find((entry) => entry.id === match.id)` dentro do `.map()`, cada um dos até $N = 1.351$ resultados percorreria novamente até $1.351$ itens ($1.351 \times 1.351 \approx 1,82$ milhão de comparações, complexidade $O(N^2)$).

Ao construir o índice `byId` antes do mapeamento, o custo cai para $O(N)$ para indexar + $O(1)$ por lookup:

```typescript
export function filterCatalogWithAdvancedQuery<T extends EnrichedCatalogItem>(
  catalog: readonly T[],
  rawQuery: PokedexAdvancedQuery,
): readonly T[] {
  const parsed = PokedexAdvancedQuerySchema.parse(rawQuery);
  const byId = new Map<number, T>();
  for (const entry of catalog) {
    byId.set(entry.id, entry);
  }

  let pool: readonly T[];
  if (parsed.term.trim()) {
    const fuzzy = filterPokemonCatalog(catalog, parsed.term, catalog.length);
    pool = fuzzy.items
      .map((match) => byId.get(match.id))
      .filter((entry): entry is T => entry !== undefined);
  } else {
    pool = catalog;
  }
```

#### Caso 2: Indexação de Slots, Coalescência de Requisições e Controle de Conexões WebSocket

O mesmo padrão aparece nos serviços reativos do front-end e no back-end:

- **Indexação dos 10 slots da Pokédex por `slotIndex` (`0..9`):** em [`pokedex-slots.store.ts#L51-L141`](../../apps/web/src/app/features/pokedex-device/services/pokedex-slots.store.ts#L51-L141), os registros vindos da API em array são convertidos para `Map<number, PokedexSlotRecord>` (`next.set(item.slotIndex, item)`) dentro de um Angular `signal`, permitindo que os 10 botões da interface consultem seu estado por índice diretamente via `.get(slotIndex)` sem varrer listas a cada renderização.
- **Coalescência de requisições simultâneas (*Request Deduplication*):** em [`pokeapi-cache.service.ts#L32-L95`](../../apps/api/src/modules/pokedex/pokeapi-cache.service.ts#L32-L95), quando múltiplos clientes requisitam o mesmo Pokémon simultaneamente em um *cache miss* do Redis, o `Map` `inflightPokemon` compartilha a mesma `Promise` em andamento e evita disparar chamadas duplicadas à PokéAPI:

```typescript
private readonly inflightPokemon = new Map<
  string,
  Promise<CachedPokemonResponse>
>();
// ...
const existingInflight = this.inflightPokemon.get(cacheKey);
if (existingInflight) {
  return existingInflight;
}
```

- **Contagem de conexões WebSocket por endereço IP:** em [`world.gateway.ts#L51-L99`](../../apps/api/src/modules/world/world.gateway.ts#L51-L99), `activeConnectionsByIp = new Map<string, number>()` e `socketIpMap = new Map<string, string>()` permitem validar o limite de `10` conexões por IP e atualizar o contador na desconexão em tempo $O(1)$.

### 2.3. Conjunto Hash (`Set<T>` e `ReadonlySet<T>`) — Pertinência e Unicidade em $O(1)$

Um `Set` armazena apenas valores distintos e responde se um elemento pertence ao conjunto via `.has(valor)` em tempo constante médio $O(1)$, além de impedir duplicidades automaticamente na inserção.

- **Validação de segurança na borda HTTP:** em [`csrf-origin.guard.ts#L12-L50`](../../apps/api/src/common/guards/csrf-origin.guard.ts#L12-L50), todas as requisições passam pela verificação de método seguro (`SAFE_METHODS.has(req.method.toUpperCase())`), tipo de conteúdo proibido (`UNSAFE_FORM_CONTENT_TYPES.has(mediaType)`) e lista de origens confiáveis (`this.allowedOrigins.has(originHeader)`):

```typescript
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UNSAFE_FORM_CONTENT_TYPES = new Set([
  'text/plain',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
]);
```

- **Garantia de unicidade de Pokémon nos slots locais:** em [`pokedex-local-slots.storage.ts#L46-L58`](../../apps/web/src/app/features/pokedex-device/services/pokedex-local-slots.storage.ts#L46-L58), ao desserializar registros do `localStorage`, dois conjuntos (`seenIds` e `seenNames`) descartam eventuais duplicatas adulteradas manualmente em $O(1)$ por item:

```typescript
const seenIds = new Set<number>();
const seenNames = new Set<string>();
for (const [idx, item] of parsed.entries()) {
  if (idx >= TOTAL_POKEDEX_SLOTS) {
    continue;
  }
  const entry = this.parseLocalSlotEntry(idx, item);
  if (!entry || seenIds.has(entry.pokemonId) || seenNames.has(entry.pokemonName)) {
    continue;
  }
  seenIds.add(entry.pokemonId);
  seenNames.add(entry.pokemonName);
  slots.set(idx, entry);
}
```

- **Registro dinâmico de chaves LGPD no navegador:** em [`privacy-consent.store.ts#L22-L47`](../../apps/web/src/app/core/stores/privacy-consent.store.ts#L22-L47), `nonEssentialStorageKeys = new Set<string>(INITIAL_NON_ESSENTIAL_STORAGE_KEYS)` mantém sem repetição o conjunto de chaves do `localStorage` que devem ser limpas quando o consentimento funcional é revogado.

### 2.4. Vetor Tipado Contíguo (`Int32Array`) com Linearização 1D (`stride`)

Em JavaScript, uma matriz bidimensional clássica `number[][]` não ocupa um bloco único de memória: ela exige alocar um array externo e $m + 1$ sub-arrays independentes no *heap* do motor V8, além de armazenar referências dinâmicas. Quando executada milhares de vezes durante a digitação em uma busca sobre $1.351$ nomes, essa fragmentação aumenta *cache misses* da CPU e gera trabalho desnecessário para o coletor de lixo (*Garbage Collector* — GC).

Um **`Int32Array`** é um `TypedArray` nativo que aloca um **único bloco linear e contíguo** de memória binária contendo exclusivamente inteiros de 32 bits com sinal (4 bytes por célula), inicializados com `0`. Para representar uma grade lógica de $(m + 1)$ linhas por $(n + 1)$ colunas, define-se o passo de linha `stride = n + 1`, mapeando cada coordenada `(i, j)` para o índice linear `i * stride + j`.

Trecho real em [`packages/shared/src/domain/pokedex-search.ts#L46-L105`](../../packages/shared/src/domain/pokedex-search.ts#L46-L105):

```typescript
function computeDamerauCell(
  dp: Int32Array,
  stride: number,
  source: string,
  target: string,
  i: number,
  j: number,
  maxDistance: number,
): number {
  const srcChar = source.charAt(i - 1);
  const tgtChar = target.charAt(j - 1);
  const cost = srcChar === tgtChar ? 0 : 1;

  const up = (dp[(i - 1) * stride + j] ?? maxDistance) + 1;
  const left = (dp[i * stride + (j - 1)] ?? maxDistance) + 1;
  const diag = (dp[(i - 1) * stride + (j - 1)] ?? maxDistance) + cost;

  let best = Math.min(up, left, diag);

  const canTranspose =
    i > 1 && j > 1 && srcChar === target.charAt(j - 2) && source.charAt(i - 2) === tgtChar;

  if (canTranspose) {
    const transposition = (dp[(i - 2) * stride + (j - 2)] ?? maxDistance) + cost;
    best = Math.min(best, transposition);
  }

  return best;
}

export function computeDamerauDistance(
  source: string,
  target: string,
  maxDistance: number,
): number {
  const m = source.length;
  const n = target.length;

  if (Math.abs(m - n) > maxDistance) {
    return maxDistance + 1;
  }

  const stride = n + 1;
  const dp = new Int32Array((m + 1) * stride);

  for (let i = 0; i <= m; i += 1) {
    dp[i * stride] = i;
  }
  for (let j = 0; j <= n; j += 1) {
    dp[j] = j;
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i * stride + j] = computeDamerauCell(dp, stride, source, target, i, j, maxDistance);
    }
  }

  return dp[m * stride + n] ?? maxDistance + 1;
}
```

### 2.5. Tabelas de Consulta Estáticas (`Record<K, V>`) — Despacho Direto $O(1)$

Para mapeamentos fixos conhecidos em tempo de compilação (em aplicação direta do Princípio Aberto/Fechado — OCP do SOLID e redução de complexidade ciclomática), o projeto substitui cadeias de `if/else` e `switch` por objetos indexados tipados com `Record<K, V>`.

Trecho real em [`packages/shared/src/domain/pokemon-lab.ts#L310-L325`](../../packages/shared/src/domain/pokemon-lab.ts#L310-L325):

```typescript
const RARITY_PENALTY: Record<'standard' | 'pseudo-legendary' | 'legendary' | 'mythical', number> = {
  standard: 0,
  'pseudo-legendary': 16,
  legendary: 34,
  mythical: 42,
};

const RARITY_COST_MULTIPLIER: Record<
  'standard' | 'pseudo-legendary' | 'legendary' | 'mythical',
  number
> = {
  standard: 1,
  'pseudo-legendary': 1.8,
  legendary: 3.2,
  mythical: 4,
};
```

O mesmo padrão rege `EMAIL_TEMPLATE_RENDERERS` em [`mail.service.ts#L35-L72`](../../apps/api/src/modules/notifications/mail.service.ts#L35-L72), garantindo em compilação que todo valor possível da chave esteja coberto.

---

## 3. Configuração de Rigor Estático (`tsconfig.base.json`) e Empacotamento Dual (`tsup`)

### 3.1. Opções de [`tsconfig.base.json`](../../tsconfig.base.json)

Os três workspaces (`packages/shared`, `apps/api` e `apps/web`) herdam o mesmo arquivo de configuração base do TypeScript:

| Opção no `tsconfig.base.json` | Comportamento no Compilador | Classe de Falha Evitada |
| :--- | :--- | :--- |
| `"strict": true` | Habilita o conjunto padrão de verificações estritas de tipo. | Coerções silenciosas e falhas básicas de tipagem. |
| `"noImplicitAny": true` | Impede inferência implícita do tipo permissivo `any` (também bloqueado explicitamente pelo ESLint via `@typescript-eslint/no-explicit-any: 'error'`). | Desativação acidental da checagem de tipos em parâmetros e retornos. |
| `"strictNullChecks": true` | Distingue `T` de `T \| null \| undefined`, exigindo verificação explícita antes do uso. | Exceções de leitura em referências nulas ou indefinidas em runtime. |
| `"strictFunctionTypes": true` & `"strictBindCallApply": true` | Verifica contravariância nos parâmetros de funções/callbacks e assinatura exata em `.bind()`, `.call()` e `.apply()`. | Passagem de callbacks incompatíveis para manipuladores assíncronos ou eventos. |
| `"noImplicitOverride": true` | Exige a palavra-chave `override` ao reescrever método herdado. | Métodos órfãos após renomeação na classe base. |
| `"noImplicitReturns": true` | Exige retorno explícito ou lançamento de erro em todos os ramos condicionais da função. | Retorno acidental de `undefined` em caminhos não cobertos. |
| `"noFallthroughCasesInSwitch": true` | Exige `break` ou `return` em todo bloco `case` não vazio. | Execução involuntária de dois casos consecutivos em um `switch`. |
| `"noUncheckedIndexedAccess": true` | Faz leituras indexadas (`arr[i]`, `record[k]`, `dp[pos]`) retornarem `T \| undefined`. | Leituras fora dos limites da coleção sem fallback explícito (como `dp[...] ?? maxDistance` em `pokedex-search.ts`). |
| `"forceConsistentCasingInFileNames": true` | Impõe correspondência exata entre maiúsculas e minúsculas nos caminhos de `import`. | Código que compila no Windows (sistema de arquivos *case-insensitive*) e quebra no Linux (Docker e CI). |
| `"esModuleInterop": true`, `"skipLibCheck": true`, `"isolatedModules": true` | Compatibiliza importação de módulos CJS em ESM, ignora checagem redundante de `.d.ts` em `node_modules` e garante transpilação independente arquivo a arquivo. | Incompatibilidades com compiladores baseados em AST isolada (`esbuild` / `tsup`). |

### 3.2. Empacotamento Dual (ESM + CJS) e Tree-Shaking (`tsup.config.ts`)

O pacote `@pokeverse/shared` precisa ser importado simultaneamente por dois ambientes com sistemas de módulos distintos:

- **Front-end Angular (`apps/web`):** empacotado com `esbuild`, consome **ESM** (*ECMAScript Modules* via `import` em `./dist/index.mjs` e `./dist/index.d.mts`).
- **Back-end NestJS + Jest (`apps/api`):** executado em Node.js configurado com **CommonJS** (via `require()` em `./dist/index.js` e `./dist/index.d.ts`).

O arquivo [`packages/shared/tsup.config.ts`](../../packages/shared/tsup.config.ts) compila os dois formatos em uma única etapa (`format: ['esm', 'cjs']`, `dts: true`, `sourcemap: true`, `target: 'es2022'`).

Além disso, conforme documentado em [doc 15](../15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md#L15-L17), duas configurações reduziram o bundle inicial do Angular de `814.44 kB` para `490.00 kB` na Fase 4A (`498.50 kB` raw / `128.16 kB` transfer pós-Onda 4):

1. `"sideEffects": false` em [`packages/shared/package.json`](../../packages/shared/package.json#L5) informa ao empacotador que importar `@pokeverse/shared` não produz efeitos colaterais globais ocultos, liberando o descarte completo de símbolos não utilizados (*tree-shaking*).
2. Os arquivos de schema importam o Zod v4 por namespace (`import * as z from 'zod'`) em vez de `import { z } from 'zod'`, permitindo que o `esbuild` elimine validadores e utilitários internos do Zod não referenciados pelo cliente web.

---

## 4. Análise Linha por Linha de `@pokeverse/shared/src/`

O arquivo [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts) atua como ponto único de exportação (*barrel file*), reunindo os quatro subdomínios do pacote compartilhado.

### 4.1. [`src/types/async-state.ts`](../../packages/shared/src/types/async-state.ts) — Máquina de Estados Tipada com Discriminated Unions

```typescript
export type AppError = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
};

export type AsyncState<T, E = AppError> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly reason: string }
  | { readonly status: 'error'; readonly error: E }
  | { readonly status: 'success'; readonly data: T };

export function assertNever(value: never, context = 'Unexpected variant'): never {
  throw new Error(`${context}: ${String(value)}`);
}
```

- **Eliminação de estados contraditórios:** modelar estado assíncrono com quatro booleanos independentes (`isLoading`, `isError`, `isEmpty`, `isSuccess`) gera $2^4 = 16$ combinações, das quais 11 representam estados inválidos (ex.: carregando e com erro simultaneamente). A **União Discriminada** usa o campo literal `status` como discriminador exclusivo.
- **Type Narrowing automático:** ao testar `if (state.status === 'success')`, o compilador garante que `state.data` está presente e `state.error` não existe naquele ramo.
- **Exaustividade garantida por `assertNever(value: never)`:** quando usada no ramo `default:` de um `switch (state.status)`, qualquer novo estado adicionado ao tipo no futuro gera erro imediato de compilação nos pontos de consumo ainda não atualizados.
- **União literal de modos e hardware:** define também `HardwareTier` (`'ultra' | 'balanced' | 'lite'`), `PerfPreference` (`'auto' | HardwareTier`) e `AccessMode` (`'visitor' | 'trainer'`).

### 4.2. [`src/constants/platform.constants.ts`](../../packages/shared/src/constants/platform.constants.ts) — Fonte Única de Constantes e Módulos

- **Constantes numéricas centralizadas:** `TOTAL_POKEDEX_SLOTS = 10`, `MAX_CATALOG_RESULTS = 120`, `MAX_TEAM_SIZE = 6`, `MAX_EV_PER_STAT = 252`, `MAX_EV_TOTAL = 510`, `HEALTH_PROBE_TIMEOUT_MS = 1500` e `POSTGRES_PROBE_TIMEOUT_MS = 4000`.
- **Derivação de tipo por `as const`:** `POKEMON_TYPES = ['normal', ..., 'fairy'] as const` fixa o array como tupla literal somente leitura, permitindo derivar `export type PokemonTypeName = (typeof POKEMON_TYPES)[number]` sem duplicar a lista em texto e em tipo.
- **Metadados dos 5 módulos (`PLATFORM_MODULES`):** define `id`, `label`, `route`, `shortcut` (`'1'`..`'5'`), `requiresTrainer` e `summary` compartilhados entre o Dock da interface Web, `authGuard` e `SystemController`.

### 4.3. [`src/domain/pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts) — Normalização Unicode, Fonética PT/EN e Damerau-Levenshtein

1. **Normalização e limpeza Unicode (`normalizePokemonName` e `cleanComparisonText`, linhas 21–31):**
   - `normalizePokemonName`: remove espaços externos, converte para minúsculas e substitui espaços internos por `-` (padrão de identificadores da PokéAPI).
   - `cleanComparisonText`: aplica `.normalize('NFD')` (*Normalization Form Canonical Decomposition*), separando caracteres acentuados em letra base + diacrítico combinante, remove todos os diacríticos na faixa Unicode `\u0300`–`\u036f` via `.replaceAll(/[\u0300-\u036f]/g, '')` e mantém apenas `[a-z0-9]`.
2. **Chave fonética bilíngue (`buildPhoneticKey`, linhas 33–44):**
   - Aproxima variações ortográficas de pronúncia entre português e inglês: `ph -> f`, `ch -> x`, `qu -> k`, `y -> i`, `w -> u`, `c` seguido de `e` ou `i` via *positive lookahead* (`/c(?=[ei])/g -> 's'`), `z -> s`, `k -> c` e redução de letras consecutivas idênticas (`/(.)\1+/g -> '$1'`).
3. **Distância de Damerau-Levenshtein em `Int32Array` (`computeDamerauDistance`, linhas 76–105):**
   - Aplica saída antecipada (*early exit*) em $O(1)$ antes de alocar o vetor quando `Math.abs(m - n) > maxDistance`.
   - Calcula o custo mínimo entre quatro operações de edição: inserção, remoção, substituição e **transposição de dois caracteres adjacentes** (`canTranspose` verificando `i > 1 && j > 1` e caracteres invertidos nas posições `i - 2` e `j - 2`).
4. **Pontuação determinística e desempate (`filterPokemonCatalog`, linhas 237–300):**
   - Termos numéricos (com ou sem `#`) executam `filterByNumericId`: `0` para ID exato, `100 + id` para prefixo e `200 + id` para substring.
   - Termos textuais aplicam `maxDistance = Math.min(4, Math.max(1, Math.floor(compact.length * 0.45)))` quando `compact.length >= 3` e pontuam em ordem decrescente de relevância (menor `score` vence): match exato (`0`), prefixo (`100` + penalidade `20` para variações com hífen), substring (`300+`), match fonético exato (`400 + id`), prefixo fonético (`500+`) e distância Damerau-Levenshtein (`600+`), ordenando com desempate por `a.id - b.id` e fatiando em `maxResults` (`120`).

### 4.4. [`src/domain/pokeapi-endpoints.ts`](../../packages/shared/src/domain/pokeapi-endpoints.ts) — Catálogo dos 51 Endpoints e Filtro Composto

1. **Representação tabular (`POKEAPI_ENDPOINT_CATALOG_TABLE`, linhas 29–81):**
   - Os `51` recursos da PokéAPI v2 ficam armazenados em texto delimitado por `|` e analisados em `buildPokeApiEndpointCatalog()` (linhas 83–121), que valida cada coluna com `categorySchema` e `cachePolicySchema` (Zod). Essa estrutura eliminou duplicação repetitiva de chaves de objeto acusada pela análise estática do SonarQube Cloud (CPD).
2. **Anotação `/* @__PURE__ */` (linha 124):**
   - Indica ao bundler (`esbuild`/`rollup`) que `buildPokeApiEndpointCatalog()` é livre de efeitos colaterais, permitindo remover o catálogo inteiro do bundle final caso o ponto de entrada não o importe.
3. **Filtro multi-critério (`filterCatalogWithAdvancedQuery`, linhas 189–222):**
   - Valida `PokedexAdvancedQuerySchema` (`term`, até `2` tipos em `types`, `generation` `1..9`, `habitat`, flags booleanas taxonômicas, `minBst`, `sortBy` e `limit`), utiliza `Map<number, T>` para recuperar objetos enriquecidos após a busca fuzzy em $O(1)$ e ordena em cópia imutável (`[...filtered]`).

### 4.5. [`src/domain/pokemon-lab.ts`](../../packages/shared/src/domain/pokemon-lab.ts) — Regras Puras do Laboratório Genético

Todas as funções deste módulo são puras (determinísticas, sem efeitos colaterais ou I/O) e validam a entrada com schemas Zod utilizando `z.input<typeof Schema>` para que campos com `.default(...)` sejam opcionais na chamada:

1. **`calculateXpForLevel(level, growthRate)` (linhas 96–122):** calcula experiência acumulada para níveis `1..100` nas `6` curvas oficiais (`fast`, `medium`, `slow`, `medium-slow`, `erratic` em 4 faixas de nível e `fluctuating` em 3 faixas), retornando `0` para o nível `1`.
2. **`StatEvSpreadSchema` e `calculateStatsAtLevel(rawInput)` (linhas 35–49 e 137–200):** impõe teto individual `0..252` (`MAX_EV_PER_STAT`) e restrição cruzada via `.refine()` garantindo soma máxima `<= 510` (`MAX_EV_TOTAL`); calcula HP e demais atributos segundo as fórmulas Gen III–IX ponderadas por `IV`, `EV`, `Nature` (`0.9 | 1 | 1.1`) e `ascensionBonusPercent` (`0..12%`), preservando a invariante de HP unitário fixo quando `baseStats.hp === 1`.
3. **`evaluateEvolutionChance(rawInput)` (linhas 270–289):** verifica nível, felicidade (`0..255`), item catalisador, janela temporal (`day | night | dusk`), clima (`clear | rain | sun | sand | snow`) e golpe pré-requisito; deduz `25` pontos percentuais por pendência e limita a probabilidade a no máximo `49%` enquanto houver requisitos faltantes.
4. **`calculateReplicationAndCloning(rawInput)` (linhas 327–377):** utiliza as tabelas `RARITY_PENALTY` e `RARITY_COST_MULTIPLIER` para calcular taxa de sucesso (`12%..99%`), fidelidade (`25%..100%`), IVs perfeitos garantidos (`0..6`), risco de mutação (`1%..65%`), chance Shiny (`<= 15%`) e custo em Bio-Energia.
5. **`calculateSpeciesAscension(rawInput)` (linhas 410–432):** converte exemplares reciclados da mesma espécie (`12 * levelFactor`) ou do mesmo grupo compatível (`4 * levelFactor`) e bônus Shiny (`+45`) em `bioEssenceGained`, determinando os ranks **`E` (< 20), `D` (20..59), `C` (60..119), `B` (120..199), `A` (200..319), `S` (320..499) e `APEX` (>= 500)**, bônus de ressonância até `+12%`, tokens de *Hyper Training* (`Math.floor(totalEssence / 100)`) e desbloqueio `apexSpeciesEvolutionUnlocked` aos `500` pontos.

### 4.6. Contratos Zod de Fronteira (`src/schemas/*.ts`)

| Arquivo | Contratos e Recursos Zod Aplicados |
| :--- | :--- |
| [`pokedex.schemas.ts`](../../packages/shared/src/schemas/pokedex.schemas.ts) | `PokedexSlotIndexParamSchema` combina `z.union([z.number().int(), z.string().regex(/^\d+$/).transform(...)])` + `.pipe(...)` para aceitar inteiros ou strings numéricas da URL e validar o intervalo `0..9`; `SavePokedexSlotSchema` usa `.strict()` para bloquear propriedades extras (*Mass Assignment*); `CachedPokemonResponseSchema` e `CachedCatalogResponseSchema` tipam o enum de origem de cache `'hit' \| 'miss' \| 'stale-fallback'`. |
| [`auth.schemas.ts`](../../packages/shared/src/schemas/auth.schemas.ts) | `NormalizedEmailSchema` normaliza espaços e caixa com `.trim().toLowerCase().pipe(z.email(...))`; `SessionBootstrapResponseSchema` e `MfaChallengeVerifySchema` usam `z.discriminatedUnion(...)` para estados autenticado/visitante e métodos `totp`/`backup_code`; `DisableTotpSchema` exige senha ou código via `.refine()`; define `PRIVACY_CONSENT_VERSION = 1`, `TrainerDataExportSchema`, `GoogleOAuthCallbackQuerySchema` e `PasskeyIdParamSchema`. |
| [`events.schemas.ts`](../../packages/shared/src/schemas/events.schemas.ts) | Define a constante `KAFKA_TOPICS` (6 tópicos incluindo `pokeverse.dlq.v1`) e os schemas `WorldTickerEventSchema`, `EmailNotificationEventSchema` e `EncryptedOutboxPayloadSchema` (`version: 1` e `ciphertext` AES-256-GCM). |
| [`health.schemas.ts`](../../packages/shared/src/schemas/health.schemas.ts) | Modela as respostas de `/health/live` (`LivenessResponseSchema`), `/health/ready` (`ReadinessResponseSchema` com `postgres`, `redis`, `kafka` e `s3`) e `/api/v1/system/bootstrap` (`SystemBootstrapSchema`). |

---

## 5. Decisões Técnicas, Trade-offs e Perguntas Frequentes sobre `@pokeverse/shared`

### 1. *"Por que utilizar TypeScript e Zod juntos em vez de apenas TypeScript?"*
> **Decisão técnica:** As verificações do TypeScript são removidas na transpilação para JavaScript (*Type Erasure*) e não existem em tempo de execução. O **Zod** executa validação estrutural real na entrada de APIs, variáveis de ambiente, `localStorage` e payloads de rede, gerando simultaneamente o tipo TypeScript via `z.infer<>` para eliminar divergências entre contrato estático e validação de runtime.

### 2. *"Por que linearizar a matriz de Damerau-Levenshtein em um `Int32Array` com `stride`?"*
> **Decisão técnica:** Alocar `Array<number[]>` cria múltiplos objetos dispersos no *heap* a cada palavra avaliada na busca de $1.351$ espécies, aumentando a pressão no coletor de lixo (GC). Um `Int32Array` de tamanho `(m + 1) * stride` ocupa um único bloco contíguo de memória de inteiros de 32 bits com acesso direto por `i * stride + j`, otimizando localidade de cache na CPU.

### 3. *"Como o uso de `Map<number, T>` em `pokeapi-endpoints.ts` evita gargalo de CPU?"*
> **Decisão técnica:** Após filtrar resultados por busca aproximada, recuperar o objeto enriquecido correspondente via `.find()` repetiria uma varredura linear para cada item encontrado ($O(N^2)$, cerca de $1,82$ milhão de operações no pior caso). Indexar os itens por ID em um `Map<number, T>` previamente reduz cada lookup subsequente para $O(1)$.

### 4. *"Qual a diferença entre `AsyncState<T>` como Discriminated Union e flags booleanas isoladas?"*
> **Decisão técnica:** Quatro flags booleanas independentes permitem estados contraditórios em tempo de execução (como `isLoading: true` junto de `isError: true`). A união discriminada pela propriedade `status` reduz os estados válidos exclusivamente aos cinco previstos e permite que `assertNever(value: never)` transforme variantes esquecidas em erro de compilação.

### 5. *"Qual a diferença prática entre `z.input<typeof Schema>` e `z.infer<typeof Schema>`?"*
> **Decisão técnica:** Em schemas que definem valores padrão com `.default(...)` (como `StatCalculationInputSchema` e `PokedexAdvancedQuerySchema`), `z.input` mantém esses campos opcionais na assinatura de entrada para quem invoca a função, enquanto `z.infer` (equivalente a `z.output`) garante que o objeto retornado por `.parse()` possui todos os campos preenchidos com seus valores padrão.

---

<p align="center">
  <a href="01-anatomia-do-repositorio-pastas-e-arquivos.md">Anterior: Vol. 01 (Pastas &amp; Arquivos)</a>
  &nbsp;·&nbsp;
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="03-dicionario-completo-de-jargoes-e-glossario.md">Próximo: Vol. 03 (Glossário Técnico)</a>
</p>
