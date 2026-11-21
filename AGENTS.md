# PokéVerse — Regras Inegociáveis do Repositório

Diretrizes aplicadas a todo agente ou subagente atuando neste workspace (precedência máxima no projeto).

---

## 1. Regra Zero de UI & Fidelidade Visual

1. **Nenhuma substituição ou simplificação silenciosa:**
   - **NUNCA** substitua, simplifique ou redesenhe um componente, tela, animação 3D, textura ou fluxo visual existente sem **validação prévia explícita do usuário**.
   - A referência visual canônica da Pokédex está na raiz ([index.html](index.html) e [css/style.css](css/style.css)). Em portas e evoluções dentro de `apps/web`, porte a anatomia, materiais, iluminação e física 3D de forma fiel — nunca crie versões genéricas reduzidas.
2. **Conferência visual real obrigatória (Antes × Depois):**
   - Nenhuma alteração de interface pode ser declarada como "pronta" antes de passar por **comparação visual real no navegador** (Desktop `1440×900` e Mobile `375×812`), comparando estado anterior/referência × estado atual, com **zero erros no console**, **zero falhas de rede inesperadas** e **zero overflow horizontal**.

---

## 2. Proteção do que Já Está Feito & Zero Duplicação

1. **Preservação da Fase 0 (GitHub Pages Estático):**
   - Nunca altere ou quebre os arquivos estáticos da raiz ([index.html](index.html), [css/style.css](css/style.css), [js/app.js](js/app.js), `assets/`) salvo solicitação explícita para editar a versão estática.
2. **Inspeção antes de criar & DRY real:**
   - Antes de escrever novo código, verifique o que já existe em `packages/shared`, `apps/api` e `apps/web`.
   - Contratos Zod, schemas de eventos e regras de domínio ficam em `@pokeverse/shared` — nunca duplique schemas, tipos, constantes ou componentes entre front-end e back-end.
   - Nunca remova ou degrade comportamento já testado ao implementar uma nova etapa; valide com lint, `typecheck`, testes unitários, E2E e build após a última edição.

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
