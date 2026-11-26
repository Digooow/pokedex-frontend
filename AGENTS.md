# PokéVerse — Regras Inegociáveis do Repositório

Diretrizes aplicadas a todo agente ou subagente atuando neste workspace (precedência máxima no projeto). O contrato normativo detalhado de arquitetura, padrões de código e combate a *AI slop* está documentado em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), e o catálogo de regras SonarQube/ESLint/acessibilidade em [docs/21-qualidade-de-codigo-sonarqube-e-regras.md](docs/21-qualidade-de-codigo-sonarqube-e-regras.md). A fila de melhorias, correções e features com **prioridade máxima** no projeto vive em [docs/00-fila-prioritaria-melhorias.md](docs/00-fila-prioritaria-melhorias.md).

---

## 1. Regra Zero de UI & Fidelidade Visual

1. **Nenhuma substituição ou simplificação silenciosa:**
   - **NUNCA** substitua, simplifique ou redesenhe um componente, tela, animação 3D, textura ou fluxo visual existente sem **validação prévia explícita do usuário**.
   - A referência visual canônica da Pokédex (originalmente construída na Fase 0 em `index.html`, `css/style.css` e `js/app.js`, já migrada e removida da raiz por desuso) vive integralmente em `apps/web/src/app/features/pokedex-device/` e `apps/web/src/styles/_pokedex-classic.scss` (+ `styles/pokedex/`). Em evoluções dentro de `apps/web`, preserve a anatomia, materiais, iluminação e física 3D de forma fiel — nunca crie versões genéricas reduzidas.
2. **Conferência visual real obrigatória (Antes × Depois):**
   - Nenhuma alteração de interface pode ser declarada como "pronta" antes de passar por **comparação visual real no navegador** (Desktop `1440×900` e Mobile `375×812`), comparando estado anterior/referência × estado atual, com **zero erros no console**, **zero falhas de rede inesperadas** e **zero overflow horizontal**.

---

## 2. Proteção do que Já Está Feito & Zero Duplicação

1. **Legado da Fase 0 Removido & Preservação de Assets:**
   - Os arquivos estáticos legados da raiz (`index.html`, `css/style.css` e `js/app.js`) foram integralmente substituídos por Angular 22 (`apps/web`), `@pokeverse/shared` e NestJS (`apps/api`) e **apagados da raiz por não serem mais utilizados** (preservados apenas no histórico Git e documentados em `docs/`). Mantenha `assets/` da raiz (galeria do `README.md`) e `apps/web/public/assets/` intactos salvo solicitação explícita.
2. **Inspeção antes de criar & DRY real:**
   - Antes de escrever novo código, verifique o que já existe em `packages/shared`, `apps/api` e `apps/web`.
   - Contratos Zod, schemas de eventos e regras de domínio ficam em `@pokeverse/shared` — nunca duplique schemas, tipos, constantes ou componentes entre front-end e back-end.
   - Nunca remova ou degrade comportamento já testado ao implementar uma nova etapa; valide com lint, `typecheck`, testes unitários, E2E e build após a última edição.
3. **Portão SonarQube & Zero Duplicação Pré-Push:**
   - Durante a escrita e refatoração de código TS/JS, HTML/Angular e CSS/SCSS, consulte e aplique proativamente a skill **`sonarqube-clean-code`** e o guia [docs/21-qualidade-de-codigo-sonarqube-e-regras.md](docs/21-qualidade-de-codigo-sonarqube-e-regras.md) para aprovação de primeira.
   - Antes de qualquer `git push`, execute `npm run audit:sonar:local` (`npm run lint` com `eslint-plugin-sonarjs`, `no-await-in-loop`, `max-params`, `prefer-optional-chain`/`prefer-readonly` e `npm run audit:duplication` com `jscpd` a `0%` + paridade estática TS/HTML/SCSS) e `npm run audit:sonar` (skill `sonarqube-quality-gate`).
   - **Tolerância zero:** qualquer issue (de qualquer severidade, inclusive `MINOR`/`INFO`), qualquer Security Hotspot `TO_REVIEW` e qualquer linha/bloco duplicado reprovam a entrega e devem ser corrigidos antes do push.

---

## 3. Princípios SOLID, Clean Code & Concorrência Distribuída (Padrão Big Tech)

Todo código novo ou refatorado neste repositório DEVE obedecer estritamente aos 5 princípios **SOLID** e às travas anti-corrida aprendidas na auditoria:

1. **S — Single Responsibility Principle (SRP):**
   - Limite de coesão: **Services/Stores até ~300 linhas** e **Componentes UI até ~150–200 linhas**. Proibido criar "God Services" que misturam autenticação, gestão de sessão, OTP, LGPD e publicação Outbox no mesmo arquivo.
2. **O — Open/Closed Principle (OCP):**
   - Novos provedores de notificação, autenticação ou métodos MFA devem ser adicionados por extensão/registro de estratégias, evitando cadeias crescentes de `if/switch`.
3. **L — Liskov Substitution Principle (LSP):**
   - Subtipos, adaptadores de transporte (`MailService`, storages) e mocks/fakes de teste devem preservar integralmente as invariantes e assinaturas do contrato base.
4. **I — Interface Segregation Principle (ISP):**
   - Exponha interfaces enxutas por caso de uso (ex.: contratos separados de leitura/emissão de sessão vs. recuperação de senha), sem forçar consumidores a depender de métodos não utilizados.
5. **D — Dependency Inversion Principle (DIP):**
   - Domínio e Services/Stores dependem de abstrações (não de APIs concretas de navegador/DOM ou detalhes internos de infra). Proibido usar `document.querySelector` / `document.querySelectorAll` dentro de services/stores de estado Angular — use diretivas declarativas e `viewChild`.
6. **Travas Obrigatórias Anti-Race Condition (Concorrência & Estado):**
   - **Zero efeito externo pré-constraint:** nunca grave ou apague chaves no Redis (ex.: OTP) antes de o `INSERT`/`UPDATE` com constraint `UNIQUE` no PostgreSQL confirmar sucesso; erros `P2002` jamais podem apagar estado pertencente a outro usuário.
   - **Zero TOCTOU em contadores de segurança:** contadores de tentativas/bloqueio (login, OTP, MFA, rate limit) DEVEM ser incrementados atomicamente no Redis via `INCR` + `EXPIRE` (Lua script), nunca por leitura seguida de escrita (`get` + `set`).
   - **Rollback de idempotência em consumidores Kafka:** nunca mantenha lock `SET NX` gravado quando o efeito colateral (envio de e-mail, persistência ou broadcast) lançar exceção transiente; libere o lock no `catch` antes de relançar para retry/DLQ.
   - **Atomic Lease no Transactional Outbox:** `FOR UPDATE SKIP LOCKED` só tem validade dentro da transação; reivindique lotes com `UPDATE ... RETURNING` (lease em `processedAt`) para evitar processamento duplicado entre réplicas concorrentes.
7. **Shift-Left, SoC & Repositórios Isolados ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):**
   - **Controllers puros & Infraestrutura subordinada ao Domínio:** Controllers apenas validam entrada na borda (`ZodValidationPipe`), chamam Services de negócio e retornam status codes HTTP; nenhuma regra de negócio existe em Controllers.
   - **Repositórios Isolados:** consultas diretas via Prisma (`select`, joins `include`, transações) não devem poluir Services de negócio — isole o acesso a dados em Repositórios/Adaptadores dedicados.
   - **Backend Stateless & Arquivos em MinIO/S3:** sessões/OTPs/contadores transitórios vivem no Redis; imagens, ROMs e saves pesados trafegam exclusivamente via URLs geradas no MinIO/S3, nunca armazenados como blobs no PostgreSQL.
8. **Performance SQL & Paginação Obrigatória (Zero N+1):**
   - **Tolerância zero para N+1:** buscas relacionais usam inclusões/joins nativos do Prisma em uma única ida ao banco, com projeção estrita (`select`) e índices planejados.
   - **Paginação desde a v1:** todo endpoint REST de listagem exige paginação obrigatória (`limit`/`offset` com teto validado no DTO, ou cursor/keyset para rankings/feeds).
9. **Clean Code Anti-AI Slop & Entregas Atômicas (Ciclos de 5 Prompts):**
   - **Nomenclatura Ubíqua & Zero Valores Mágicos:** reflita o domínio com precisão (proibido `dataHandler`, `processor`, `temp`); use Enums ou constantes tipadas.
   - **Early Returns:** proibido `if/else` em formato de flecha; valide erros no topo com *Guard Clauses* e mantenha o caminho feliz em linha reta vertical no final da função.
   - **Atomicidade & Zero Boilerplate:** faça alterações enxutas, declarativas e focadas (suportando sessões curtas de até 5 prompts seguidos de `git commit`), sem código gerativo prolixo.

---

## 4. Sincronização Obrigatória de Documentação e `README.md`

1. **Documentação Viva no Mesmo Ciclo:**
   - **Toda** implementação de funcionalidade, refatoração estrutural/arquitetural, mudança de contratos/endpoints/scripts/testes/bundle ou remoção de código/arquivos no projeto **DEVE** atualizar, na mesma entrega, o [`README.md`](README.md), o [`docs/14-status-e-changelog-implementacao.md`](docs/14-status-e-changelog-implementacao.md) e **todos os guias temáticos impactados em [`docs/`](docs/)** (conferência cruzada obrigatória em [`docs/04`](docs/04-backend-nestjs-auth-e-seguranca.md), [`docs/06`](docs/06-cache-redis-e-eventos-kafka.md), [`docs/10`](docs/10-infraestrutura-docker-ci-cd-e-deploy.md) e [`docs/13`](docs/13-dossie-de-seguranca-e-blindagem.md)).
   - É proibido encerrar uma tarefa deixando tabelas de "lacunas abertas", diagramas ou descrições de fases antigas em contradição com o código atual, ou com `README.md`/`docs/` defasados em relação à árvore de arquivos, rotas HTTP/WS, métricas de testes/bundle, comandos CLI ou dívidas técnicas.
