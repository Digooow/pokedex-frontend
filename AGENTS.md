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
