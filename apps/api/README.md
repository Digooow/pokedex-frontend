# PokéVerse API (`pokeverse-api`)

Back-end **NestJS 11** da plataforma **PokéVerse OS**, projetado como **IAM Enterprise BFF** stateless sobre PostgreSQL 16 (Prisma `6.19.3`), Redis 7 (`ioredis` + scripts Lua atômicos), Apache Kafka / Redpanda (`kafkajs`) e Socket.IO.

> Documentação completa da arquitetura, contratos e segurança em [`../../README.md`](../../README.md), [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), [`../../docs/04-backend-nestjs-auth-e-seguranca.md`](../../docs/04-backend-nestjs-auth-e-seguranca.md) e [`../../docs/13-dossie-de-seguranca-e-blindagem.md`](../../docs/13-dossie-de-seguranca-e-blindagem.md).

## Camadas de Segurança e Domínio Ativas

- **Sessão BFF & Autenticação:** cookies opacos `HttpOnly` (`__Host-pokeverse_session`, `__Secure-pokeverse_refresh` com `familyId` e grace de `10s`), Argon2id com mitigação de timing, TOTP RFC 6238 cifrado em AES-256-GCM + 8 backup codes HMAC, Passkeys WebAuthn FIDO2 e Google OAuth2 OIDC (`RS256` JWKS + PKCE + `GETDEL`).
- **Guards Globais:** `CsrfOriginGuard` (`Sec-Fetch-Site`, `Origin`, `Referer`, bloqueio de `Content-Type` inseguro), `SessionAuthGuard` (`AUTHENTICATED` vs. `@AllowMfaPending()`), `RbacGuard` *deny-by-default* (`@Roles`/`@Scopes`) e `TrainerThrottlerGuard` distribuído em Redis Lua (`trainerId` / IP).
- **Persistência, Auditoria & Eventos:** `14` modelos e `5` enums no [`schema.prisma`](prisma/schema.prisma), incluindo `AuditLog` *append-only* imutável por trigger PostgreSQL (`REQ-SEC-35`), `OutboxEvent` com *atomic lease* (`UPDATE ... RETURNING`) e consumidores Kafka idempotentes com criptografia obrigatória em e-mails e rollback de lock no `catch`.
- **Proteção HTTP & Externa:** `helmet()`, `bodyParser: false` (`64kb` JSON / `16kb` URL-encoded), `ZodValidationPipe` com contratos `@pokeverse/shared` e validação anti-SSRF pós-DNS (`assertSafeOutboundUrl`) em clientes externos.

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
