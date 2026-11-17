# 10 — Infraestrutura Docker, Observabilidade e Deploy

## 1. Ambiente Local Unificado (`infra/docker/docker-compose.yml`)

Com um único comando (`docker compose -f infra/docker/docker-compose.yml up -d`), toda a infraestrutura distribuída sobe localmente configurada e com verificações de saúde (`healthcheck`):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: pokeverse-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-pokeverse}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pokeverse_dev}
      POSTGRES_DB: ${POSTGRES_DB:-pokeverse}
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-pokeverse} -d ${POSTGRES_DB:-pokeverse}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: pokeverse-redis
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  redpanda:
    image: redpandadata/redpanda:v24.2.4
    container_name: pokeverse-redpanda
    command:
      - redpanda
      - start
      - --kafka-addr internal://0.0.0.0:9092,external://0.0.0.0:19092
      - --advertise-kafka-addr internal://redpanda:9092,external://localhost:19092
      - --pandaproxy-addr internal://0.0.0.0:8082,external://0.0.0.0:18082
      - --advertise-pandaproxy-addr internal://redpanda:8082,external://localhost:18082
      - --smp 1
      - --memory 1G
      - --mode dev-container
    ports:
      - "19092:19092"
      - "18082:18082"
    volumes:
      - redpanda_data:/var/lib/redpanda/data
    healthcheck:
      test: ["CMD-SHELL", "rpk cluster health | grep -E 'Healthy:.+true'"]
      interval: 10s
      timeout: 5s
      retries: 10

  redpanda-console:
    image: redpandadata/console:v2.7.2
    container_name: pokeverse-redpanda-console
    depends_on:
      redpanda:
        condition: service_healthy
    environment:
      KAFKA_BROKERS: redpanda:9092
    ports:
      - "8080:8080"

  minio:
    image: minio/minio:latest
    container_name: pokeverse-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-pokeverse_minio}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-pokeverse_minio_dev}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio-init:
    image: minio/mc:latest
    container_name: pokeverse-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${MINIO_ROOT_USER:-pokeverse_minio} ${MINIO_ROOT_PASSWORD:-pokeverse_minio_dev};
      mc mb -p local/pokeverse-roms || true;
      mc mb -p local/pokeverse-saves || true;
      mc anonymous set none local/pokeverse-roms;
      mc anonymous set none local/pokeverse-saves;
      exit 0;
      "

volumes:
  pg_data:
  redis_data:
  redpanda_data:
  minio_data:
```

---

## 2. Padrão de Containers em Produção (Dockerfiles)

Todos os serviços empacotados em container (`apps/api`, Workers, Web SSR/Nginx) seguem rigorosamente:
1. **Multi-Stage Build:** etapa `builder` instala dependências e compila TypeScript; etapa `runner` copia apenas o artefato compilado e dependências de produção sobre base mínima (`node:22-alpine` ou `distroless`).
2. **Execução sem privilégios de `root`:** usuário e grupo dedicados (`USER node` / `appuser`) com permissões mínimas de escrita.
3. **`HEALTHCHECK` nativo no Dockerfile** apontando para `/health/live`.
4. **12-Factor App:** configuração integral via variáveis de ambiente (`.env` fora do repositório) e processos *stateless*.
5. **Graceful Shutdown:** tratamento de sinais `SIGTERM` e `SIGINT` para drenar conexões HTTP/WebSocket, concluir mensagens em voo no Kafka com *commit* limpo de offsets e encerrar conexões Prisma/Redis.

---

## 3. Observabilidade & SRE (Os 3 Pilares)

### 3.1. Logs Estruturados em JSON
Proibido `console.log("erro no usuario " + id)` em texto solto. Toda aplicação emite JSON estruturado com campos padronizados (via `pino` / Logger customizado):
- `timestamp`, `level`, `service_name`, `trace_id`, `span_id`, `error_code`, `message` — mascarando e nunca registrando senhas, tokens JWT, cookies ou PII sensível.

### 3.2. Distributed Tracing (**OpenTelemetry**)
- Instrumentação automática HTTP, Prisma, Redis e Kafka com **OpenTelemetry (OTel)**.
- Propagação explícita do cabeçalho **W3C Trace Context (`traceparent`)** através de chamadas HTTP, eventos gravados em `OutboxEvent`, mensagens Kafka e notificações WebSocket, permitindo rastrear uma ação do usuário do clique no Angular até o processamento assíncrono em Worker.

### 3.3. Métricas RED/USE e Probes de Saúde Distintos
- **Métricas RED (APIs/Consumers):** *Rate* (req/s), *Errors* (5xx / DLQ rate) e *Duration* (latência `p50`, `p95`, `p99`).
- **Métricas USE (Infraestrutura):** *Utilization*, *Saturation* (fila do `OutboxEvent` e *consumer lag* no Kafka) e *Errors*.
- **Separação rigorosa de Health Checks:**
  - `GET /health/live`: responde `200` enquanto o event loop do Node/NestJS estiver responsivo (usado pelo orquestrador para reiniciar travamentos).
  - `GET /health/ready`: valida ativamente conectividade com PostgreSQL, Redis, Redpanda e MinIO/S3 (usado pelo Load Balancer para liberar tráfego apenas quando as dependências estão saudáveis).

---

## 4. Topologia Cloud 100% Gratuita (Free Tiers + Benefícios de Estudante) e CI/CD

Para publicar a plataforma Full-Stack completa sem custo mensal fixo, a arquitetura combina **Free Tiers permanentes** (sem expiração de 30 dias) com **créditos do GitHub Student Developer Pack / e-mail acadêmico**:

```mermaid
flowchart LR
  User["Navegador Desktop & Mobile (Angular + WebGL2 + WASM)"] -->|"HTTPS / CDN Ilimitada"| CF["Cloudflare Pages / Vercel Hobby (apps/web)"]
  User -->|"HTTPS REST + WSS"| APIHost["Azure for Students / Heroku Student / OCI ARM / Render (apps/api + Workers)"]
  APIHost --> Neon[("Neon Serverless Postgres (Free Permanente)")]
  APIHost --> Upstash[("Upstash Redis (Free Permanente)")]
  APIHost --> Aiven[["Aiven Apache Kafka Free (5 Tópicos / Sem Cartão)"]]
  APIHost --> R2[("Cloudflare R2 (10 GB Free + $0 Egresso)")]
  User -->|"Presigned URL 60s"| R2
```

### Matriz de Hospedagem Custo Zero

| Camada | Provedor Gratuito Recomendado | Benefício / Limite Atual | Notas de Arquitetura |
| :--- | :--- | :--- | :--- |
| **Front-end Angular + WASM** | **Cloudflare Pages** (ou **Vercel Hobby**) | Gratuito permanente; banda estática ilimitada no Cloudflare Pages | *Cloudflare for Students* também isenta `$5/mês` do Workers Paid por 12 meses |
| **PostgreSQL** | **Neon** (ou **Supabase**) | Free Tier permanente sem cartão | Evitar Postgres gratuito do Render porque expira após 30 dias |
| **Redis** | **Upstash Redis** | Free Tier serverless permanente sem cartão | Ideal para cache da PokéAPI, sessões anti-cheat e *Sorted Sets* |
| **Storage ROMs & Saves** | **Cloudflare R2** | `10 GB` grátis sempre com **`$0` de taxa de tráfego (egress)** | Compatível com SDK S3; impede cobranças por downloads repetidos de ROMs |
| **Apache Kafka** | **Aiven for Apache Kafka Free** (ou **CloudAMQP Free** se optar por AMQP) | Até `5` tópicos (`2` partições cada, retenção `3d`) sem cartão | Tópicos consolidados em `4` de domínio + `1` DLQ unificada (ver [doc 06](06-cache-redis-e-eventos-kafka.md)) |
| **Back-end NestJS + Workers** | **Azure for Students** / **Heroku Student Pack** / **Oracle Always Free** / **Render Free** | Azure: `$100` por 12m sem cartão; Heroku Student: `$13/mês` por 24m; Oracle: VM ARM Always Free; Render: 750h/mês com *spin-down* 15m | Azure/Heroku Student mantêm WebSockets ativos 24/7 sem hibernação; DigitalOcean/Fly/Koyeb não possuem mais free tier equivalente |
| **Domínio Customizado** | **Namecheap / Name.com** (GitHub Student Pack) | `1` ano gratuito (`.me` ou `.tech`) | HTTPS automático via Cloudflare DNS |

### Pipeline CI/CD & Performance Release Gates (GitHub Actions)
- **Trigger em Pull Requests para `main` (portões obrigatórios de bloqueio descritos em [doc 11](11-performance-hardware-gates-e-mobile.md)):**
  1. `lint` + validação de formatação + checagem de vulnerabilidades;
  2. `typecheck` compartilhado (`packages/shared`, `apps/web`, `apps/api`) + verificação de orçamentos de bundle;
  3. Testes unitários, de integração com Postgres/Redis (contagem anti-N+1 + `EXPLAIN ANALYZE`) e suíte Playwright (FPS mobile + zero vazamento WebGL);
  4. **Lighthouse CI (perfil mobile lento)** + teste de carga **`k6`** e resiliência — qualquer regressão acima dos SLOs **reprova automaticamente o build e bloqueia o deploy até refatoração**.
- **Trigger em Merge na `main`:**
  - Executa migrations seguras do Prisma (`prisma migrate deploy`), atualiza container da API/Workers e publica nova versão do front-end validando `/health/ready`.
