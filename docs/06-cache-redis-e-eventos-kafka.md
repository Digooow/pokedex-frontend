# 06 — Cache com Redis e Mensageria com Apache Kafka / Redpanda

## 1. Papel Estratégico do Redis

O **Redis** atua como camada em memória de baixíssima latência (`< 5ms`) complementar ao PostgreSQL, evitando sobrecarga na PokéAPI externa e sustentando rankings e presença online:

| Domínio | Padrão & Estrutura de Chave | Estrutura Redis | TTL / Retenção |
| :--- | :--- | :--- | :--- |
| **Cache da PokéAPI** | `pokeapi:v2:pokemon:{slugOrId}` e `pokeapi:v2:catalog` | String (JSON comprimido) | `24h` (PokéAPI é quase imutável) |
| **Presença no Overworld** | `world:presence:{mapId}` -> `{trainerId: payload}` | Hash + Expiração por heartbeat | `45s` por heartbeat |
| **Ranking de Mini-Games** | `leaderboard:minigame:{gameKey}` | **Sorted Set** (`ZADD`, `ZREVRANGE`) | Permanente (sincronizado com Postgres) |
| **Ranking Battle ELO** | `leaderboard:battle:elo` | **Sorted Set** | Permanente |
| **Rate Limiting** | `ratelimit:{route}:{ipOrTrainer}` | Contador atômico (`INCR` + `PEXPIRE`) | `60s` janela deslizante |
| **Sessões Ativas de Mini-Game** | `minigame:session:{sessionId}` | String (JSON com resposta secreta + início) | `120s` (anti-trapaça no servidor) |

### Estratégia Cache-Aside na PokéAPI
1. O visitante ou treinador busca um Pokémon (`GET /api/v1/pokedex/pokemon/pikachu`).
2. `PokedexService` consulta `pokeapi:v2:pokemon:pikachu` no Redis.
3. Em caso de **Cache Hit**, devolve instantaneamente sem tocar na PokéAPI externa.
4. Em caso de **Cache Miss**, aplica *Singleflight / Lock leve* por chave para evitar múltiplas chamadas simultâneas ao mesmo recurso (*cache stampede*), consulta `https://pokeapi.co/api/v2/pokemon/pikachu` com `AbortController` e timeout explícito, salva no Redis com `TTL 24h` e responde ao cliente.

---

## 2. Arquitetura Orientada a Eventos com Apache Kafka / Redpanda

Usamos **Redpanda** (engine 100% compatível com o protocolo **Apache Kafka**, sem JVM/Zookeeper e com Console Web integrado) para desacoplar fluxos pesados e transmitir acontecimentos do mundo em tempo real.

### 2.1. Transactional Outbox Pattern (Zero Eventos Perdidos)

Nunca publicamos no Kafka diretamente no meio de uma requisição HTTP após alterar o banco, pois se o broker falhar logo após o commit no PostgreSQL, o evento seria perdido (ou publicado sem transação confirmada). O fluxo garantido segue o padrão **Transactional Outbox**:

```mermaid
sequenceDiagram
  participant API as "NestJS Service"
  participant PG as "PostgreSQL (Prisma)"
  participant Relay as "Outbox Relay Worker"
  participant Kafka as "Redpanda / Kafka"
  participant Consumer as "Kafka Consumer Group"
  participant WS as "WebSocket Gateway"

  API->>PG: "BEGIN TRANSACTION"
  API->>PG: "Grava Entidade (SaveState / BattleMatch / Slot)"
  API->>PG: "INSERT INTO OutboxEvent (status='PENDING')"
  API->>PG: "COMMIT"

  loop "Polling curto com índice parcial WHERE status='PENDING'"
    Relay->>PG: "SELECT FOR UPDATE SKIP LOCKED (lote até 50)"
    Relay->>Kafka: "Publica evento com eventId e traceparent"
    Relay->>PG: "UPDATE OutboxEvent SET status='PUBLISHED'"
  end

  Kafka-->>Consumer: "Entrega at-least-once"
  Consumer->>Consumer: "Checa Idempotência por eventId"
  Consumer->>WS: "Emite evento no Ticker Global ou sala PvP"
```

---

## 3. Catálogo Oficial de Tópicos Kafka

Para operar tanto em **Redpanda local** quanto em **planos gratuitos gerenciados em nuvem (como o Free Tier da Aiven for Apache Kafka, que permite até `5` tópicos com `2` partições cada sem cartão de crédito)**, a topologia é consolidada em **4 tópicos de domínio + 1 tópico unificado de Dead Letter Queue (`5` tópicos no total)**:

| Tópico | Chave de Partição | Produtor | Consumidores | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| **`pokeverse.world.events.v1`** | `trainerId` | `Pokedex`, `Battle`, `Minigames`, `Teams` | `WorldGateway` + `TeamAnalyzerWorker` | Eventos sociais (slots, conquistas, recordes) e gatilhos de análise assíncrona de times (diferenciados por header `eventType`) |
| **`pokeverse.arcade.savestate.v1`** | `trainerId:romId` | `ArcadeModule` | `ArcadeSaveWorker` | Validar integridade SHA-256, gerenciar revisões antigas no MinIO/R2 e confirmar cloud save |
| **`pokeverse.battle.matchmaking.v1`** | `formatRule` | `BattleModule` | `MatchmakerWorker` | Parear treinadores na fila PvP por faixa de `eloRating` e abrir sala no Redis + WebSocket |
| **`pokeverse.battle.results.v1`** | `matchId` | `BattleModule` | `StatsWorker` + `WorldGateway` | Atualizar ELO no Postgres + Redis Sorted Set e publicar resultado no feed global |
| **`pokeverse.dlq.v1`** | Original | Consumers em falha | Alerta & Inspeção | **DLQ unificada**: isola eventos inválidos ou falhos após limite de tentativas preservando header `originalTopic`, `trace_id`, payload e erro |

---

## 4. Resiliência, Idempotência e Tolerância a Falhas

1. **Idempotência Obrigatória nos Consumidores:**
   - A garantia padrão do Kafka é *at-least-once* (um evento pode ser entregue mais de uma vez após rebalanceamento de partições ou queda de rede).
   - Todo evento carrega um `eventId` (UUID v4) no cabeçalho/envelope. O consumidor verifica no Redis (`SET idemp:{consumerGroup}:{eventId} 1 NX EX 86400`) ou por constraint única no PostgreSQL antes de aplicar efeitos colaterais (como somar pontos de ELO ou contabilizar vitória).
2. **Retentativas com *Exponential Backoff* + *Jitter*:**
   - Falhas transitórias de IO reprocessam com atraso crescente aleatorizado (`baseMs * 2^attempt + randomJitter`), evitando efeito *thundering herd* caso um serviço volte após queda.
3. **Dead Letter Queue (DLQ):**
   - Mensagens corrompidas (que falham na validação de schema Zod) ou que esgotam o limite máximo de tentativas (ex.: `5` tentativas) são encaminhadas imediatamente para o respectivo tópico `.dlq.v1` com cabeçalhos originais, `trace_id`, motivo da exceção e timestamp — nunca travando a fila principal da partição.
4. **Circuit Breaker:**
   - Ao consumir serviços externos instáveis (como a PokéAPI durante pico de acessos), um disjuntor abre após taxa configurada de falhas consecutivas e responde com *fallback* em cache degradado ou erro amigável rápido sem esgotar *threads*/conexões do servidor.
5. **Graceful Shutdown:**
   - Ao receber `SIGTERM` ou `SIGINT`, os consumidores e produtores NestJS pausam novas leituras, aguardam o término dos eventos em processamento, fazem *commit* limpo dos *offsets* no Kafka e fecham pools de conexão do Prisma e Redis antes de encerrar o processo.

---

## 5. Estado Real da Implementação (Fase 2)

- **Cache-Aside + Circuit Breaker (`PokeApiCacheService`):** ativos em `/api/v1/pokedex/catalog` e `/api/v1/pokedex/pokemon/:idOrName` com singleflight in-memory, validação Zod na entrada/saída do Redis, `AbortController` (`POKEAPI_TIMEOUT_MS`) e header `X-Cache` (`MISS` / `HIT`).
- **Outbox + Redpanda + Consumidor Idempotente (`OutboxRelayService` & `WorldEventsConsumerService`):** ativos em lote com `FOR UPDATE SKIP LOCKED`, publicação paralela (`Promise.all`), retentativa (`MAX_OUTBOX_RETRIES = 5`), `pokeverse.dlq.v1` e lock `SET idemp:pokeverse-world-ticker:{eventId} 1 NX EX 86400` no Redis alimentando o ticker WebSocket `/ws/world`. Em `OutboxEvent.eventType` grava-se o tópico Kafka (`pokeverse.world.events.v1`), enquanto o nome do evento (`trainer.registered`, `pokedex.slot.saved`, `pokedex.slot.cleared`) vai dentro de `payload.eventType`.
- **Pendente para as Fases 3–6 + Hardening:** `@nestjs/throttler` distribuído no Redis, presença Overworld (`world:presence:*`), Rankings Sorted Sets, sessões anti-cheat de Mini-Games e segregação de eviction/sessão no Redis (detalhada no [Dossiê 13](13-dossie-de-seguranca-e-blindagem.md#72-redis-7-segregação-de-domínios-e-política-de-eviction)).
