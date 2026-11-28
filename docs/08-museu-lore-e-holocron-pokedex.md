# 08 — Museu das Regiões, Lore e Pokédex Holocron 3D

> **Nota de Estado Real (UX Unificada + `ENT-19`):** Toda funcionalidade informativa e de pesquisa — **Projetor Holocron 3D**, **Comparador 1v1**, **Calculadora de Atributos**, **Enciclopédia Global** e **Atlas das 9 Regiões (`Regiões & História`)** — agora vive **100% embutida dentro do Visor da Pokédex 3D** (`/pokedex?mode=holocron|comparar|calculadora|enciclopedia`), com `/museu` redirecionando para `/pokedex?mode=enciclopedia&cat=region`. O Holocron 3D corrigiu o bug da contra-rotação (agora gira 360° reais ao redor de um prisma 3D duplo + pipeline `GLTFLoader` + `.glb` Draco) e mantém fallback 2D em `LITE`/`webglcontextlost`. O **Atlas das 9 Regiões (`1996–2022`)** (`RegionsAtlasPanelComponent`) unifica a linha do tempo histórica com o dossiê vivo (`/regions/:id`, `/pokedexes/:id`, *version groups* e localidades clicáveis) diretamente dentro da Pokédex. Expansões futuras (*globo/atlas 3D interativo, fichas de Ginásio/Elite Four PvE e trilha sonora ambiente*) seguem na **Fase 6** e em [00 — Fila Prioritária](00-fila-prioritaria-melhorias.md).

## 1. Acesso Aberto: A Vitrine Pública da Plataforma

A **Pokédex 3D / Holocron** e o **Museu das Regiões & Jogos** formam os dois pilares acessíveis já para **Visitantes (sem login)**. Enquanto recursos de gravação, jogo em emulador e batalhas competitivas exigem autenticação, qualquer visitante explora o universo Pokémon com fluidez gráfica completa logo após a tela *"Press Start"*.

---

## 2. Módulo 01: Pokédex Clássica 3D + Expansão Holocron 3D

```mermaid
flowchart LR
  Input["Busca Fonética + Damerau-Levenshtein"] --> Classic["Pokédex Clássica 3D (Módulo 01)"]
  Classic -->|"Modo Visitante"| ReadSlots["10 Slots com Cadeado (Convite Login)"]
  Classic -->|"Treinador Logado"| CloudSlots["10 Slots Cloud (Sync PostgreSQL + Ticker Kafka)"]
  Classic -->|"Botão 3D / Atalho Busca"| Holocron["Holocron 3D Embutido no Visor (/pokedex?mode=holocron)"]
  Holocron --> Cry["Player de Grito + Espectro de Áudio (AnalyserNode)"]
  Holocron --> Evo["Árvore Evolutiva Interativa"]
  Holocron --> Matrix["Matriz de Tipos (0x a 4x) & Golpes por Geração"]
```

### 2.1. Integração da Pokédex Clássica 3D Existente (e Evolução para Pokédex 2.0)
A Pokédex construída inicialmente na Fase 0 (`index.html`, `css/style.css` e `js/app.js` — posteriormente portada integralmente para Angular/Shared e removida da raiz por desuso) continua sendo a peça central de consulta rápida em `apps/web` — expandindo seus dados via abas internas e controles contextuais **sem adicionar novos botões na carcaça** conforme detalhado em [doc 12 — Pokédex 2.0 e Catálogo PokéAPI v2](12-pokedex-2-0-pokeapi-e-controles.md):
- **Preservação Integral:** abertura 3D com transição para modo plano nítido (`1260ms`), carcaça metálica semi-opaca com iluminação dinâmica no ponteiro, busca tolerante a erros de digitação (normalização `NFD`, chave fonética e distância Damerau-Levenshtein), navegação estilo RPG por D-Pad/teclado e as duas fileiras inferiores de botões iluminados sob tampa transparente.
- **Comportamento por Permissão:**
  - **Visitante:** navega livremente pelo catálogo, pesquisa qualquer Pokémon via PokéAPI cacheada no Redis e abre a ficha completa; os 10 botões inferiores exibem estado bloqueado (ao clicar, abre o modal amigável de Login/Cadastro).
  - **Treinador Logado:** grava, renomeia, abre instantaneamente sem modal de confirmação e reordena via Drag & Drop / `↑`/`↓` seus 10 Pokémon favoritos diretamente na nuvem (`PokedexSlot` no PostgreSQL via `PATCH /api/v1/pokedex/slots/swap`), sincronizando entre dispositivos e publicando eventos de captura rara no Feed Global.

### 2.2. Expansão Holocron 3D (Embutida no Visor da Pokédex)
Ao clicar em **3D** na barra de modos do visor ou no atalho **Holocron 3D** diretamente na busca/ficha de qualquer Pokémon, o palco **Babylon.js 9 + Havok** é montado dentro do próprio Visor LCD (`/pokedex?q=<nome>&mode=holocron`):
1. **Pedestal Holográfico Elemental & Giro 360° Real:** base em metal escuro com shader de energia parametrizado pelo tipo, prisma holográfico duplo estacionário (sem contra-rotação) + hook lazy `GLTFLoader` (`LOCAL_POKEMON_GLB_MODELS`) para modelos `.glb` leves locais, giro orbital 360° e inclinação vertical suaves, além de partículas atmosféricas por elemento.
2. **Sintetizador & Analisador de Grito (*Cry* via Web Audio API):** reproduz o áudio oficial (`.ogg`/`.mp3`) capturado da PokéAPI ligado a um `AnalyserNode`, desenhando barras/ondas de frequência em tempo real diretamente no HUD do Holocron.
3. **Árvore Evolutiva Completa:** grafo interativo mostrando pré-evoluções, ramificações (ex.: Eevee, Tyrogue, Wurmple) e gatilhos exatos (*nível*, *pedra evolutiva*, *amizade*, *horário dia/noite*, *troca*).
4. **Calculadora Instantânea de Fraquezas e Resistências:** cruza a matriz `18 × 18` oficial para o par de tipos do Pokémon, agrupando multiplicadores em **`4x`**, **`2x`**, **`1x`**, **`0.5x`**, **`0.25x`** e **`0x` (Imune)**, além de listar movimentos aprendidos por nível, TM/HM e Egg Moves.

---

## 3. Módulo 02: Museu das Regiões & Linha do Tempo dos Jogos

O Museu funciona como um **atlas geográfico interativo + cronologia histórica** da franquia principal desde 1996, alimentado por dados estruturados curados em `MuseumModule` (NestJS + Redis cache):

### 3.1. Atlas Interativo das 9 Regiões
Cada região (**Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar e Paldea**) possui visualização dedicada com pontos clicáveis (*waypoints*):
- **Cidades e Rotas Principais:** descrição de lore, pontos turísticos e conexões geográficas.
- **Liga Pokémon Local:** ficha ilustrada de todos os **Líderes de Ginásio** (ou *Trial Captains*), **Elite Four** e **Campeão**, exibindo seus times canônicos e insígnias — funcionando também como ponte para desafiar esses treinadores no modo **PvE** quando logado!
- **Pokémon Nativos & Lendários Guardiões:** lista rápida ligada diretamente ao Holocron 3D.

### 3.2. Linha do Tempo Histórica dos Jogos (1996 — Presente)
Uma barra temporal navegável por gerações (**Gen I a Gen IX**):
- **Fichas Técnicas dos Lançamentos:** Pokémon Red/Blue/Yellow (GB) -> Gold/Silver/Crystal (GBC) -> Ruby/Sapphire/Emerald & FireRed/LeafGreen (GBA) -> Diamond/Pearl/Platinum & HeartGold/SoulSilver (NDS) -> gerações modernas em 3D.
- **Comparador de Evolução Visual:** exibe lado a lado como a representação gráfica (sprites 1-bit/8-bit, pixel art avançada em 16-bit, 2.5D isométrico e modelos 3D) evoluiu entre consoles.
- **Conexão Direta com o Arcade Retrô:** nas fichas dos jogos portáteis suportados (GB/GBC/GBA/NDS), um botão de atalho **Jogar no Arcade 3D** leva direto ao emulador (ou solicita Login caso o usuário seja visitante).
- **Trilha Sonora Ambiente:** controle opcional de música temática no Museu usando Web Audio API, com alternância suave e respeito às preferências de silenciamento do treinador.
