<p align="center">
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
  &nbsp;·&nbsp;
  <a href="02-linguagens-estruturas-de-dados-e-pacote-shared.md">Anterior: Vol. 02 (Linguagens, Estruturas &amp; Shared)</a>
  &nbsp;·&nbsp;
  <a href="../../README.md">README atual</a>
</p>

# Volume 03 — Dicionário Completo de Jargões, Siglas, Estruturas e Conceitos (Do Zero ao Staff)

> **Como usar este volume:** este é o seu "dicionário tradutor" permanente para todo o repositório **PokéVerse OS** (`docs/00` a `docs/18`, `ARCHITECTURE.md` e código-fonte). Cada termo foi escrito com: **(1) Explicação simples para quem não conhece nada**, **(2) Definição técnica precisa**, e **(3) Por que existe no projeto e onde vê-lo**.

---

## Índice Temático

1. [Arquitetura de Software, Monorepo e Padrões de Projeto](#1-arquitetura-de-software-monorepo-e-padrões-de-projeto)
2. [Linguagens, Compilação, Bundling e Estruturas de Dados](#2-linguagens-compilação-bundling-e-estruturas-de-dados)
3. [Front-end Moderno (Angular 22), CSS 3D, Hardware e Acessibilidade](#3-front-end-moderno-angular-22-css-3d-hardware-e-acessibilidade)
4. [Back-end (NestJS 11), HTTP, APIs e Tempo Real](#4-back-end-nestjs-11-http-apis-e-tempo-real)
5. [Banco de Dados Relacional (PostgreSQL, Neon, Prisma e S3)](#5-banco-de-dados-relacional-postgresql-neon-prisma-e-s3)
6. [Cache Distribuído, Concorrência e Mensageria (Redis 7 e Kafka)](#6-cache-distribuído-concorrência-e-mensageria-redis-7-e-kafka)
7. [Segurança da Informação (AppSec), Autenticação (IAM) e LGPD](#7-segurança-da-informação-appsec-autenticação-iam-e-lgpd)
8. [Infraestrutura, Containers, Observabilidade, Testes e CI/CD](#8-infraestrutura-containers-observabilidade-testes-e-cicd)

---

## 1. Arquitetura de Software, Monorepo e Padrões de Projeto

- **Monorepo (*Monolithic Repository*) & `npm workspaces`:**
  - *Para iniciantes:* em vez de criar uma pasta separada no GitHub para o site visual, outra para o servidor e outra para as regras em comum, guardamos tudo dentro de um único "prédio" organizado em alas (`apps/web`, `apps/api`, `packages/shared`). O `npm workspaces` é o recurso nativo do npm que conecta essas alas entre si.
  - *Por que foi escolhido:* mudanças que tocam front-end e back-end saem juntas no mesmo commit, sem versões conflitantes e sem depender da complexidade extra do Turborepo. *(Ver [`package.json`](../../package.json) e [`docs/01`](../01-arquitetura-monorepo-e-padroes.md)).*
- **DRY (*Don't Repeat Yourself* — Não se Repita):**
  - *Para iniciantes:* não escreva a mesma regra em dois lugares diferentes, porque quando precisar mudar uma vírgula você vai esquecer de atualizar o segundo lugar.
  - *No projeto:* schemas Zod, busca fuzzy e regiões (`regions-atlas.data.ts`) existem em **fonte única da verdade**.
- **SOLID (Os 5 Princípios de Design Orientado a Objetos):**
  - **S — SRP (*Single Responsibility Principle*):** cada arquivo/classe tem **uma única responsabilidade** (ex.: limites no ESLint de `300` linhas para services/stores e `200` para componentes Web; `AuthService` foi fatiado em 5 services especializados).
  - **O — OCP (*Open/Closed Principle*):** código aberto para extensão (adicionar um novo template de e-mail ou validador numa tabela `Record<Key, Handler>`), fechado para modificação de `if/switch` gigantes. *(Ex.: `EMAIL_TEMPLATE_RENDERERS` no `MailService` e `DIALOG_VALIDATORS` em `auth-dialog-validator.util.ts`).*
  - **L — LSP (*Liskov Substitution Principle*):** implementações reais (Prisma, Redis, Resend) e versões simuladas em testes (*fakes/mocks*) devem respeitar exatamente o mesmo comportamento e contrato de erros.
  - **I — ISP (*Interface Segregation Principle*):** interfaces e repositórios enxutos por assunto — quem só precisa emitir sessão (`TrainerSessionIssuer`) não precisa depender das funções de exclusão LGPD nem de reset de senha. *(Ex.: os 5 repositórios isolados de `auth/`).*
  - **D — DIP (*Dependency Inversion Principle*):** regras de negócio e stores não dependem de detalhes baixos como SQL cru ou `document.querySelector`. O Angular usa diretivas declarativas (`[pvRpgFocusable]`), e os services da API dependem de classes Repository dedicadas.
- **Clean Architecture & SoC (*Separation of Concerns* — Separação de Responsabilidades):**
  - *Para iniciantes:* assim como num hospital o recepcionista faz a ficha, o médico diagnostica e o arquivo guarda o prontuário, no código o **Controller** cuida da porta HTTP, o **Service** cuida da regra de negócio e o **Repository** cuida do banco de dados.
- **Shift-Left ("Deslocar para a Esquerda"):**
  - *Explicação:* na linha do tempo de desenvolvimento (Ideia -> Código -> Borda da API -> Banco -> Produção), tentar barrar erros o mais à **esquerda** possível (no TypeScript antes de rodar e no `ZodValidationPipe` antes da lógica de negócio), onde custa quase zero corrigir. *(Ver [`ARCHITECTURE.md`](../ARCHITECTURE.md)).*
- **Repository Pattern (Padrão Repositório):**
  - *Explicação:* camada dedicada exclusivamente a falar com o banco de dados (`PokedexSlotRepository`, `OutboxEventRepository`, 5 repositórios do `auth/`), escondendo os detalhes de queries Prisma/SQL do restante do sistema.
- **Facade Pattern (Fachada):**
  - *Explicação:* uma classe simples na frente de vários especialistas internos. `AuthService` funciona como fachada para os controllers enquanto delega o trabalho pesado para `CredentialsAuthService`, `TokenRefreshService`, `AccountRecoveryService`, `SessionManagementService` e `TrainerGdprService`.
- **Strategy / Lookup Table:**
  - *Explicação:* trocar grandes blocos `if/else if/switch` por um dicionário/objeto que mapeia uma chave diretamente à função ou valor correspondente (ex.: `RARITY_PENALTY[rarityTier]` em `pokemon-lab.ts`).
- **Guard Clauses & Early Return (Retorno Antecipado):**
  - *Para iniciantes:* em vez de aninhar vários `if` um dentro do outro formando uma pirâmide deitada ("código flecha"), você verifica logo no começo da função o que pode dar errado e já sai com `return` ou `throw`. O caminho principal fica limpo em linha reta no final.
- **Complexidade Ciclomática:**
  - *Explicação:* métrica de quantos caminhos de decisão (`if`, `&&`, `||`, `case`, `?:`) uma função possui. O ESLint deste projeto bloqueia qualquer função acima de **`15`**.
- **AI Slop & Boilerplate:**
  - *Explicação:* *AI slop* é código genérico, verboso, com nomes vagos (`dataHandler`, `processItem`), comentários óbvios ou mockups preguiçosos; *boilerplate* é código repetitivo sem necessidade. Combatidos ativamente pelo [`ARCHITECTURE.md`](../ARCHITECTURE.md).
- **Skeuomorfismo & Regra Zero de UI:**
  - *Explicação:* *Skeuomorfismo* é desenhar uma interface digital imitando materiais físicos reais (metal flocado, plástico fosco, vidro de safira, LEDs). A **Regra Zero** proíbe simplificar esse visual fiel da Fase 0 ao evoluir o sistema.

---

## 2. Linguagens, Compilação, Bundling e Estruturas de Dados

- **TypeScript (`strict`):** superset tipado do JavaScript que verifica contratos antes mesmo do código executar. *(Ver [`tsconfig.base.json`](../../tsconfig.base.json)).*
- **`any` vs. `unknown` vs. `never`:**
  - `any` desliga o TypeScript (proibido aqui via `@typescript-eslint/no-explicit-any: 'error'`).
  - `unknown` significa *"ainda não sei o tipo; você é obrigado a testar/validar (Type Narrowing) antes de usar"*.
  - `never` representa um valor impossível de existir (usado em `assertNever()` para provar que todos os casos foram tratados).
- **Type Narrowing:** processo em que `if (typeof x === 'string')` ou `schema.parse(x)` reduz um tipo amplo (`unknown` ou união) para um tipo específico seguro.
- **Discriminated Union (União Discriminada):** conjunto de tipos de objeto que compartilham um campo fixo de etiqueta (ex.: `status: 'idle' | 'loading' | 'error' | 'success'` em `AsyncState<T>`), impedindo combinações contraditórias.
- **Imutabilidade (`readonly` / `as const`):** marcar propriedades e listas como somente leitura para nenhuma função alterar dados compartilhados por acidente.
- **ESM (*ECMAScript Modules*) vs. CJS (*CommonJS*):** os dois sistemas de módulos do ecossistema JS. ESM usa `import`/`export` (padrão moderno dos navegadores e Angular); CJS usa `require()`/`module.exports` (padrão tradicional do Node/NestJS/Jest).
- **Bundler (`tsup` / `esbuild`):** ferramenta que junta dezenas de arquivos TypeScript/JS em pacotes otimizados de produção.
- **Tree-Shaking (`"sideEffects": false` e `/* @__PURE__ */`):** analogia de "sacudir a árvore" para derrubar folhas mortas: o bundler descarta automaticamente funções e bibliotecas não importadas pelo app final, reduzindo drasticamente o tamanho baixado pelo usuário.
- **Schema Validation (Zod v4):** descrição declarativa do formato exato esperado de um dado, validado em tempo de execução com inferência automática de tipo TypeScript (`z.infer` e `z.input`).
- **Regex (Expressão Regular):** minilinguagem de padrões de texto usada para limpar acentos (`/[\u0300-\u036f]/g`), validar identificadores (`/^[a-z0-9-]{1,64}$/`) ou extrair IDs de URLs (`/\/(\d+)\/?$/`).
- **Unicode `NFD` e Diacríticos:** forma de decompor caracteres acentuados (`á` -> `a` + `´`) para comparar palavras ignorando acentos.
- **Programação Dinâmica & Distância de Damerau-Levenshtein:** técnica algorítmica que resolve um problema grande guardando respostas intermediárias numa tabela para medir quantas edições (inserção, remoção, troca ou inversão de duas letras vizinhas como `pikahcu`) separam duas palavras.
- **`Int32Array` & `stride`:** vetor tipado de inteiros de 32 bits em bloco único contínuo na RAM onde a tabela 2D `(m+1) x (n+1)` é acessada por `i * stride + j`, evitando desperdício de memória.
- **`Map<K, V>` & `Set<T>`:** estruturas de dicionário (chave-valor) e conjunto único com acesso por chave em tempo constante **$O(1)$**.
- **Big-O Notation ($O(1)$, $O(N)$, $O(N^2)$):** forma matemática de medir como o tempo de um algoritmo cresce quando a quantidade $N$ de dados aumenta — $O(1)$ (instantâneo/constante), $O(N)$ (cresce junto com a lista), $O(N^2)$ (quadrático, explode em listas grandes).

---

## 3. Front-end Moderno (Angular 22), CSS 3D, Hardware e Acessibilidade

- **SPA (*Single-Page Application*):** site que carrega uma casca HTML única e troca de telas instantaneamente via JavaScript sem piscar a tela recarregando o documento inteiro do servidor.
- **Standalone Components:** padrão moderno do Angular onde cada componente declara suas próprias dependências diretamente no `@Component({ imports: [...] })`, dispensando os antigos `NgModule` burocráticos.
- **Signals (`signal()`, `computed()`):** caixas de memória reativas superleves que avisam exatamente o pedacinho da tela que precisa atualizar quando um valor muda.
- **Zoneless & `ChangeDetectionStrategy.OnPush`:** antigamente o Angular usava `Zone.js` para vigiar cada clique e timer do navegador inteiro o tempo todo. Sem `Zone.js` (*Zoneless*) + `OnPush` + *Signals*, a interface só redesenha quando um dado reativo ou evento realmente muda — muito mais rápido e com menos bateria gasta.
- **Lazy Loading (`loadComponent`, `import()`, `@defer`):** só baixar da rede o código de uma tela (como `/museu`), de uma biblioteca pesada (`socket.io-client`, `@simplewebauthn/browser`) ou de um motor 3D no instante em que o usuário realmente abrir aquilo.
- **Route Guard (`authGuard`) & HTTP Interceptor (`authInterceptor`):** o Guard protege a entrada de uma rota no navegador; o Interceptor intercepta toda requisição HTTP saindo do Angular (ex.: para enviar cookies e renovar sessão quando expira).
- **Diretiva Angular (`[pvRequiresTrainer]`, `[pvRpgFocusable]`, `[pvMainHeading]`):** superpoderes anexados diretamente a tags HTML para aplicar comportamento (cadeado de visitante, registro de navegação RPG, foco acessível) sem sujar o serviço com buscas manuais no DOM.
- **Dependency Injection (DI):** em vez de cada componente fabricar seus próprios serviços com `new`, o framework entrega os serviços compartilhados prontos via `inject(...)`.
- **Espaço de Cor `oklch(L C H)`:** sistema moderno de cores baseado na visão humana (**L**uminosidade, **C**roma/Saturação, **H**ue/Matiz), permitindo criar reflexos metálicos suaves sem faixas cinzentas desbotadas.
- **CSS `@layer`, `@container` e `@property`:** `@layer` define ordem rígida de prioridade entre blocos CSS sem `!important`; `@container` adapta um cartão ao seu próprio tamanho interno (e não ao tamanho da janela); `@property` registra variáveis animáveis (como `--luz-x` e `--luz-y` do reflexo metálico).
- **`preserve-3d` & `backface-visibility: hidden`:** propriedades CSS que permitem montar uma tampa de dois lados no espaço 3D e esconder automaticamente o verso quando o cartão gira além de 90°.
- **Reflow, Repaint & GPU Compositing:** *Reflow* recalcula posições na página (caro!); *Repaint* repinta pixels; *GPU Compositing* anima `transform` e `opacity` direto na placa de vídeo a 60–120 FPS sem travar o processador.
- **Core Web Vitals (LCP, CLS, INP):** as 3 notas oficiais do Google para experiência do usuário — **LCP** (tempo até o conteúdo principal aparecer), **CLS** (quanto a tela "pula" enquanto carrega) e **INP** (rapidez da resposta ao seu clique).
- **`FpsWatchdog` & Perfis (`ULTRA` / `BALANCED` / `LITE`):** detector de hardware em `quality.store.ts` que mede RAM, núcleos, WebGL2 e queda real de quadros por segundo durante animações para desligar efeitos pesados em aparelhos modestos.
- **WCAG 2.2 AA, WAI-ARIA, `<dialog>` e `inert`:** padrão internacional de acessibilidade (**WCAG**), atributos que descrevem estados para leitores de tela (**ARIA**), tag nativa moderna de modais (`<dialog>`) e atributo `inert` (bloqueia clique, Tab e leitura na face oculta da Pokédex sem destruí-la da animação 3D).
- **`BroadcastChannel`:** canal nativo do navegador que permite uma aba avisar outras abas abertas do mesmo site imediatamente (ex.: *"o usuário acabou de fazer login ou logout"*).

---

## 4. Back-end (NestJS 11), HTTP, APIs e Tempo Real

- **API REST (*Representational State Transfer*):** jeito padronizado de o front-end conversar com o back-end usando endereços (URLs como `/api/v1/pokedex/slots/0`) e verbos HTTP (`GET` ler, `POST` criar/executar, `PUT` gravar/substituir, `DELETE` apagar).
- **BFF (*Backend-for-Frontend*) & Proxy Same-Origin:**
  - *Para iniciantes:* em vez de expor senhas, tokens e regras direto no navegador ou chamar 5 servidores diferentes de domínios estranhos, o front-end conversa com um único servidor "guarda-costas" hospedado sob o **mesmo domínio** (via Cloudflare Pages Functions). Isso blinda os cookies de login e simplifica o navegador.
- **Controller, Service, Pipe, Guard, Middleware, Exception Filter:**
  - **Middleware (`CorrelationMiddleware`):** primeiro passo na entrada; carimba um ID de rastreamento na requisição.
  - **Guard (`CsrfOriginGuard`, `ThrottlerGuard`, `SessionAuthGuard`):** porteiros que decidem *"pode passar ou barra agora?"* (origem segura, limite de velocidade e sessão válida).
  - **Pipe (`ZodValidationPipe`):** alfândega que confere e converte os dados da entrada antes do Controller.
  - **Controller:** recepcionista fino que recebe os dados já limpos e chama o Service.
  - **Service:** especialista que aplica as regras de negócio.
  - **Exception Filter (`GlobalExceptionFilter`):** rede de proteção que captura qualquer erro inesperado e devolve resposta segura sem mostrar detalhes internos do servidor.
- **HTTP Status Codes principais do projeto:**
  - `200 OK` (sucesso), `201 Created` (criado), `204 No Content` (sucesso sem corpo, ex.: delete/logout);
  - `400 Bad Request` (dados inválidos), `401 Unauthorized` (não autenticado), `403 Forbidden` (proibido / CSRF / precisa MFA), `404 Not Found` (não existe);
  - `409 Conflict` (conflito de regra de negócio — ex.: tentar salvar o mesmo Pokémon em outro slot no servidor!), `413 Payload Too Large` (corpo acima de `64kb`), `429 Too Many Requests` (rate limit estourado);
  - `500` (erro interno), `502 Bad Gateway` / `503 Service Unavailable` (proxy não alcançou a API ou dependência indisponível).
- **WebSocket (Socket.IO) & Handshake:** conexão aberta bidirecional contínua (diferente do HTTP que abre e fecha a cada pedido). Começa com um aperto de mão (*handshake*) validando origem e limites por IP para empurrar o ticker de eventos em tempo real para o navegador.
- **Fallback / Modo Degradado:** plano B automático quando algo cai — se a PokéAPI cair, o Redis serve a cópia reserva de 7 dias; se a nossa API inteira cair, o Angular busca direto na PokéAPI pública para o visitante não ficar na mão.

---

## 5. Banco de Dados Relacional (PostgreSQL, Neon, Prisma e S3)

- **RDBMS (Banco Relacional / PostgreSQL):** banco estruturado em tabelas rigorosas ligadas por chaves estrangeiras, onde a consistência dos dados é prioridade absoluta.
- **ORM (*Object-Relational Mapping* — Prisma 6.19):** tradutor que gera clientes TypeScript tipados a partir do `schema.prisma`, convertendo comandos JS seguros em SQL parametrizado contra *SQL Injection*.
- **Schema & Migration:** `schema.prisma` é a planta baixa atual do banco; *migrations* (`migration.sql`) são o histórico passo a passo de reformas aplicadas com segurança na produção sem apagar dados existentes.
- **ACID (*Atomicity, Consistency, Isolation, Durability*):** garantia matemática de transações em bancos relacionais: tudo dentro de `$transaction` ou acontece **100% junto** (ex.: gravar slot + criar evento Outbox) ou **nada** acontece se houver falha no meio.
- **Primary Key (UUID) & Foreign Key (`onDelete: Cascade`):** `UUID` é um identificador único universal de 128 bits quase impossível de adivinhar ou colidir; `onDelete: Cascade` garante que, ao apagar a conta do treinador (LGPD), todos os slots, tokens e passkeys ligados a ele sumam automaticamente em cascata.
- **Unique Constraint (`P2002`):** trava no próprio banco impedindo dois registros duplicados (ex.: dois treinadores com o mesmo e-mail, ou `[trainerId, slotIndex]` repetido). `P2002` é o código de erro que o Prisma retorna quando alguém tenta violar essa unicidade.
- **Problema N+1 & Projeção Estrita (`select`):** fazer 1 query para listar $N$ itens e depois $N$ queries extras num loop para buscar detalhes de cada item destrói a performance. Resolve-se trazendo relações num único join (`include`/`select`) e listando exatamente os campos desejados (nunca `SELECT *` trazendo senhas ou JSONs gigantes).
- **Índice Composto & Índice Parcial (`WHERE "status" = 'PENDING'`):** um índice é como o índice remissivo no fim de um livro (acha sem ler todas as páginas). O **índice parcial** indexa apenas as linhas pendentes da fila Outbox, mantendo o índice minúsculo na RAM mesmo depois de milhões de eventos já publicados.
- **CTE (*Common Table Expression* — `WITH claimed AS (...)`):** subconsulta SQL nomeada que permite encadear seleção com trava e atualização num único comando atômico.
- **Connection Pooling (`DATABASE_URL` vs. `DATABASE_URL_UNPOOLED`):** no Postgres serverless (**Neon**), o endereço *pooled* (via PgBouncer) reaproveita conexões rápidas para centenas de requisições simultâneas da API; já as *migrations* pré-deploy exigem a URL *unpooled* (direta) para travas de schema DDL funcionarem corretamente.
- **Object Storage (MinIO / `pgsty/silo` / S3) & Presigned URLs:** armazenamento próprio para arquivos binários pesados (futuras ROMs e save states do Arcade), acessados via links temporários assinados sem sobrecarregar o banco nem o servidor NestJS.

---

## 6. Cache Distribuído, Concorrência e Mensageria (Redis 7 e Kafka)

- **Redis (*In-Memory Data Store*):** banco chave-valor que mora na memória RAM (respostas em poucos milissegundos), usado para sessões, OTPs, contadores de limite, travas de idempotência e cache da PokéAPI.
- **Cache `HIT`, `MISS` e `STALE` (`stale-fallback`):**
  - `HIT`: achou no Redis (rápido, não incomoda a PokéAPI).
  - `MISS`: não tinha no Redis ainda -> busca na PokéAPI e grava com **TTL** (*Time-To-Live*, validade de 24h) + cópia reserva de 7 dias (`:stale`).
  - `STALE`: a cópia de 24h venceu *e* a PokéAPI está fora do ar -> devolve a cópia reserva de até 7 dias para o usuário não ver erro.
- **AOF (*Append-Only File*):** modo de persistência no Redis que anota comandos de escrita em disco para sobreviver a reinícios locais.
- **Rate Limiting / Throttling:** freio automático que limita quantas requisições um IP/usuário pode disparar por minuto (protege contra ataques de força bruta e abuso de recursos).
- **Race Condition (Condição de Corrida) & TOCTOU (*Time-of-Check to Time-of-Use*):**
  - *Para iniciantes:* imagine que só sobra **1 ingresso** no estoque. Duas pessoas checam ao mesmo tempo (`GET -> ainda tem 1!`), e as duas compram (`SET -> 0`), vendendo o mesmo ingresso duas vezes! Esse intervalo entre *checar* e *usar* é o bug **TOCTOU**.
- **Atomicidade com Lua Script (`INCR` + `EXPIRE`) & `GETDEL`:** o Redis executa um único comando por vez em sua thread principal. Rodar um script **Lua** dentro do servidor Redis garante que "incrementar contador + definir validade" aconteçam juntos sem ninguém se meter no meio. Já o **`GETDEL`** lê e apaga um desafio temporário (OAuth/Passkey) numa operação indivisível de uso único.
- **Event-Driven Architecture & Kafka / Redpanda:** arquitetura onde serviços emitem fatos ocorridos (*"treinador cadastrado"*, *"slot salvo"*) para um barramento de mensagens (**Broker**) organizado em **Tópicos** e consumido por **Consumer Groups** de forma assíncrona. (**Redpanda** é um broker compatível com protocolo Kafka em C++, muito leve para rodar localmente em Docker; na nuvem usamos **Aiven Kafka**).
- **At-Least-Once Delivery & Dual-Write Problem:** se você salvar no PostgreSQL e depois tentar publicar no Kafka, e o servidor cair no meio desses dois passos, um fica salvo e o outro se perde (*Dual-Write*). Além disso, brokers garantem entrega *pelo menos uma vez* (*at-least-once*), podendo entregar uma mensagem repetida em reconexões.
- **Transactional Outbox + `FOR UPDATE SKIP LOCKED` + Atomic Lease:**
  - Gravamos o dado de negócio e o evento na tabela `OutboxEvent` **na mesma transação ACID do Postgres**.
  - Um worker (`OutboxRelayService`) faz o **Atomic Lease** usando CTE SQL (`FOR UPDATE SKIP LOCKED` acoplado a `UPDATE "OutboxEvent" SET "processedAt" = NOW() ... RETURNING`): réplicas concorrentes nunca pegam a mesma linha e o lease expira em 60s se uma máquina travar.
- **Idempotência (`SET NX` + Rollback no `catch`):** garantia de que processar o mesmo evento 2 ou 10 vezes produza o mesmo efeito de 1 vez só. O consumidor grava uma trava no Redis com `SET NX` (só grava se não existir); se falhar ao enviar o e-mail no meio, o `catch` **remove a trava** para que o retry futuro tente de novo de verdade.
- **Exponential Backoff & DLQ (*Dead Letter Queue*):** esperar tempos crescentes entre tentativas em falhas temporárias; se falhar todas as vezes (ou o dado estiver corrompido), isolar o evento na fila morta (`pokeverse.dlq.v1`) para análise sem travar a fila principal.

---

## 7. Segurança da Informação (AppSec), Autenticação (IAM) e LGPD

- **OWASP Top 10:** lista mundial das 10 falhas de segurança mais perigosas em sistemas web (injeção, quebra de controle de acesso, exposição de dados, falhas criptográficas, etc.).
- **Sessão Opaca BFF vs. JWT no `localStorage`:**
  - *Explicação:* guardar um **JWT** no `localStorage` permite que qualquer script invasor (XSS) roube o token, além de ser difícil cancelar o token imediatamente se o usuário clicar em "Sair de outros dispositivos". Aqui usamos **Sessão Opaca** (um código aleatório sem significado visível guardado no Redis) entregue em cookie **`HttpOnly`** (o JavaScript nem consegue ler!), **`Secure`** (só trafega em HTTPS) e **`SameSite`** (protege contra envio em sites terceiros).
- **Máquina de Sessão (`MFA_PENDING` -> `AUTHENTICATED`) & Refresh Token Rotation:** quando quem tem 2FA acerta a senha, ganha uma sessão temporária `MFA_PENDING` que só dá acesso à tela de verificar o 2FA — só vira `AUTHENTICATED` após o segundo fator. Ao renovar a sessão, o Refresh Token antigo é invalidado (*rotation*); se alguém tentar reusá-lo (sinal de roubo!), toda a **família de sessões** é derrubada na hora!
- **Argon2id & Dummy Hash (Anti-Timing Attack):** algoritmo moderno vencedor de competições criptográficas para transformar senhas em hashes lentos de quebrar por força bruta. No login com e-mail inexistente, calculamos um *hash falso* (*dummy hash*) para gastar exatamente o mesmo tempo, impedindo um invasor de descobrir quais e-mails têm conta pelo tempo de resposta.
- **OTP (*One-Time Password*), MFA/2FA & TOTP (RFC 6238):** OTP é código temporário de 6 dígitos enviado por e-mail; **MFA** (*Multi-Factor Authentication*) exige mais de uma prova de identidade (algo que você sabe = senha + algo que você tem = celular/biometria); **TOTP** gera códigos de 6 dígitos a cada 30 segundos em apps como Google Authenticator/Authy (além de 8 *backup codes* de emergência).
- **WebAuthn / Passkeys (FIDO2):** login sem senha por biometria ou PIN do aparelho usando **criptografia assimétrica** (chave privada nunca sai do dispositivo; o servidor só guarda a chave pública e envia um desafio *challenge* único consumido via `GETDEL`). Imune a *phishing*!
- **OAuth 2.0 com PKCE & OIDC (`id_token` / JWKS):** fluxo seguro de "Entrar com Google". O **PKCE** (*Proof Key for Code Exchange*) cria um segredo dinâmico por login (`code_verifier` / `code_challenge`) para ninguém roubar o código na volta; o servidor também valida criptograficamente a assinatura JWT do Google (**OIDC** via chaves públicas **JWKS**) e impede *Account Takeover* exigindo verificação se já existir conta local sem vínculo.
- **AES-256-GCM:** cifra simétrica **autenticada** padrão militar que protege segredos TOTP e payloads de e-mail com PII dentro do Outbox — garante confidencialidade e detecta se alguém adulterou o texto cifrado.
- **CSRF (*Cross-Site Request Forgery*) & `Sec-Fetch-Site`:** ataque em que um site malicioso engana o navegador do usuário para disparar cliques ocultos no nosso site levando o cookie junto. O `CsrfOriginGuard` barra isso checando os cabeçalhos de origem e `Sec-Fetch-Site`.
- **CORS, CSP e XSS:**
  - **CORS:** regra do navegador dizendo quais sites podem ler respostas da nossa API (controlado por `CORS_ORIGINS`).
  - **CSP (*Content Security Policy*):** lista branca rigorosa em [`_headers`](../../apps/web/public/_headers) proibindo execução de scripts injetados de fora ou inline.
  - **XSS (*Cross-Site Scripting*):** invasão por injeção de código JS malicioso na tela — neutralizada com templates seguros, zero `innerHTML` e CSP estrito.
- **Mass Assignment:** ataque em que o invasor manda campos ocultos extras no JSON (ex.: `"badgesCount": 999`) esperando que o servidor salve tudo sem filtrar; bloqueado por `.strict()` no Zod.
- **Fail-Fast Env Validation:** se faltar alguma configuração crítica na subida (`env.schema.ts`), a API desliga imediatamente em vez de subir insegura, e **nunca** imprime os valores das variáveis no erro.
- **LGPD (Lei Geral de Proteção de Dados):** consentimento de cookies versionado (`pokeverse_consent`), opt-in estrito antes de gravar preferências, portabilidade completa em JSON (`GET /auth/me/export`), exclusão em cascata irreversível (`DELETE /auth/me`) e expurgo automático a cada 6 horas de tokens expirados.

---

## 8. Infraestrutura, Containers, Observabilidade, Testes e CI/CD

- **Docker, Container, Multi-Stage Build & Non-Root User:**
  - *Para iniciantes:* em vez de depender de o computador de todo mundo ter as mesmas versões instaladas, o Docker empacota a aplicação numa "caixinha fechada" idêntica em qualquer lugar.
  - No [`api.Dockerfile`](../../infra/docker/api.Dockerfile), o **Multi-Stage Build** compila numa caixa com ferramentas pesadas e depois copia só o resultado enxuto para a caixa final rodando como usuário comum `node` (sem poder de administrador `root`).
- **Docker Compose:** orquestrador local ([`docker-compose.yml`](../../infra/docker/docker-compose.yml)) que sobe os 7 serviços de apoio (Postgres, Redis, Redpanda, Console, S3 `silo`, Mailpit) com um único comando (`npm run infra:up`).
- **Liveness Probe (`/health/live`) vs. Readiness Probe (`/health/ready`):**
  - *Liveness:* *"O processo está travado ou vivo?"* (se falhar, a nuvem reinicia o container).
  - *Readiness:* *"O servidor está vivo E consegue falar com Postgres, Redis e Kafka agora?"* (se falhar, para de mandar novos usuários para ele até estabilizar).
- **Observabilidade (Logs JSON, Tracing `x-correlation-id` / `traceparent`):** em vez de `console.log` solto difícil de filtrar, cada ocorrência gera um JSON padronizado com `timestamp`, `level`, `trace_id` (seguindo W3C `traceparent`) e máscara automática de segredos (`StructuredLoggerService`), permitindo seguir uma requisição do navegador até o consumidor Kafka.
- **Pirâmide de Testes (Vitest, Jest, Supertest, Integração Real):**
  - **Unitários (104 testes):** testam funções e serviços isolados em milissegundos (`Vitest` no shared/web, `Jest` na API).
  - **E2E de Borda HTTP (11 testes):** sobem o NestJS inteiro com `Supertest` para testar CSP, `413`, CSRF, pipes Zod e estados de sessão.
  - **Integração Real (3 testes):** rodam no CI contra **Postgres 16, Redis 7 e Kafka 3.9 de verdade** sem mocks.
- **Chrome Headless & CDP (*Chrome DevTools Protocol*):** navegador Chrome rodando invisível sem janela, controlado por código em [`scripts/ui-quality-gate.mjs`](../../scripts/ui-quality-gate.mjs) para tirar medições reais de pixel, contraste WCAG AA e overflow em desktop e celular.
- **CI/CD (*Continuous Integration / Continuous Deployment*):** robôs no GitHub Actions que a cada código enviado verificam segredos (**Gitleaks**), vulnerabilidades de dependências (`npm audit`), tipos, estilo (**ESLint/Prettier**), testes, visual (**CDP**) e vulnerabilidades de container (**Trivy**), só então publicando na nuvem (**Cloudflare Pages** + **Azure Container Apps**).
- **TLS & mTLS (*Mutual TLS*):** criptografia de tráfego na rede (**TLS** / cadeado HTTPS); no **mTLS** usado com a **Aiven Kafka**, *tanto* o cliente quanto o servidor apresentam certificados digitais um ao outro para provar identidade mútua.

---

<p align="center">
  <a href="02-linguagens-estruturas-de-dados-e-pacote-shared.md">Anterior: Vol. 02 (Linguagens, Estruturas &amp; Shared)</a>
  &nbsp;·&nbsp;
  <a href="../capitulo-01-guia-de-estudos-pokedex.md">Voltar ao Índice do Capítulo 01</a>
</p>
