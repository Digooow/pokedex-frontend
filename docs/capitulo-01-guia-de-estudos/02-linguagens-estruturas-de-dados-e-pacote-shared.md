<p align="center">
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="01-anatomia-do-repositorio-pastas-e-arquivos.md">Anterior: Vol. 01 (Pastas &amp; Arquivos)</a>
  &nbsp;·&nbsp;
  <a href="03-dicionario-completo-de-jargoes-e-glossario.md">Próximo: Vol. 03 (Dicionário de Jargões)</a>
</p>

# Volume 02 — Linguagens, Estruturas de Dados, Algoritmos e Pacote `@pokeverse/shared`

> **Documentos originais destrinchados aqui:** [`01 — Arquitetura do Monorepo`](../01-arquitetura-monorepo-e-padroes.md), [`12 — Pokédex 2.0`](../12-pokedex-2-0-pokeapi-e-controles.md), [`15 — Pokédex Suprema e Laboratório Genético`](../15-pokedex-suprema-51-endpoints-e-laboratorio-genetico.md) e [`17 — Plano SOLID e Engenharia Big Tech`](../17-plano-solid-clean-code-e-engenharia-big-tech.md).
> **Arquivos-fonte analisados linha por linha:** [`tsconfig.base.json`](../../tsconfig.base.json) e **100% do código de produção** dentro de [`packages/shared/`](../../packages/shared/).

---

## 1. Para Quem Está Começando: o que você precisa saber antes de ler o código

### 1.1. Por que trocamos JavaScript puro por TypeScript + Zod?

Na Fase 0, usávamos **JavaScript puro**. Em JavaScript, uma variável pode mudar de tipo livremente — hoje é um texto `"pikachu"`, amanhã por distração vira `undefined` ou um número, e você só descobre o acidente quando o usuário clica no botão e a tela quebra.

- **TypeScript (`strict`):** é como colocar **encaixes físicos diferentes nos cabos do computador** (USB, HDMI, tomada). Se uma função espera um objeto `PokemonDetailDto` e você tentar passar uma string solta, o código **nem compila**. O erro aparece no editor antes de existir usuário clicando.
- **Zod v4 (Validação em Tempo de Execução):** o TypeScript protege *dentro* do nosso código antes de rodar, mas quando dados chegam de fora (da internet, de um formulário preenchido pelo usuário ou da PokéAPI), as checagens do TypeScript já sumiram porque o navegador e o Node.js rodam JavaScript. O **Zod** é o "segurança na porta": ele confere campo por campo **enquanto o sistema está rodando** e bloqueia qualquer dado estranho na entrada.

### 1.2. O que é uma Estrutura de Dados e por que "Big-O" importa?

**Estrutura de Dados** é o jeito como você organiza informações na memória RAM do computador para achá-las rápido depois.
Imagine que você tem **1.351 cartas Pokémon**:

- **Lista simples (`Array`) sem índice — Complexidade $O(N)$:** para achar uma carta específica pelo ID, você precisa olhar uma por uma até encontrar. Se forem 1.351 cartas, faz até 1.351 comparações. Se fizer isso para cada item de outra lista de 1.351 itens ($1.351 \times 1.351$), vira **$O(N^2)$** (~1,8 milhão de operações!).
- **Dicionário / Tabela Hash (`Map<number, T>`) — Complexidade $O(1)$:** cada carta fica numa gaveta etiquetada pelo ID. Para pegar o Pikachu (#25), você abre a gaveta `25` diretamente em **1 passo**, tenha 10 ou 10 milhões de cartas.
- **Vetor Tipado Contíguo (`Int32Array`) — Memória Linearizada:** em vez de criar centenas de pequenas listas separadas na memória para uma tabela 2D, alocamos **um único bloco reto e contínuo** de inteiros de 32 bits, deixando a CPU ler muito mais rápido sem dar trabalho para o coletor de lixo (*Garbage Collector*).

---

## 2. Configuração de Rigor Máximo e Empacotamento (`tsconfig.base.json` e `tsup`)

### 2.1. Cada trava de [`tsconfig.base.json`](../../tsconfig.base.json) explicada

Todos os workspaces (`shared`, `api`, `web`) herdam estas regras de ouro:

| Opção no `tsconfig.base.json` | O que faz na prática | Bug real que impede |
| :--- | :--- | :--- |
| `"strict": true` | Liga o pacote completo de checagens rígidas do TypeScript. | Impede coerções silenciosas e descuidos gerais de tipagem. |
| `"noImplicitAny": true` | Proíbe parâmetros/variáveis virarem `any` (tipo "vale-tudo") sem você declarar. | Impede buracos invisíveis onde a checagem de tipos desliga. |
| `"strictNullChecks": true` | Separa `string` de `string \| null \| undefined`. | Elimina o clássico erro *"Cannot read properties of undefined"* em produção. |
| `"strictFunctionTypes": true` & `"strictBindCallApply": true` | Exige compatibilidade exata nos parâmetros de callbacks, `.bind()`, `.call()` e `.apply()`. | Evita passar função com assinatura errada para manipuladores de eventos. |
| `"noImplicitOverride": true` | Obriga escrever `override` ao sobrescrever método de classe pai. | Evita que renomear um método na classe pai deixe um método órfão na filha. |
| `"noImplicitReturns": true` | Toda rota de `if/else` numa função precisa retornar valor ou lançar erro. | Evita função retornar `undefined` sem querer num caminho esquecido. |
| `"noFallthroughCasesInSwitch": true` | Todo `case` de um `switch` precisa terminar com `break` ou `return`. | Evita o bug de executar dois blocos seguidos por esquecer `break`. |
| `"noUncheckedIndexedAccess": true` | Ler `meuArray[i]` ou `record[chave]` retorna `Tipo \| undefined`, nunca `Tipo` garantido! | Obriga checar se o índice existe (como `if (!match?.[1])` e `dp[...] ?? maxDistance` em `pokedex-search.ts`). |
| `"forceConsistentCasingInFileNames": true` | Diferencia maiúsculas/minúsculas em imports mesmo no Windows. | Evita código funcionar no Windows e quebrar no Linux (Docker/GitHub Actions) por erro de letra maiúscula no nome do arquivo. |
| `"esModuleInterop": true`, `"skipLibCheck": true`, `"isolatedModules": true` | Compatibiliza módulos CJS/ESM, acelera build ignorando `.d.ts` de terceiros e garante compilação isolada por arquivo (`tsup`/`esbuild`). | Permite que compiladores ultrarrápidos (como `esbuild` no Angular e `tsup`) compilem cada `.ts` sem precisar ler o projeto inteiro de uma vez. |

### 2.2. Build Dual e Tree-Shaking (`packages/shared/package.json` & `tsup.config.ts`)

Por que [`packages/shared/package.json`](../../packages/shared/package.json) e [`packages/shared/tsup.config.ts`](../../packages/shared/tsup.config.ts) geram **dois formatos de saída ao mesmo tempo**?

- O **Front-end Angular** roda no navegador empacotado por `esbuild` e prefere **ESM** (`import` -> `./dist/index.mjs` + `./dist/index.d.mts`).
- O **Back-end NestJS + Jest** roda em Node.js configurado como **CommonJS** (`require` -> `./dist/index.js` + `./dist/index.d.ts`).
- O [`tsup.config.ts`](../../packages/shared/tsup.config.ts) resolve os dois de uma vez com `format: ['esm', 'cjs']`, `dts: true`, `sourcemap: true` e `target: 'es2022'`.
- **O segredo do corte de `-324 kB` no bundle Angular (Doc 15):**
  1. `"sideEffects": false` no `package.json` avisa ao empacotador que importar algo de `@pokeverse/shared` não altera estado global oculto — logo, tudo o que o front-end não usar pode ser jogado fora (*tree-shaking*).
  2. Todos os arquivos de schema usam `import * as z from 'zod'` (em vez de `import { z } from 'zod'`), permitindo que o Zod v4 remova funções não utilizadas pelo navegador.

---

## 3. Análise Linha por Linha de Todos os Arquivos de `@pokeverse/shared/src/`

O ponto de entrada [`src/index.ts`](../../packages/shared/src/index.ts) é um *barrel file* de 9 linhas que reexporta os 4 módulos centrais: tipos, constantes, schemas e domínio. Vamos destrinchar cada arquivo!

### 3.1. [`src/types/async-state.ts`](../../packages/shared/src/types/async-state.ts) — Máquina de Estados Impossíveis de Quebrar

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
```

**Por que essa estrutura é brilhante?**
- **O jeito frágil (booleanos soltos):** se você criar `isLoading`, `isError`, `isEmpty` e `data` separados, existem $2^4 = 16$ combinações. Nada impede o código de ter `isLoading: true` e `isError: true` ao mesmo tempo, bugando a tela!
- **O jeito PokéVerse (Discriminated Union):** a propriedade `status` funciona como uma **etiqueta discriminadora**. Se `state.status === 'success'`, o TypeScript *sabe* matematicamente que `state.data` existe e `state.error` **não** existe.
- **`assertNever(value: never)`:** quando você faz um `switch (state.status)` cobrindo todos os casos, o `default: return assertNever(state)` garante que, se alguém adicionar um 6º estado no futuro e esquecer de tratá-lo na tela, **o compilador acusa erro na hora** porque o tipo deixará de ser `never`.
- **`HardwareTier`, `PerfPreference`, `AccessMode`:** tipos literais estritos (`'ultra' | 'balanced' | 'lite'`, `'auto' | HardwareTier`, `'visitor' | 'trainer'`) que impedem erros de digitação como `'ultraa'`.

### 3.2. [`src/constants/platform.constants.ts`](../../packages/shared/src/constants/platform.constants.ts) — Zero Números Mágicos

- **Constantes numéricas nomeadas:** `TOTAL_POKEDEX_SLOTS = 10`, `MAX_CATALOG_RESULTS = 120`, `MAX_TEAM_SIZE = 6`, `MAX_EV_PER_STAT = 252`, `MAX_EV_TOTAL = 510`, `HEALTH_PROBE_TIMEOUT_MS = 1500` e `POSTGRES_PROBE_TIMEOUT_MS = 4000`. Alterar um limite aqui atualiza front-end, back-end e testes juntos.
- **Truque TypeScript com `as const`:**
  `export const POKEMON_TYPES = ['normal', 'fire', ..., 'fairy'] as const;` congela a lista como tupla imutável literal (em vez de um genérico `string[]`). Logo abaixo, `export type PokemonTypeName = (typeof POKEMON_TYPES)[number];` extrai automaticamente a união `'normal' | 'fire' | ... | 'fairy'` — **sem duplicar a lista**.
- **`PLATFORM_MODULES`:** tabela declarativa imutável (`readonly PlatformModuleMeta[]`) definindo os 5 módulos (`overworld`, `pokedex`, `museum`, `arcade`, `arena`), suas rotas (`/mundo`, `/pokedex`, `/museu`, `/arcade`, `/arena`), atalhos `'1'` a `'5'`, e quem exige login (`requiresTrainer`).

### 3.3. [`src/domain/pokedex-search.ts`](../../packages/shared/src/domain/pokedex-search.ts) — Busca Fonética + Matriz `Int32Array`

Este arquivo evoluiu a busca da Fase 0 para TypeScript puro e testado unitariamente, tolerando acentos, erros de digitação em português e letras trocadas sem nenhuma dependência externa.

#### Etapa 1 — Limpeza Unicode e Chave Fonética (`cleanComparisonText` e `buildPhoneticKey`)
1. `normalizePokemonName`: remove pontas (`.trim()`), passa para minúsculas e troca espaços por hífen (ex.: `"Mr Mime"` -> `"mr-mime"`, padrão da PokéAPI).
2. `cleanComparisonText`:
   - `.normalize('NFD')`: no padrão Unicode, letras acentuadas como `é` podem ser um caractere só ou a junção `e` + `´`. O modo `NFD` (*Normalization Form Canonical Decomposition*) sempre separa a letra da marca de acento.
   - `.replaceAll(/[\u0300-\u036f]/g, '')`: essa faixa hexadecimal (`0300` a `036f`) contém todos os diacríticos combinantes (agudo, crase, til, circunflexo, cedilha). Apagar essa faixa transforma `"pokémon"` em `"pokemon"` sem tabela manual de acentos!
   - `.replaceAll(/[^a-z0-9]/g, '')`: remove hífens, pontos e apóstrofos (`"mr-mime"` -> `"mrmime"`).
3. `buildPhoneticKey`: aproxima como alguém que fala português tenta escrever o som do nome em inglês:
   - `ph -> f`, `ch -> x`, `qu -> k`, `y -> i`, `w -> u`;
   - `/c(?=[ei])/g -> 's'`: um *positive lookahead* (troca `c` por `s` **somente** se a próxima letra for `e` ou `i`, preservando `c` antes de `a/o/u`);
   - `z -> s`, `k -> c`;
   - `.replaceAll(/(.)\1+/g, '$1')`: o grupo `(.)` captura qualquer letra e `\1+` casa repetições seguidas da *mesma* letra, colapsando `"eevee"` -> `"evee"` -> `"eve"` ou `"pikaachu"` -> `"picaxu"`.

#### Etapa 2 — A Estrutura de Dados Estrela: `Int32Array` 1D Simulando Matriz 2D (`computeDamerauDistance`)

Para medir a **Distância de Damerau-Levenshtein** entre duas palavras de tamanhos $m$ e $n$, precisamos de uma grade de $(m+1) \times (n+1)$ números inteiros (Programação Dinâmica).

Em vez de criar um array de arrays `number[][]` (que aloca $m+1$ objetos separados na heap do JavaScript), o código faz:

```typescript
const stride = n + 1;
const dp = new Int32Array((m + 1) * stride);
```

- **Por que `Int32Array` + `stride`?**
  1. **Alocação única e contígua:** todos os números ficam lado a lado na memória RAM. A CPU lê blocos inteiros no cache L1/L2 muito mais rápido.
  2. **Zero pressão no Garbage Collector:** `Int32Array` armazena inteiros crus de 32 bits com tamanho fixo, sem encapsular objetos JS.
  3. **Mapeamento 2D → 1D:** a célula lógica `(linha i, coluna j)` mora na posição exata `i * stride + j`.
- **Otimização *Early Exit* ($O(1)$):** antes de criar o `Int32Array`, `if (Math.abs(m - n) > maxDistance) return maxDistance + 1;` descarta na hora palavras com diferença de comprimento maior que o limite tolerado (entre `1` e `4` edições conforme o tamanho da busca).
- **As 4 operações em `computeDamerauCell`:** inserção (`left + 1`), remoção (`up + 1`), substituição (`diag + cost`) e **transposição adjacente** (`dp[(i - 2) * stride + (j - 2)] + cost` quando duas letras vizinhas foram digitadas trocadas, como `"pikahcu"` vs `"pikachu"`). Complexidade de tempo $O(m \cdot n)$ com palavras curtas ($\approx 10$ letras $\rightarrow \approx 100$ operações minúsculas!).

#### Etapa 3 — Ranking Determinístico por Faixas de Pontuação (`filterPokemonCatalog`)

Quanto **menor** o `score`, mais relevante é o Pokémon:
- **Busca numérica (`#25` ou `25`):** `0` (ID exato), `100 + id` (começa com `25`), `200 + id` (contém `25`).
- **Busca textual:**
  - `0`: match exato (`name` ou `compactName`);
  - `100 + formPenalty + diffLen`: começa com o termo (`formPenalty = 20` se tiver `-` como `pikachu-rock-star`, garantindo que o `pikachu` original venha sempre antes das formas alternativas!);
  - `300 + substringIdx + formPenalty`: contém o termo no meio;
  - `400 + id` / `500 + diffLen`: match fonético exato ou prefixo fonético;
  - `600 + minDist * 100 + formPenalty + diffLen`: distância de Damerau-Levenshtein dentro de `maxDistance = Math.min(4, Math.max(1, Math.floor(compact.length * 0.45)))` quando `compact.length >= 3`.
- **Desempate estável:** sempre ordena por `a.score - b.score || a.id - b.id` e retorna fatiado em `maxResults` (`120` por padrão).

### 3.4. [`src/domain/pokeapi-endpoints.ts`](../../packages/shared/src/domain/pokeapi-endpoints.ts) — 51 Endpoints Compactos + Índice `Map<number, T>`

Este módulo prepara a **Pokédex Suprema (Fase 4B)** sem inflar o código nem gerar código duplicado:

1. **Por que a tabela em texto `POKEAPI_ENDPOINT_CATALOG_TABLE` (linhas 29–81)?**
   Originalmente, listar 51 objetos JSON repetindo as chaves `{ key: ..., pathTemplate: ..., category: ..., cachePolicy: ..., implementedInBff: ..., targetFeature: ... }` disparou falso positivo de código duplicado (CPD) no SonarCloud. A solução foi armazenar os 51 recursos em uma **tabela compacta separada por pipe (`|`)** e analisá-la em `buildPokeApiEndpointCatalog()` usando schemas Zod (`categorySchema`, `cachePolicySchema`), validando tamanho da linha e flags booleanas na origem.
2. **O comentário `/* @__PURE__ */` (linha 124):**
   É um aviso oficial padrão para bundlers (`esbuild`, `rollup`, `terser`): *"esta chamada não tem efeitos colaterais; se nenhum arquivo importar `POKEAPI_V2_ENDPOINTS`, pode eliminá-la completamente do bundle final do usuário!"*.
3. **Uso de `Map<number, T>` em `filterCatalogWithAdvancedQuery` (linhas 189–222):**
   - Primeiro, cria um dicionário `byId = new Map<number, T>()` em tempo $O(N)$ indexando os objetos enriquecidos (`EnrichedCatalogItem` com `types`, `generation`, `habitat`, `isLegendary`, `isMythical`, `isBaby`, `baseStatTotal`).
   - Se o usuário digitou um termo (`parsed.term.trim()`), chama a busca fuzzy `filterPokemonCatalog` (que retorna `CatalogMatchItem`) e usa **`byId.get(match.id)`** ($O(1)$!) para recuperar o item enriquecido completo — evitando um `.find()` linear que transformaria a busca em $O(N^2)$.
   - Em seguida aplica os filtros combinados (`matchesEnrichedFilters`, `matchesSpeciesFlags`), ordena por um dos 4 critérios (`id-asc`, `id-desc`, `name-asc`, `bst-desc`, sem mutar o array original usando `[...filtered]`) e fatia com `.slice(0, parsed.limit)`.

### 3.5. [`src/domain/pokemon-lab.ts`](../../packages/shared/src/domain/pokemon-lab.ts) — Matemática Pura do Laboratório Genético

Todo cálculo oficial da futura **Fase 5** já vive aqui como **função pura** (mesma entrada = mesma saída, zero acesso a banco ou rede, 100% testável):

1. **`calculateXpForLevel(level, growthRate)`:** implementa exatamente as **6 curvas de experiência** dos jogos oficiais Pokémon para níveis `1..100` (`fast`: $\lfloor 4n^3/5 \rfloor$; `medium`: $n^3$; `slow`: $\lfloor 5n^3/4 \rfloor$; `medium-slow`; `erratic` em 4 faixas de nível; `fluctuating` em 3 faixas), travando o nível entre `1` e `100` e retornando `0` no nível `1`.
2. **`StatEvSpreadSchema` com `.refine()`:** valida que cada EV esteja entre `0` e `252` (`MAX_EV_PER_STAT`) **e** que a soma dos 6 atributos nunca ultrapasse `510` (`MAX_EV_TOTAL`) — regra clássica do competitivo Pokémon garantida pelo schema Zod.
3. **`calculateStatsAtLevel(rawInput)`:**
   - Faz `StatCalculationInputSchema.parse(rawInput)` (usando `z.input<...>` na entrada para que `ivs`, `evs`, `natureModifiers` e `ascensionBonusPercent` sejam opcionais com valores default!).
   - Aplica a fórmula oficial Gen III–IX:
     - **HP:** $\left\lfloor \frac{(2 \cdot \text{Base} + \text{IV} + \lfloor \text{EV}/4 \rfloor) \cdot L}{100} \right\rfloor + L + 10$, **com guarda explícita para o Shedinja (`baseStats.hp === 1 ? 1 : ...`)**, que sempre tem 1 de HP nos jogos!
     - **Demais atributos (`computeNonHpStat`):** $\left\lfloor \left(\left\lfloor \frac{(2 \cdot \text{Base} + \text{IV} + \lfloor \text{EV}/4 \rfloor) \cdot L}{100} \right\rfloor + 5\right) \cdot \text{Nature} \right\rfloor$, multiplicado por `ascensionScale` (`1 + ascensionBonusPercent / 100`, de 0% até +12%).
4. **`evaluateEvolutionChance(rawInput)`:** checa nível, felicidade (`0..255`), item catalisador, período do dia (`day|night|dusk`), clima (`clear|rain|sun|sand|snow`) e golpe aprendido. Cada pendência tira 25 pontos percentuais e entra na lista `missingRequirements`; se faltar algo (`!canEvolve`), trava a chance em no máximo `49%`.
5. **`calculateReplicationAndCloning(rawInput)`:** aplica **Lookup Tables** (`RARITY_PENALTY` e `RARITY_COST_MULTIPLIER` tipadas com `Record<Rarity, number>`) em vez de `switch`, calculando taxa de sucesso (`12%..99%`), fidelidade (`25%..100%`), IVs perfeitos garantidos (`0..6`), risco de mutação, chance Shiny (`<= 15%`) e custo em Bio-Energia.
6. **`calculateSpeciesAscension(rawInput)`:** recicla exemplares da mesma espécie (`12 * levelFactor`) ou do mesmo *Egg Group* (`4 * levelFactor`) + bônus por Shiny (`+45`), somando em `totalEssence` para subir pelos 7 ranks (**`E` < 20 ≤ `D` < 60 ≤ `C` < 120 ≤ `B` < 200 ≤ `A` < 320 ≤ `S` < 500 ≤ `APEX`**), liberando até `+12%` de bônus de ressonância, tokens de *Hyper Training* (1 a cada 100 de essência) e `apexSpeciesEvolutionUnlocked` aos 500 pontos.

### 3.6. Os Contratos Zod de Fronteira (`src/schemas/*.ts`)

| Arquivo | Destaques Técnicos Linha por Linha |
| :--- | :--- |
| [`pokedex.schemas.ts`](../../packages/shared/src/schemas/pokedex.schemas.ts) | `PokedexSlotIndexParamSchema` usa `.union([z.number().int(), z.string().regex(/^\d+$/).transform(...)])` encadeado com `.pipe(z.number().int().min(0).max(9))` para validar tanto parâmetros inteiros quanto strings da URL HTTP; `SavePokedexSlotSchema` usa **`.strict()`** para bloquear propriedades extras maliciosas (*Mass Assignment*); `CachedPokemonResponseSchema` modela o trio `'hit' | 'miss' | 'stale-fallback'`. |
| [`auth.schemas.ts`](../../packages/shared/src/schemas/auth.schemas.ts) | `NormalizedEmailSchema` aplica `.trim().toLowerCase().pipe(z.email())`; `SessionBootstrapResponseSchema` e `MfaChallengeVerifySchema` usam **`z.discriminatedUnion(...)`** (para visitante vs. autenticado e `totp` vs. `backup_code`); `DisableTotpSchema` usa `.refine()` exigindo senha atual ou código 2FA; `PRIVACY_CONSENT_VERSION = 1` versiona o cookie LGPD; `GoogleOAuthCallbackQuerySchema` e `PasskeyIdParamSchema` blindam a borda dos endpoints OAuth/WebAuthn. |
| [`events.schemas.ts`](../../packages/shared/src/schemas/events.schemas.ts) | Exporta `KAFKA_TOPICS` (`WORLD_EVENTS`, `NOTIFICATIONS_EMAIL`, `ARCADE_SAVESTATE`, `BATTLE_MATCHMAKING`, `BATTLE_RESULTS`, `DLQ`) e valida payloads de eventos de mundo, e-mails OTP e o envelope criptografado do Outbox (`EncryptedOutboxPayloadSchema` com `version: 1` e `ciphertext`). |
| [`health.schemas.ts`](../../packages/shared/src/schemas/health.schemas.ts) | Valida formato exato das respostas de `/health/live`, `/health/ready` (status das 4 dependências: `postgres`, `redis`, `kafka`, `s3`) e `/api/v1/system/bootstrap`. |

---

## 4. Colinha de Entrevista sobre `@pokeverse/shared` e Estruturas de Dados

1. **"Por que usar `Int32Array` linearizado com `stride` em `computeDamerauDistance` em vez de `Array<number[]>`?"**
   *Resposta:* Um `number[][]` cria dezenas de arrays pequenos espalhados na memória heap do V8 e gera lixo para o Garbage Collector a cada tecla digitada na busca. O `Int32Array` aloca um único bloco contíguo de inteiros de 32 bits (`(m + 1) * stride`), aproveitando melhor o cache da CPU e simplificando o acesso para `dp[i * stride + j]`.
2. **"Qual a vantagem real de `AsyncState<T>` em Discriminated Union sobre múltiplos booleanos?"**
   *Resposta:* Com 4 booleanos (`isLoading`, `isError`, `isEmpty`, `isSuccess`), 11 das 16 combinações possíveis são estados impossíveis de tela. Com Discriminated Union na propriedade `status`, o TypeScript faz *type narrowing* automático e a função `assertNever` transforma qualquer estado esquecido no `switch` em erro de compilação.
3. **"Por que o arquivo `pokeapi-endpoints.ts` usa uma string delimitada por `|` com `/* @__PURE__ */`?"**
   *Resposta:* Para manter os 51 metadados legíveis e sem código estrutural repetido (zerando alertas de duplicação CPD no SonarCloud), validando os campos com Zod na construção do array e permitindo *tree-shaking* caso o bundler perceba que o catálogo completo não foi referenciado naquele entrypoint.
4. **"Qual a diferença entre `z.input<typeof Schema>` e `z.infer<typeof Schema>`?"**
   *Resposta:* Quando um schema tem `.default(...)` (como `StatCalculationInputSchema` em `pokemon-lab.ts`), `z.input` deixa os campos com default **opcionais** para quem chama a função (`calculateStatsAtLevel`), enquanto `z.infer` (equivalente a `z.output`) garante que, *depois* de passar pelo `.parse()`, todos aqueles campos estarão preenchidos e obrigatórios.

---

<p align="center">
  <a href="01-anatomia-do-repositorio-pastas-e-arquivos.md">Anterior: Vol. 01 (Pastas &amp; Arquivos)</a>
  &nbsp;·&nbsp;
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="03-dicionario-completo-de-jargoes-e-glossario.md">Próximo: Vol. 03 (Dicionário de Jargões)</a>
</p>
