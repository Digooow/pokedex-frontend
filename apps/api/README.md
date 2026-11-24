# PokéVerse API (`pokeverse-api`)

Back-end **NestJS 11** da plataforma **PokéVerse OS**, projetado como **IAM Enterprise BFF** stateless sobre PostgreSQL 16 (Prisma `6.19.3`), Redis 7 (`ioredis` + scripts Lua atômicos), Apache Kafka / Redpanda (`kafkajs`) e Socket.IO.

> Documentação completa da arquitetura, contratos e segurança em [`../../README.md`](../../README.md), [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), [`../../docs/04-backend-nestjs-auth-e-seguranca.md`](../../docs/04-backend-nestjs-auth-e-seguranca.md) e [`../../docs/13-dossie-de-seguranca-e-blindagem.md`](../../docs/13-dossie-de-seguranca-e-blindagem.md).

## Camadas de Segurança e Domínio Ativas

- **Sessão BFF & Autenticação:** cookies opacos `HttpOnly` (`__Host-pokeverse_session`, `__Secure-pokeverse_refresh` com `familyId` e grace de `10s`), Argon2id com mitigação de timing, TOTP RFC 6238 cifrado em AES-256-GCM + 8 backup codes HMAC, Passkeys WebAuthn FIDO2 e Google OAuth2 OIDC (`RS256` JWKS + PKCE + `GETDEL`).
- **Guards Globais:** `CsrfOriginGuard` (`Sec-Fetch-Site`, `Origin`, `Referer`, bloqueio de `Content-Type` inseguro), `SessionAuthGuard` (`AUTHENTICATED` vs. `@AllowMfaPending()`), `RbacGuard` *deny-by-default* (`@Roles`/`@Scopes`) e `TrainerThrottlerGuard` distribuído em Redis Lua (`trainerId` / IP).
- **Persistência, Auditoria & Eventos:** `14` modelos e `5` enums no [`schema.prisma`](prisma/schema.prisma), incluindo `AuditLog` *append-only* imutável por trigger PostgreSQL (`REQ-SEC-35`), `OutboxEvent` com *atomic lease* (`UPDATE ... RETURNING`) e consumidores Kafka idempotentes com criptografia obrigatória em e-mails e rollback de lock no `catch`.
- **Proteção HTTP & Externa:** `helmet()`, `bodyParser: false` (`64kb` JSON / `16kb` URL-encoded), `ZodValidationPipe` com contratos `@pokeverse/shared` e validação anti-SSRF pós-DNS (`assertSafeOutboundUrl`) em clientes externos.

## Fonte de Dados Externa, Créditos & Fair Use (PokéAPI)

- **API de Terceiros Ativa:** os dados enciclopédicos de Pokémon são obtidos da **[PokéAPI v2](https://pokeapi.co/)** (`https://pokeapi.co/api/v2/`), projeto open-source (`BSD-3-Clause`) criado por **Paul Hallett** e mantido pela comunidade PokéAPI, com sprites/artworks de **[PokeAPI/sprites](https://github.com/PokeAPI/sprites)** e áudios de **[PokeAPI/cries](https://github.com/PokeAPI/cries)**.
- **Política de Uso Justo (*Fair Use Policy*):** [`PokeApiHttpCacheClient`](src/modules/pokedex/pokeapi-http-cache.client.ts), [`PokeApiResourceFetcher`](src/modules/pokedex/pokeapi-resource.fetcher.ts), [`PokeApiCacheService`](src/modules/pokedex/pokeapi-cache.service.ts) e [`PokedexEnrichmentService`](src/modules/pokedex/pokedex-enrichment.service.ts) cumprem a [Fair Use Policy da PokéAPI](https://pokeapi.co/docs/v2#fairuse) por meio de cache distribuído no Redis (`24h` + `7d` stale para `/catalog`, `/pokemon/:idOrName`, `/bundle`, `/encounters` e `/forms`; `7d` + `14d` stale para `/type`; cache intermediário efêmero de `24h` sem `:stale` duplicado para blobs `raw:*`), deduplicação *singleflight* em voo, validação anti-SSRF (`assertSafeOutboundUrl`), `redirect: 'error'` e *Circuit Breaker*.
- **Rotas Públicas de Leitura Pokédex (`/api/v1/pokedex`):** `GET /catalog`, `GET /pokemon/:idOrName`, `GET /pokemon/:idOrName/bundle` (com matriz defensiva `0x..4x` calculada no servidor), `GET /pokemon/:idOrName/encounters` e `GET /pokemon/:idOrName/forms`.
- **Aviso Legal:** projeto educacional e sem fins lucrativos. Pokémon e marcas correlatas pertencem a **Nintendo, Creatures Inc., Game Freak Inc. e The Pokémon Company International**, sem afiliação ou endosso oficial.

## Comandos Principais (a partir da raiz ou do workspace)

```bash
# Subir serviços locais (Postgres, Redis, Redpanda, S3, Mailpit)
npm run infra:up

# Aplicar migrações e gerar Prisma Client
npm run prisma:deploy --workspace=pokeverse-api
npm run prisma:generate --workspace=pokeverse-api

# Executar em modo desenvolvimento (porta 3000)
npm run dev:api

# Qualidade, testes unitários, E2E de borda HTTP e integração real
npm run typecheck --workspace=pokeverse-api
npm run lint --workspace=pokeverse-api
npm run test --workspace=pokeverse-api
npm run test:e2e --workspace=pokeverse-api
npm run test:integration --workspace=pokeverse-api

# Build de produção
npm run build:api
```
