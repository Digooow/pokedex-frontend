## Resumo e Cluster de Aproximacao (1 <-> 2 <-> 3)

- **Domínio(s) afetado(s):** (ex.: `@pokeverse/shared`, `apps/api`, `apps/web`, `infra/`)
- **Upstreams (Contratos/Schemas):**
- **Alvos (Services/Controllers/Stores/UI):**
- **Testes Diretos:**
- **Docs Impactados:**

---

## Checklist de Engenharia (SOLID, Clean Code e Contratos)

- [ ] `npm run typecheck` sem erros nos 3 workspaces
- [ ] `npm run lint` (`--max-warnings=0`, `complexity <= 15`, `max-depth <= 3`, `max-lines`, `max-lines-per-function`) aprovado
- [ ] `npm run format:check` aprovado
- [ ] `npm run test` (unitários + caos) e `npm run test:e2e --workspace=pokeverse-api` aprovados
- [ ] `npm run build` aprovado (bundle inicial dentro do budget)
- [ ] Limites SRP respeitados (`<= 300` linhas Services/Stores, `<= 200` linhas Componentes UI, sem comentários nem emojis fora da Fase 0)

---

## Seguranca, SQL e Concorrencia

- [ ] Toda borda externa (`@Body`, `@Query`, `@Param`, eventos WS/Kafka) validada via Zod v4 (`ZodValidationPipe`)
- [ ] Toda consulta `.findMany()` possui `take` explícito e projeção estrita (`select`) sem N+1
- [ ] Zero TOCTOU (operações atômicas Lua / `GETDEL`), zero efeito pré-constraint (`P2002`) e transações curtas

---

## Regra Zero de UI e Fidelidade Visual (quando houver alteracao em `apps/web`)

- [ ] Fase 0 estática (`index.html`, `css/`, `js/`, `assets/`) intacta
- [ ] `npm run audit:ui` aprovado sem violações
- [ ] Conferência visual real em Desktop (`1440x900`) e Mobile (`375x812`) sem erros de console, falhas de rede ou overflow horizontal

---

## Sincronizacao de Documentacao

- [ ] `README.md`, `docs/14-status-e-changelog-implementacao.md` e guias temáticos impactados em `docs/` atualizados na mesma entrega
