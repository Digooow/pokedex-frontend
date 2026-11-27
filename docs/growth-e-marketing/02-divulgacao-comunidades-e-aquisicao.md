# 02 — Divulgação, Comunidades e Aquisição de Usuários

> **Objetivo:** gerar fluxo recorrente de usuários qualificados (fãs de Pokémon, jogadores competitivos de VGC/Showdown e desenvolvedores) com **custo zero de mídia paga**, usando o próprio apelo visual e funcional do **PokéVerse OS** como motor de atração.

---

## 1. Proposta de Valor e Diferenciais Comunicáveis

Ao divulgar o projeto, **não venda uma "listagem de Pokémon"** — existem dezenas de sites assim. Venda os **4 diferenciais visuais e práticos** que já existem funcionando no PokéVerse OS:

1. **Pokédex 3D Skeuomórfica Viva:** tampa metálica articulada que abre e fecha de verdade, LEDs reativos, lente de safira, D-Pad interativo e áudio/espectrograma dos *cries*.
2. **Holocron 3D Interativo (1..1025 + Shiny):** projeção holográfica com modelos `.glb` animados em 360° direto no navegador, sem baixar aplicativo.
3. **Ferramenta Competitiva Real:** Comparador 1v1 lado a lado com matriz defensiva `0x..4x` + Calculadora de Atributos e Simulador de Dano VGC/Smogon com 25 naturezas, 16 rolls de dano e Import/Export no formato Pokémon Showdown.
4. **Busca Inteligente em Português + Fonética:** encontra Pokémon mesmo digitando errado (Damerau-Levenshtein) e filtra por Elemento (PT-BR), Raça (Grupo de Ovo), Mapa/Região, Jogo, Golpe e Habilidade.

---

## 2. Estratégia por Canal de Distribuição

### 2.1. Vídeos Curtos (TikTok, Instagram Reels e YouTube Shorts)

O formato visual da Pokédex 3D abrindo e projetando o Holocron é altamente compartilhável em vídeo vertical (`9:16`, 15 a 30 segundos).

#### Roteiro 1 — "A Pokédex que eu queria na infância rodando no navegador" (15–22s)
- **0–2s (Gancho visual):** grave a tela do PC/celular na rota `/` ou com a Pokédex fechada e clique para abrir a tampa 3D. Texto na tela: *"Fiz uma Pokédex 3D que abre de verdade direto no navegador"*.
- **3–10s (Demonstração):** busque um Pokémon icônico (ex.: Charizard ou Gengar), clique no **Holocron 3D** para o feixe ciano subir e gire o modelo `.glb` animado + alterne para **Shiny**.
- **11–18s (Valor prático):** mostre rapidamente a busca por golpe/região ou o som do *cry* com espectrograma.
- **19–22s (CTA):** *"Funciona no celular e no PC sem instalar nada — link na bio / comentários"*.

#### Roteiro 2 — "Como testar se seu time aguenta um golpe no VGC / Showdown" (20–28s)
- **0–3s (Gancho):** *"Você não precisa mais abrir 3 sites para montar time de Pokémon"*.
- **4–16s:** abra o **Comparador 1v1** e depois a **Calculadora**, cole um spread no formato **Showdown** e mostre o simulador de dano com os 16 rolls e veredito de KO.
- **17–25s (CTA):** peça nos comentários qual duelo 1v1 o pessoal quer ver testado no próximo vídeo.

#### Roteiro 3 — "De atividade da faculdade (Senac) a plataforma Full-Stack" (25–30s — Público Dev)
- **0–3s (Gancho):** mostre rapidamente o antes (captura da Fase 0 em `docs/assets/screenshots/09-fase0-estatica-fechada.webp`) virando a Pokédex 3D atual.
- **4–18s:** mostre em cortes rápidos: abertura 3D, Three.js Holocron, arquitetura (Angular 22 + NestJS + Postgres + Redis + Kafka).
- **19–30s (CTA):** *"Se quiser testar ou ver o código no GitHub, link no perfil"*.

---

### 2.2. Comunidades Pokémon (Público-Alvo Final)

| Canal | Como abordar sem parecer spam | Gancho que funciona |
| :--- | :--- | :--- |
| **Discord (servidores de VGC, Smogon, Nintendo/Pokémon BR)** | Só poste em canais permitidos (`#divulgacao`, `#projetos`, `#competitivo`) e participe das conversas antes. | Compartilhe links diretos úteis respondendo dúvidas: *"Testei esse matchup no comparador/calculadora que estou desenvolvendo"* + link curto. |
| **Reddit (`r/pokemon`, `r/stunfisk`, `r/VGC`, `r/PokemonBR`)** | Leia as regras de cada subreddit (muitos só aceitam projetos de fãs em dias específicos ou sem fins lucrativos). Publique GIF/vídeo nativo no Reddit em vez de só link seco. | Título focado no esforço técnico e utilidade: *"I built a 3D interactive Pokédex + Showdown Damage Calculator on the web (free, no ads)"*. |
| **YouTube & Twitch (Criadores pequenos/médios de Nuzlocke e VGC)** | Envie mensagem curta oferecendo a ferramenta para usarem em live durante *teambuilding* ou análises de *Nuzlocke*. | Destaque que roda leve (`LITE` mode disponível) e aceita cola direta do Pokémon Showdown. |

---

### 2.3. Comunidades de Tecnologia & Engenharia (Backlinks + Estrelas + Feedback Técnico)

Lançamentos em comunidades dev geram **tráfego em picos iniciais**, **backlinks de alta autoridade para o Google** e visibilidade profissional:

1. **TabNews (Brasil):** escreva um post técnico honesto (*"Da atividade final do Senac a uma Pokédex 3D full-stack com Angular 22, NestJS, Kafka, Redis e Three.js"*). Mostre desafios reais (bundle <= 501 kB, CSP, concorrência no Redis/Outbox, mobile-first `LITE`). O público do TabNews valoriza muito profundidade técnica e transparência.
2. **LinkedIn (PT-BR e EN):** publique carrossel ou vídeo curto de 25s com link no primeiro comentário e resumo dos aprendizados de arquitetura (BFF sem JWT no front, MFA/Passkeys, OTel, CI/CD).
3. **Show HN (Hacker News) & Product Hunt:** prepare em inglês com título direto, sem adjetivos exagerados (`Show HN: PokéVerse OS – Skeuomorphic 3D Pokédex, Three.js Holocron and VGC Calc`), garantindo antes que o servidor Azure (`pokeverse-api`) e o cache Upstash aguentem pico de acessos (ou que o modo degradado público responda rápido via cache).
4. **Reddit Dev (`r/angular`, `r/nestjs`, `r/threejs`, `r/webdev`, `r/brdev`):** foco em escolhas de engenharia (Angular Zoneless + Signals, `@defer` para Three.js, CSS 3D skeuomórfico sem degradar mobile).

---

## 3. Loops Virais Dentro do Próprio Produto (*Product-Led Growth*)

Quanto mais fácil for compartilhar algo útil criado dentro do app, menor o esforço de divulgação manual:

| Mecanismo | Estado Atual | Próxima Evolução Recomendada |
| :--- | :--- | :--- |
| **URLs com Query Params** | `/pokedex?q=<pokemon>&mode=holocron\|comparar\|calculadora\|enciclopedia` já navegam direto ao modo. | Adicionar botão **"Copiar Link"** discreto dentro do Visor/Holograma (copia URL pronta do Pokémon, comparação 1v1 ou cálculo e exibe feedback visual). |
| **Conversão Visitante → Treinador** | Slots azuis e rotas de jogo exibem cadeado convidando para login/cadastro. | Tornar a mensagem de valor ainda mais clara no diálogo de visitante: *"Salve seus 10 Pokémon favoritos na nuvem com apelidos e sincronização instantânea"*. |
| **Import/Export Showdown** | Já implementado na Calculadora Fase 2 (`ENT-10`). | Incluir link opcional de referência ao compartilhar o texto ou botão rápido de copiar resultado resumido do duelo 1v1 (`Gholdengo vs Landorus-T: 2HKO...`). |
| **Cartão Social Dinâmico (`MEL-07`)** | Pendente. | Meta tags Open Graph dinâmicas para que todo link colado no Discord/WhatsApp vire um convite visual com imagem e resumo do Pokémon. |

---

## 4. Checklist Pré-Divulgação em Massa

Antes de publicar em canais de alto tráfego (TabNews, Show HN, Reels viral):

1. [ ] **Domínio e HTTPS:** confirmar que `https://pokeverse.pages.dev/` (ou domínio próprio) está respondendo `200` rápido em mobile `375px` e desktop `1440px`.
2. [ ] **Health & Cache:** validar `GET /health/ready` (`200`) e verificar no `/catalog/enriched` se `X-Cache` está retornando `HIT` no Upstash para não sobrecarregar a PokéAPI durante picos.
3. [ ] **Fluxo de Cadastro:** testar 1 cadastro novo ponta a ponta (recebimento de e-mail via Resend e login com Google OAuth) para ter certeza de que novos usuários não ficam presos no onboarding.
4. [ ] **Observabilidade Ativa:** confirmar Cloudflare Web Analytics ativo + `SENTRY_DSN` configurado + monitor de uptime no ar ([doc 22](../22-observabilidade-em-producao-uso-e-painel-admin.md)).
5. [ ] **Proteção de Cota Cloud:** conferir limites de plano gratuito do Azure for Students, Neon, Upstash e Resend para evitar suspensão inesperada em caso de viralização.
