# Manual Técnico e Estudo de Caso — Pokédex Interativa 3D em JavaScript Vanilla

> **Plataforma publicada atualmente (PokéVerse OS — Cloudflare Pages + Azure):** [https://pokeverse.pages.dev/](https://pokeverse.pages.dev/) *(este manual documenta a base estática da Fase 0 preservada na raiz em [index.html](index.html), [css/style.css](css/style.css) e [js/app.js](js/app.js))*

Este documento é um manual técnico completo de tudo o que foi implementado em [index.html](index.html), [css/style.css](css/style.css) e [js/app.js](js/app.js). O projeto foi concebido como um **estudo de caso prático do limite alcançável usando exclusivamente HTML5, CSS3 e JavaScript puro (Vanilla JS)** — respeitando a restrição intencional de **não utilizar frameworks, bibliotecas de UI, gerenciadores de estado, clientes HTTP externos ou ferramentas de build**. O objetivo deste guia é permitir que qualquer pessoa desenvolvedora compreenda, linha por linha, os recursos nativos da plataforma Web moderna e o poder do JavaScript puro em cenários complexos.

---

## Índice

1. [Arquitetura e Limites Alcançados sem Frameworks](#1-arquitetura-geral-do-projeto)
2. [Estrutura HTML5 Semântica e Acessibilidade (`index.html`)](#2-estrutura-html5-semântica-e-acessibilidade-indexhtml)
3. [Design System, Camadas CSS, Flexbox e Container Queries (`css/style.css`)](#3-design-system-camadas-css-flexbox-e-container-queries-cssstylecss)
4. [Como Foi Feita a Pokédex 3D e o Movimento sem Borrão](#4-como-foi-feita-a-pokédex-3d-e-o-movimento-sem-borrão)
5. [Como Foi Feita a Troca de Background em Tela Cheia](#5-como-foi-feita-a-troca-de-background-em-tela-cheia)
6. [Consumo da PokéAPI com `fetch()`, `AbortController` e Tratamento de Erros](#6-consumo-da-pokéapi-com-fetch-abortcontroller-e-tratamento-de-erros)
7. [Catálogo Completo, Filtro Fonético e Algoritmo Damerau-Levenshtein](#7-catálogo-completo-filtro-fonético-e-algoritmo-damerau-levenshtein)
8. [Controles Físicos, Navegação Estilo RPG e Proteção de Clique/Scroll](#8-controles-físicos-navegação-estilo-rpg-e-proteção-de-cliquescroll)
9. [Os 10 Botões de Slot da Direita (Cores por Estado) e Editor no Botão Amarelo](#9-os-10-botões-de-slot-da-direita-cores-por-estado-e-editor-no-botão-amarelo)
10. [Decisões Técnicas, Trade-offs e Perguntas Frequentes de Arquitetura](#10-decisões-técnicas-trade-offs-e-perguntas-frequentes-de-arquitetura)
11. [Glossário Técnico Completo (Conceitos, Siglas, APIs e Ferramentas)](#11-glossário-técnico-completo-conceitos-siglas-apis-e-ferramentas)

---

## 1. Arquitetura Geral do Projeto

Com a premissa rígida de abrir o `index.html` diretamente no navegador sem depender de compiladores, *bundlers* (Vite/Webpack) ou bibliotecas de terceiros (React, Tailwind, Axios, Lodash), toda a engenharia — de shaders procedurais em SVG inline e cinemática 3D até fila de requisições abortáveis, busca fuzzy e máquina de estados por teclado — foi construída diretamente sobre APIs nativas dos navegadores modernos.

### Estrutura de pastas
- [index.html](index.html): define toda a marcação semântica, os elementos da Pokédex (tampa frontal, ala esquerda de busca/controles e ala direita de resultados/slots), os cenários de fundo e o rodapé.
- [css/style.css](css/style.css): define os tokens visuais (`oklch` e paletas semânticas), propriedades animáveis `@property --luz-x` e `--luz-y`, referências às microtexturas pré-assadas em `.webp`, camadas CSS (`@layer`), animações 3D/2D em compositor GPU, perfis adaptativos (`data-perf-tier`), Flexbox, Container Queries, estados visuais e acessibilidade.
- [js/app.js](js/app.js): contém toda a lógica da aplicação em modo estrito (`"use strict"`): detecção automática de hardware (`detectarHardwareTier`), *watchdog* adaptativo de quadros (`iniciarWatchdogAnimacao`), giro 3D/Plano (`executarGiroPokedex`), iluminação sutil guiada pelo ponteiro (`inicializarIluminacaoDinamica`), carga sob demanda de cenários, consumo assíncrono da PokéAPI, filtro tolerante a erros de digitação, máquina de estados RPG dos controles e gravação em `localStorage`.
- `assets/backgrounds/`: guarda as versões responsivas em WebP dos 4 cenários (`*-desktop.webp` em `1920px` e `*-mobile.webp` em `820px`), reduzindo o carregamento inicial mobile de `9,34 MB` para `~51 KB`.
- `assets/textures/`: armazena `metal-floco.webp` (`5,88 KB`) e `plastico-grao.webp` (`5,93 KB`), texturas `128×128` sem emenda pré-assadas para evitar o custo de CPU de filtros SVG em runtime no celular.
- `assets/favicon.svg`: ícone vetorial da Pokébola exibido na aba do navegador via `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">`.

### Decisão arquitetural: por que manter tudo em apenas 3 arquivos (`index.html`, `css/style.css`, `js/app.js`)?

Apesar de um front-end em escala de equipe frequentemente fragmentar componentes em múltiplas pastas, manter a aplicação em **um HTML, um CSS e um JS** é uma escolha intencional alinhada à premissa de rodar **sem etapa de *build* ou *bundlers***:

1. **Por que [index.html](index.html) tem ~387 linhas em arquivo único:** em HTML5 puro sem motor de templates (como JSX ou renderização no servidor), toda a carcaça estrutural da Pokédex (tampa, duas alas, botões físicos, cenários e atributos ARIA/`inert`) precisa existir no documento inicial. Os blocos dinâmicos (ficha do Pokémon, catálogo de mais de 1.300 itens e editor de slots) não incham o HTML porque são criados sob demanda pelo JavaScript.
2. **Por que [css/style.css](css/style.css) fica unificado mesmo sendo extenso:** todo o visual realista (tokens `oklch`, microtexturas SVG inline, câmera, dobradiça 3D/2D, visores em camadas e modos de alto contraste) é servido em uma única requisição HTTP e organizado internamente por `@layer reset, base, components, utilities;`. Isso evita a latência sequencial do `@import` em CSS puro e dispensa ferramentas de empacotamento para juntar parciais antes de publicar.
3. **Por que [js/app.js](js/app.js) não foi quebrado em vários arquivos JS:**
   - **Bloqueio de *ES Modules* via `file://`:** a modularização nativa moderna (`<script type="module">` com `import`/`export`) é bloqueada pela política **CORS** dos navegadores se alguém abrir `index.html` diretamente do sistema de arquivos sem um servidor HTTP local/remoto.
   - **Limitação de múltiplos `<script defer>` clássicos:** dividir em vários scripts tradicionais obrigaria expor funções e estados compartilhados no escopo global (`globalThis`), piorando o encapsulamento. Em um único `js/app.js`, todas as funções e estados permanecem protegidos por `"use strict"` e organizados em blocos lógicos claros (cenários, giro 3D, catálogo e busca *fuzzy*, persistência em `localStorage`, cliente da PokéAPI, renderização segura do visor, navegação estilo RPG e iluminação reativa).

> **Em resumo:** caso o projeto adotasse a exigência de rodar exclusivamente sobre servidor HTTP/Vite, `css/style.css` e `js/app.js` poderiam ser separados em diretórios por domínio (`css/tokens.css`, `js/services/pokeapi.js`, `js/domain/busca.js`, etc.) sem alterar a lógica; mantendo arquivo único por camada, ganha-se **execução imediata tanto por duplo clique (`file://`) quanto em servidor HTTP**, zero configuração e apenas 2 requisições extras de página.

### Por que o `<script>` está no `<head>` com `defer`?
No [index.html](index.html), temos:
```html
<script src="js/app.js" defer></script>
```
- Sem atributo nenhum no `<head>`, o navegador pausaria a leitura do HTML para baixar e rodar o JS (e os `document.getElementById(...)` retornariam `null` porque os elementos ainda não existiriam).
- Com `defer`, o navegador **baixa o arquivo em paralelo** enquanto constrói o HTML e garante que o JavaScript **só execute depois que todo o DOM foi analisado**, preservando a ordem dos scripts.

### Por que `"use strict";` no topo do `app.js`?
Ativa o **Modo Estrito** do JavaScript: impede criação acidental de variáveis globais sem `let`/`const`, transforma falhas silenciosas em erros visíveis durante desenvolvimento e torna o código mais seguro.

---

## 2. Estrutura HTML5 Semântica e Acessibilidade (`index.html`)

### Tags semânticas usadas e o porquê de cada uma
| Tag | Onde é usada | Para que serve |
| --- | --- | --- |
| `<nav>` | `.barra-cenarios` | Agrupa os botões de navegação dos cenários de fundo com `aria-label="Cenários de fundo"`. |
| `<main>` | `#conteudo-principal` | Conteúdo principal da página (`tabindex="-1"` para poder receber foco quando o usuário ativa o Skip Link). |
| `<section>` | `#pokedex-aparelho`, `.painel-busca`, `#resultado-area` | Divide blocos temáticos distintos ligados por `aria-labelledby` aos seus títulos (`<h2>`). |
| `<header>` | `.ala-topo--base`, `.ala-topo--scanner` | Cabeçalho de cada ala da Pokédex (com título `<h1>Pokédex</h1>` na base e luzes/título no scanner). |
| `<search>` | Envolvendo `#form-pokedex` | Tag semântica moderna do HTML5 específica para delimitar regiões de pesquisa/filtro. |
| `<form>` | `#form-pokedex` | Agrupa o `<label>`, `<input>` e botão `type="submit"` para permitir envio com a tecla `Enter`. |
| `<fieldset>` + `<legend>` | `.controle-dpad` e `#grade-slots-azuis` | Agrupa semanticamente conjuntos de botões relacionados (as 4 setas do D-Pad e os 10 slots de memória), usando `<legend class="visually-hidden">` invisível na tela, mas lido por leitores de tela. |
| `<article>` | `.pokemon-ficha` (criado via JS) | Representa uma ficha independente e completa do Pokémon encontrado. |
| `<ul>` e `<li>` | `#pokemon-catalogo`, `#pokemon-dados`, `.pokemon-tipos`, `.lista-habilidades` | Estruturam listas reais (catálogo da PokéAPI, dados principais do Pokémon, tipos e habilidades). |
| `<footer>` | `.rodape` | Rodapé discreto informando as tecnologias usadas e link seguro para a PokéAPI (`target="_blank" rel="noopener noreferrer"`). |

> **Nota de segurança (`noopener noreferrer`):** ao abrir links externos com `target="_blank"`, `noopener` impede que a nova aba acesse `window.opener` e manipule a página de origem (*tabnabbing*), enquanto `noreferrer` omite o cabeçalho `Referer` por privacidade.

### Validação HTML + Controle no JavaScript (`novalidate` e `pattern`)
No `<form id="form-pokedex" novalidate>`:
- O `<input id="pokemon-input">` tem `required` e `pattern=".*\S.*"` (expressão regular HTML que exige **pelo menos um caractere que não seja espaço em branco**, impedindo submissão de `"   "`).
- O `<form>` usa `novalidate` para **desligar o balão de erro padrão do navegador** (que varia de estilo e posição em cada SO/navegador). Em vez disso, o JS intercepta o evento `"submit"` com `evento.preventDefault()`, valida e exibe a mensagem acessível `#pokemon-erro-campo` dentro do próprio card, além do CSS poder reagir à pseudo-classe `:user-invalid`.
- Outros atributos úteis no `<input>`:
  - `autocorrect="off"`, `autocapitalize="none"`, `spellcheck="false"`: impedem que celulares corrijam nomes como *"pikachu"* para palavras em português.
  - `enterkeyhint="search"`: muda o ícone do botão Enter do teclado virtual no celular para lupa/buscar.

### Atributos WAI-ARIA usados no projeto
- **`aria-hidden="true"`**: aplicado em todos os elementos puramente visuais (imagens de fundo `.cenarios-fundo`, luzes LED, Pokébola da capa, saída de som, emojis `🔎` / `⚠️` / `❌`, `<svg>` da Pokébola vazia) para que leitores de tela não anunciem decoração.
- **`aria-label` e `aria-labelledby`**: fornecem nomes acessíveis para regiões e para botões sem texto visível (botões direcionais ▲▶▼◀, botão vermelho, botão azul e os 10 botões de slot da direita).
- **`aria-expanded` e `aria-controls`**: no `#btn-abrir-pokedex`, indicam aos leitores de tela se a tampa está aberta (`true`) ou fechada (`false`) e quais IDs de painel ela controla (`pokedex-ala-base pokedex-ala-scanner`).
- **`aria-pressed`**: transforma botões comuns em botões de alternância (*toggle*), usado nos botões de cenário, no botão `Auto: ON/OFF` e no botão compacto amarelo de edição (`#btn-config-slots`).
- **`aria-current="true"`**: marca qual Pokémon da lista corresponde ao Pokémon exibido no visor no momento.
- **`aria-live="polite"` e `aria-busy`**: no `#resultado-conteudo`. `aria-live="polite"` faz o leitor de tela anunciar resultados quando terminam sem interromper a fala atual; `aria-busy="true"` indica carregamento em andamento durante o `fetch`.
- **`role="alert"`**: usado somente em erros críticos de comunicação (`renderizarMensagemErro`), anunciando falhas de conexão imediatamente.
- **`aria-invalid` + `aria-describedby` + `data-error` (`vincularErroAcessivel`)**: quando o campo está inválido, o JS concatena `pokemon-erro-campo` ao `aria-describedby` existente (`pokemon-dica`), fazendo o leitor de tela ler primeiro a dica e depois o erro.
- **Atributo nativo `inert`**: aplicado em `#pokedex-ala-base` e `#pokedex-ala-scanner` quando fechada, e em `#tampa-frente` quando aberta. Diferente de apenas esconder com `opacity: 0`, `inert` bloqueia cliques, foco de teclado (`Tab`) e leitura por leitores de tela nos elementos da face que está escondida/virada.
- **Skip Link (`.skip-link.visually-hidden`)**: oculto visualmente com `clip-path: inset(50%)`, mas ao pressionar `Tab` logo ao entrar na página ele aparece no canto superior esquerdo e leva direto para `#conteudo-principal`.

---

## 3. Design System, Camadas CSS, Flexbox e Container Queries (`css/style.css`)

### 1. CSS Cascade Layers (`@layer reset, base, components, utilities;`)
Define explicitamente a **prioridade entre blocos inteiros do CSS**, independente da especificidade de seletores individuais:
1. `reset`: aplica `box-sizing: border-box` apenas nos elementos usados (sem seletor universal `*`, evitando custo desnecessário em árvores grandes), zera margens/paddings padrão e define `min-inline-size: 0` no `fieldset` (corrige um comportamento histórico dos navegadores em que `<fieldset>` não encolhe abaixo do conteúdo mínimo em layouts Flex).
2. `base`: estiliza o `body` (`display: flex`, `flex-direction: column`, `min-height: 100dvh`), tipografia base, links e foco visível `:focus-visible`.
3. `components`: todo o estilo dos cenários, Pokédex 3D, formulários, lista, controles físicos, slots, visor LCD e realces RPG.
4. `utilities`: garante `[hidden] { display: none; }`, o utilitário `.visually-hidden:where(:not(:focus-within, :active))` para leitores de tela e `@media (prefers-reduced-motion: reduce)` **sem nenhum `!important`** — porque regras da última camada (`utilities`) sempre vencem as camadas anteriores pela arquitetura CSS Cascade Layers.

### 2. Design Tokens no `:root`
Em vez de repetir códigos hexadecimais espalhados pelo CSS, o projeto organiza variáveis CSS (`--nome`) em duas camadas:
- **Camada 1 — Primitivos e Materiais (`oklch` / WebP pré-assadas):** paleta pura de cores (`--palette-red-600`, `--palette-slate-950`, `--palette-gb-100`..`--palette-gb-850`, `--palette-sky-400`, `--palette-sky-800`, `--palette-emerald-500`, `--palette-amber-400`), escalas metálicas (`--metal-carcaca-*`, `--metal-cinza-*`, `--metal-cromo-*`), plásticos foscos (`--plastico-topo-*`, `--plastico-vermelho-*`, `--plastico-preto-*`, `--plastico-cinza-*`) e microtexturas sem emenda (`--textura-metal-floco` e `--textura-plastico-grao`).
- **Camada 2 — Semânticos e Iluminação:** dão significado ao uso (`--bg-carcaca-ala`, `--bg-formulario`, `--bg-subpainel-busca-form`, `--bg-catalogo-area`, `--bg-resultado`, `--texto-subpainel-busca`, `--texto-formulario`, `--texto-lcd-principal`, `--cor-destaque`, `--borda-visor-acento`, `--espaco-1`..`--espaco-6`, `--raio-*`, `--z-*`, `--duracao-giro-tampa`, `--curva-cadencia-humana`), além de `@property --luz-x` e `--luz-y` registradas como `<percentage>` para permitir transição suave de luz.
- Se amanhã você quiser mudar a cor da carcaça ou a velocidade do giro, muda **uma única variável no `:root`**.

### 3. Unidades Modernas e Funções Matemáticas CSS
- **`dvh` (`100dvh`, `76dvh`):** *Dynamic Viewport Height*. No celular, quando a barra de endereço aparece ou some, `100vh` estoura a altura da tela; `100dvh` se ajusta automaticamente ao espaço visível real.
- **`min()`, `clamp()`, `calc()`:**
  - `--wing-w: min(23.5rem, calc(100vw - 1.5rem));` no mobile garante que a Pokédex nunca passe da largura da tela.
  - `--wing-w: min(27.5rem, 44vw);` e `--wing-h: clamp(35rem, 76dvh, 43.5rem);` no desktop travam exatamente o mesmo tamanho para as duas asas abertas e para a tampa fechada.

### 4. Flexbox e o segredo de `min-height: 0` e `min-width: 0`
- Toda a estrutura interna da Pokédex usa `display: flex` + `flex-direction: column` + `gap` + `padding` + `margin`.
- **Por que `min-height: 0` aparece na `.painel-busca`, `.pokemon-catalogo-area`, `.painel-resultado`, `.resultado-conteudo` e `#pokemon-catalogo`?**
  Por padrão no Flexbox, todo item tem `min-height: auto` (e `min-width: auto`). Se um filho tiver uma lista gigante (como os 1.300 Pokémon ou a ficha longa no visor), o item Flex **se estica** em vez de ativar `overflow-y: auto`. Ao colocar `min-height: 0` e `flex: 1`, dizemos ao Flex: *"pode encolher para caber no espaço disponível e crie barra de rolagem interna!"*.
- Mesmo motivo para `min-width: 0` e `overflow-wrap: anywhere` nos textos: impedem que nomes compridos ou badges quebrem o layout horizontal.

### 5. Container Queries (`@container visor (min-width: 340px)`)
Diferente de `@media` (que olha a largura da **janela inteira**), `.painel-resultado` declara:
```css
container-type: inline-size;
container-name: visor;
```
Assim, `@container visor (min-width: 340px)` reorganiza o cabeçalho da ficha do Pokémon (`.pokemon-cabecalho` de coluna para linha, texto centralizado para alinhado à esquerda, `.pokemon-lista-dados` com itens lado a lado) **baseado exclusivamente na largura interna do visor LCD**, e não da tela do monitor!

### 6. Materiais Realistas, Visores LCD e Acessibilidade em CSS Puro
- **Carcaça em metal acetinado sutil e cabeçalhos/relevos em plástico fosco:** as alas (`.pokedex-ala`), superfície da capa (`.tampa-superficie`) e dobradiça lateral (`.tampa-dobradica-lateral`) combinam gradientes `oklch` metálicos com a microtextura fina `--textura-metal-floco` ([assets/textures/metal-floco.webp](assets/textures/metal-floco.webp), `128×128` + `mix-blend-mode: soft-light` em opacidade suave `0.15–0.16`) e reflexo radial guiado por `--luz-x`/`--luz-y` via `requestAnimationFrame` (`inicializarIluminacaoDinamica`, desativado em `prefers-reduced-motion`, sem `hover` ou em `data-perf-tier="lite"`). A moldura interna esquerda (`.painel-busca`) usa cinza metálico (`--metal-cinza-*`, opacidade `0.28`), contrastando com os cabeçalhos vermelhos em plástico moldado (`.ala-topo` e `.ala-topo--capa` usando `--plastico-topo-*` + `--textura-plastico-grao` em `0.26`) e os relevos de plástico ABS fosco (`.tampa-placa-frontal`, botões D-Pad e controles com [assets/textures/plastico-grao.webp](assets/textures/plastico-grao.webp)).
- **Perfis Adaptativos de Hardware (`html[data-perf-tier="ultra" | "balanced" | "lite"]`):** após identificar gargalos reais em smartphones (imagens 4K, filtros SVG em runtime, blur contínuo e reflows), a interface detecta automaticamente memória, núcleos de CPU, modo Economia de Dados (`saveData`) e capacidade de quadros via `detectarHardwareTier()` e `iniciarWatchdogAnimacao()` (com troca manual em `#btn-perf-tier`). Em `balanced`, desativa `backdrop-filter` e sombras externas durante a rotação e ativa `content-visibility: auto` nas células da lista; em `lite`, desabilita microtexturas/blend modes/rotação 3D pesada e reduz o cenário ativo para `~51–104 KB`, mantendo 60 FPS mesmo em aparelhos modestos.
- **Visores em camadas sem prejuízo à leitura:**
  - `.painel-resultado` preserva a moldura externa limpa em volta de *"Visor de Resultados"* e do badge de status, enquanto `.resultado-conteudo` forma a janela LCD interna rebaixada (`border: 2px solid #06090f`, vinheta de *backlight* e linhas sutis com `background-attachment: scroll`, mantendo o texto nítido na frente e o vidro fixo durante a rolagem).
  - `.painel-busca-form` e `.pokemon-catalogo-area` usam borda rebaixada e textura LCD posicionada em camada de fundo (`z-index: 1`) atrás do texto e do campo `<input>` (`z-index: 2`), com reflexo antirreflexo suave em `::before` (`z-index: 3`, `pointer-events: none`).
- **Botões inferiores iluminados por baixo sob plástico transparente (`.btn-slot-azul` e `.mini-visor-amarelo`):** construídos em 3 planos visuais sem elementos extras no HTML — cavidade escura com LED/lâmpada concentrada na base do botão, uma tampa translúcida recuada (`::before`, `inset: 1px`) com bordas refrativas captando luz nos cantos, e um reflexo especular fino no topo (`::after`) no mesmo estilo ótico dos LEDs superiores.
- **Cantoneiras da caixa do sprite (`.pokemon-imagem-box::before` / `::after`):** dois pseudo-elementos com apenas 2 lados de borda (`border-width: 2px 0 0 2px` e `0 2px 2px 0`), formando a mira de scanner.
- **Trava amarela da capa (`.trava-triangulo`):** triângulo criado via `clip-path: polygon(0 0, 100% 50%, 0 100%)`.
- **Saída de som superior direita e câmera ótica frente/verso na aba esquerda (`.saidas-som`, `.saidas-som--superior`, `.camera-lente-principal`, `.luz-trio`):** linhas criadas com `repeating-linear-gradient(90deg, ...)` nos rodapés e no topo direito (`.ala-topo--base`), enquanto a câmera ótica multicamadas (anel metálico, barril escuro, vidro de safira antirreflexo e flashes em xênon vermelho/amarelo/verde) aparece exclusivamente na aba giratória esquerda — como câmera frontal na tampa fechada (`.ala-topo--capa`, na extremidade direita) e câmera traseira espelhada na extremidade esquerda quando aberta (`.ala-topo--scanner`).
- **Skeleton Loading:** blocos animados com `linear-gradient` deslizando (`@keyframes pulsar`) enquanto a PokéAPI responde, evitando salto visual (*CLS*).
- **`:user-invalid`:** ao contrário de `:invalid` (que já começa vermelho com a página recém-aberta), `:user-invalid` só estiliza o input com erro **depois** que o usuário interagiu com o campo.
- **`tabular-nums` (`font-variant-numeric: tabular-nums`):** faz todos os dígitos numéricos (`#0025`, altura, peso) ocuparem exatamente a mesma largura horizontal para colunas/listas não "dançarem".
- **`prefers-reduced-motion: reduce`:** zera durações de animações e transições para pessoas com sensibilidade a movimento (também lido via JS com `matchMedia("(prefers-reduced-motion: reduce)")`, desativando o giro 3D, a iluminação dinâmica no ponteiro e o auto-ciclo de fundo por padrão).
- **`forced-colors: active`:** suporta o modo Alto Contraste do Windows, ocultando imagens, texturas SVG e pseudo-elementos decorativos e restaurando bordas sólidas com `CanvasText` / `Highlight`.

### 7. Relevo da Carcaça, Simetria, Cores por Polaridade e Foco RPG sem borda grossa
- **Capa rígida sem alteração de escala e relevo eletrônico na carcaça:** a tampa fechada (`.pokedex-tampa-fechada`) não escala nem troca de cor no `:hover`, mantendo câmera e flashes na ponta direita (câmera externa e flashes vermelho, amarelo e verde da direita para a esquerda), microtextura metálica granulada com reflexo sutil estendido até a dobradiça lateral (`.tampa-dobradica-lateral`), parafusos nos 4 cantos, placa frontal, trava lateral e grade eletrônica inferior.
- **Simetria interna e sombra dividida sem sangramento na dobradiça:** no modo aberto (`[data-aberta="true"]:not(.is-animando)`), as alas dividem o `box-shadow` apenas para os lados externos (`-14px` à esquerda no scanner, `+14px` à direita na base) e alturas mínimas idênticas nos cabeçalhos (`.ala-topo { min-height: 4.15rem; }`) e baías inferiores (`min-height: 4.8rem`), eliminando o falso gradiente na dobradiça e alinhando as duas telas pixel a pixel.
- **Mesmo tom mais escuro nos cards da esquerda e mais claro no Visor escuro:**
  - `"Pesquisar Pokémon"` usa cinza-grafite escuro (`#3f4752`) com texto claro de alto contraste (`#f8fafc` / `#e2e8f0`) e escurece para `#2b313a` quando selecionado (`.painel-busca-form.is-rpg-tela-cursor`).
  - `"Todos os Pokémon"` usa cinza claro fosco (`#cfd6dc`, itens `#eaefec`) e escurece para `#b5bfc8` quando selecionado (`.pokemon-catalogo-area.is-rpg-tela-cursor`) com cursor `#cfe3f5`.
  - `"Visor de Resultados"` usa preto/cinza escuro retrô inspirado em telas clássicas de portáteis e celulares antigos (`#181c22`, células internas `#111418`/`#1d222a`/`#0d1014`, bordas metálicas `--borda-visor-acento`) e **clareia dentro do mesmo tom** quando selecionado: `#232933` em `.is-selecionando-pokemon` e `#2c3340` em `.is-rpg-tela-cursor` ou `.is-scanning`.
- `.is-rpg-foco` usa `outline: 2px solid` (`--palette-sky-800` sobre o fundo claro de `.pokemon-catalogo-area` e `--palette-amber-400` sobre os fundos escuros da busca `#3f4752`, do visor e dos controles) com `outline-offset: 2px` para botões e inputs sem engrossar com sombras múltiplas.
- `.catalogo-item.is-rpg-foco` mantém o exato visual fino de `.catalogo-item.is-cursor`: `border: 2px solid var(--palette-sky-800)` + barra lateral âmbar `inset 6px 0 0 var(--palette-amber-500)`.

---

## 4. Como Foi Feita a Pokédex 3D e o Movimento sem Borrão

A animação de abertura integra CSS 3D Transforms nativos e controle de ciclo de renderização em JavaScript puro para alternar entre cinemática espacial e nitidez 2D sem uso de bibliotecas externas:

### Estrutura de 3 camadas físicas sobrepostas
Dentro de `.pokedex-palco-3d` (`perspective: 1800px`) existe `.pokedex-livro` (`transform-style: preserve-3d`), com largura `--wing-w` e altura `--wing-h` fixas (exatamente do tamanho de **uma** ala). Dentro dele vivem dois blocos:

1. **Card de Baixo fixo (`.pokedex-ala--base`):**
   - É a ala direita (Visor de Resultados + 10 botões da direita + botão compacto amarelo `#btn-config-slots` + saída de som).
   - Quando a Pokédex está fechada (`data-aberta="false"`), ele fica escondido atrás da capa fechada em `translateZ(1px)` — **nunca usando `translateZ` negativo**, evitando que a tampa fique transparente ou atravesse a base no eixo Z durante o giro!
2. **Card Giratório 3D (`.pokedex-aba-giratoria`):**
   - Possui **duas faces dentro do mesmo cartão** (`.aba-face--frente` e `.aba-face--verso`), ambas com **`backface-visibility: hidden`** (quando uma face gira mais de 90° e fica "de costas" para a câmera, ela desaparece automaticamente e revela a outra face!).
   - `.aba-face--frente` é a **Capa Fechada** (`rotateY(0deg) translateZ(6px)` no desktop).
   - `.aba-face--verso` é o **Interior da Ala Esquerda** (`Módulo de Busca`, lista e D-pad), que já nasce virado **180 graus ao contrário** (`rotateY(180deg) translateZ(6px)`).

### Como o giro acontece ao abrir e fechar
- **No Desktop (`>= 880px`):**
  - O pivô de rotação da aba é a borda esquerda (`transform-origin: left center`), simulando uma dobradiça física.
  - Ao abrir (`[data-aberta="true"]`), `.pokedex-aba-giratoria` gira de `0deg` para `rotateY(-180deg)`, abrindo para a esquerda e desvirando `.aba-face--verso` perfeitamente de frente para o usuário!
  - Ao mesmo tempo, `.pokedex-livro` desliza para a direita em `translateX(calc(var(--wing-w) / 2))` com `transition-delay: 60ms` (e `70ms` ao fechar), mantendo a Pokédex inteira (agora com `2 * --wing-w` de largura) exatamente no meio da tela, em movimento orgânico ("cadência humana": `1240ms` no giro, `1160ms` no deslize, curva `cubic-bezier(0.28, 0.72, 0.28, 1)`).
- **No Mobile (`< 880px`):**
  - Cada ala recebe altura generosa (`--wing-h: clamp(41.5rem, 86dvh, 45.5rem)`) para comportar integralmente o módulo de busca, lista rolável e D-Pad na ala superior e o visor + slots na ala inferior, usando a rolagem vertical natural da página do navegador para navegar entre as duas alas.
  - A aba gira na dobradiça superior (`transform-origin: top center`; `rotateX(180deg)`), enquanto `padding-top: var(--wing-h)` é reservado de forma estática (sem transição animada, portanto sem reflow por frame) já no início da animação (`.is-animando`) e no estado aberto (`[data-aberta="true"]`).
  - Em dispositivos classificados no perfil `lite` (ou com `prefers-reduced-motion`), a abertura ocorre instantaneamente no modo plano 2D para preservar responsividade.

### Como foi garantido que a ala esquerda ficasse 100% nítida (sem desfoque!)
Se `.pokedex-aba-giratoria` permanecesse para sempre com `perspective: 1800px`, `transform-style: preserve-3d` e `rotateY(-180deg) translateZ(6px)`, os navegadores baseados em Chromium (Chrome, Edge, Opera, Brave) continuariam rasterizando toda a ala esquerda como uma textura 3D projetada na GPU, aplicando subpixel interpolation (`1800 / 1806`) e deixando os textos da esquerda levemente borrados comparados aos da direita!

**A solução técnica em `executarGiroPokedex()` ([js/app.js](js/app.js)) e [css/style.css](css/style.css):**
1. Antes de iniciar o movimento, o JS adiciona `.is-animando`, chama `pokedexAparelho.getBoundingClientRect()` (isso força um *reflow* para o navegador registrar a posição inicial 3D sem pular direto ao fim) e adiciona `.is-transicionando`.
2. Durante os `1260ms` (`DURACAO_GIRO_POKEDEX_MS`), a animação 3D roda normalmente.
3. Assim que o `setTimeout` de `1260ms` termina (ou imediatamente se `prefers-reduced-motion` estiver ativo), o JS **remove** `.is-animando` e `.is-transicionando`.
4. Sem `.is-animando` (`:not(.is-animando)`), o CSS troca instantaneamente para o modo **2D plano nítido**:
   - `.pokedex-palco-3d { perspective: none; }`
   - `transform-style: flat; transform: none;` em todas as faces e alas;
   - As posições equivalentes finais passam a ser posicionamento CSS 2D puro (`left: calc(var(--wing-w) / 2)` no `.pokedex-livro` e `left: calc(-1 * var(--wing-w))` na aba aberta em desktop; `top: calc(-1 * var(--wing-h))` no mobile).
5. Resultado visual: zero salto ao terminar a animação e nitidez cristalina idêntica dos dois lados!

### Câmera ótica e flashes reativos (`.is-scanning`)
Durante uma consulta na API, `executarPesquisa()` adiciona a classe `.is-scanning` ao `#pokedex-aparelho`, ativando `@keyframes pulso-lente` no vidro de safira `.camera-vidro-safira` e `@keyframes flash-disparo` escalonado nos flashes vermelho, amarelo e verde da câmera da aba esquerda (frente e verso). Quando a consulta acaba (`finally`), a classe é removida.

---

## 5. Como Foi Feita a Troca de Background Sob Demanda (e Economia de VRAM)

1. **HTML:** dentro de `<div class="cenarios-fundo" aria-hidden="true">`, apenas o cenário inicial (`hoenn`) traz `srcset`/`src` no carregamento inicial (`mirante-hoenn-mobile.webp 820w` e `mirante-hoenn-desktop.webp 1920w`) com `fetchpriority="high"`. Os demais (`cidade`, `vila`, `floresta`) declaram apenas `data-src-mobile` e `data-src-desktop` sem `src` inicial, consumindo **0 bytes e 0 MB de VRAM na abertura**.
2. **CSS (Crossfade GPU):** `.cenarios-fundo` usa `position: fixed; inset: 0; pointer-events: none;`. Apenas o cenário com `.is-active` tem `opacity: 1` (`transition: opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)`).
3. **JS (Carga Sob Demanda e Descarte):**
   - `aplicarCenario(cenarioId)` injeta o `src` apropriado via `obterChaveVarianteCenario()` (`mobile` abaixo de `880px`, em `tier === "lite"` ou com `saveData: true`) antes de ativar `.is-active`; após o crossfade (`960ms`), `agendarLimpezaCenariosInativos()` remove `src`/`srcset` dos cenários inativos nos perfis `balanced` e `lite` para nunca acumular bitmaps gigantes em memória gráfica.
   - `avancarProximoCenario()` usa aritmética modular `(indiceAtual + 1) % CENARIOS_IDS.length` e pausa automaticamente no evento `visibilitychange` quando a aba vai para segundo plano.
   - Em hardware detectado como `lite`, o auto-ciclo inicia desligado por padrão se não houver preferência salva em `localStorage`.

---

## 6. Consumo da PokéAPI com `fetch()`, `AbortController` e Tratamento de Erros

### Os 2 endpoints oficiais consumidos
1. **Busca de Pokémon individual:** `https://pokeapi.co/api/v2/pokemon/{nomeOuId}` (`buscarPokemonNaApi`).
2. **Catálogo de nomes e IDs:** `https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0` (`garantirCatalogoCarregado`). *Obs.:* essa listagem traz `name` e `url` (`https://pokeapi.co/api/v2/pokemon/25/`), e `extrairIdDaUrl()` usa a expressão regular `/\/(\d+)\/?$/` para extrair o número `#0025` sem precisar fazer 1.300 requisições separadas!

### Por que usar `AbortController` + `setTimeout`?
Em aplicações com busca, existem **dois problemas clássicos** que `AbortController` resolve juntos:
1. **Race Condition (Condição de Corrida):** se você pesquisar "charizard" e logo depois clicar em "pikachu", a primeira requisição ainda pode estar viajando pela rede. Se ela voltar *depois* da segunda, mostraria o Charizard errado na tela! Com `controladorAtual?.abort()` antes de abrir a nova chamada + checagem `if (controladorAtual !== controller) return;`, a requisição antiga é abortada no nível de rede do navegador.
2. **Timeout real (`10000ms`):** o `fetch()` nativo não tem timeout curto embutido. Um `setTimeout` muda `expirouPorTempo = true` e chama `controller.abort()`, fazendo o `catch` identificar se o `AbortError` veio de timeout (mostra erro ao usuário com botão **Tentar novamente**) ou de cancelamento intencional por uma busca mais nova (ignora silenciosamente).

### Tratamento semântico de erros (`class ErroApi extends Error`)
- **`resposta.status === 404`:** não existe esse Pokémon -> lança `ErroApi` com `tipo = "nao_encontrado"`, mantém o status `"Não encontrado"` e calcula até 4 botões clicáveis *"Você quis dizer:"* via `buscarSugestoesAproximadas`.
- **`!resposta.ok` (500, 502, 429, etc.) ou erro de rede (`fetch` rejeitado) ou JSON inesperado:** lança `ErroApi` com `tipo = "comunicacao"`, exibe `role="alert"` e botão **Tentar novamente** que reexecuta `executarPesquisa(ultimaBuscaRealizada)`.
- **Bloco `finally`:** sempre limpa o `clearTimeout(temporizador)` e, se aquela requisição ainda for a atual (`controladorAtual === controller`), destrava o botão `Buscar Pokémon`, desliga `aria-busy` e desativa os flashes `.is-scanning`.

### Conversão de unidades da PokéAPI (`formatarMedidaDecimal`) e Sprites
- A PokéAPI retorna **altura em decímetros (`dm`)** e **peso em hectogramas (`hg`)**.
  - `height: 4` -> `4 / 10 = 0,4 m (4 dm)`
  - `weight: 60` -> `60 / 10 = 6,0 kg (60 hg)`
  - Formatação usando `Intl.NumberFormat("pt-BR")` (vírgula decimal correta em português!).
- **Sprites (`criarCaixaImagemPokemon`):** prioriza a arte oficial (`dados.sprites?.other?.["official-artwork"]?.front_default`) e usa `dados.sprites?.front_default` como fallback automático. Define `width = 124`, `height = 124`, `fetchpriority = "high"` e, no evento `"error"` da `<img>`, tenta `spritePadrao` uma única vez (`tentouFallback`) antes de exibir mensagem textual segura (também usada se nenhuma URL existir), evitando quebra de layout.

### Segurança contra XSS (Cross-Site Scripting)
- **Zero `innerHTML`** no projeto inteiro!
- Todos os elementos retornados da API passam por helpers `criarElemento()` / `criarElementoSvg()` com **`textContent`** (nunca interpretado como HTML pelo navegador) e são inseridos com `.replaceChildren(...)`.

---

## 7. Catálogo Completo, Filtro Fonético e Algoritmo Damerau-Levenshtein

Quando o usuário abre a Pokédex ou foca o campo de busca pela primeira vez (*lazy loading* — não gasta banda antes de abrir!), `garantirCatalogoCarregado()` baixa a lista de todos os Pokémon disponíveis na API. Para evitar múltiplas chamadas simultâneas se clicar rápido, usa `catalogoCarregando` e cache local `catalogoPokemon`.

### Como a busca funciona mesmo se você digitar errado (`filtrarCatalogo`)
1. **Limpeza (`limparTextoComparacao`):**
   - Usa `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` (separa acentos das letras no Unicode e remove os acentos) e mantém apenas `[a-z0-9]`.
2. **Chave fonética simplificada (`gerarChaveFonetica`):**
   - Converte grafias comuns de quem escreve como se fala em português para aproximar do nome em inglês:
     `ph -> f`, `ch -> x`, `qu -> k`, `y -> i`, `w -> u`, `c` antes de `e/i -> s`, `z -> s`, `k -> c`, e colapsa letras dobradas (`/(.)\1+/g -> "$1"`).
   - Exemplo real: `"pikaxu"` vira `"picaxu"`, que é idêntico à chave fonética de `"pikachu"`! `"charisard"` vira `"xarisard"`, igual a `"charizard"`.
3. **Distância de Damerau-Levenshtein (`calcularDistanciaDamerau`):**
   - Matriz de programação dinâmica (`dp[m + 1][n + 1]`) que calcula quantas edições mínimas transformam a palavra digitada no nome do Pokémon.
   - Aceita **4 operações com custo 1**: inserção (`pika_chu`), remoção (`pikaachu`), substituição (`pikaxhu`) e **transposição adjacente** (trocar duas letras vizinhas de ordem, ex.: `pikahcu` -> `pikachu`!).
   - Tem **early exit** (`if (Math.abs(m - n) > limiteMaximo) return limiteMaximo + 1`): se a diferença de tamanho já for maior que o limite aceito, nem aloca a matriz!
4. **Sistema de pontuação (Ranking):**
   - `0`: match exato.
   - `100+`: começa com (`startsWith`), priorizando formas base antes de variações com hífen (`bonusFormaBase`).
   - `300+`: contém no meio da palavra (`indexOf`).
   - `400+` / `500+`: match fonético exato ou prefixo fonético.
   - `600+`: distância de Damerau menor que `limiteDistancia` (proporcional ao tamanho do termo, entre 1 e 4).
   - Se o termo for só números (ou `#25`), `filtrarCatalogoPorNumero` busca direto por ID exato, prefixo ou substring do ID.

### Renderização em lotes + Infinite Scroll
Como a PokéAPI retorna mais de 1.300 entradas, inserir todos os `<li>` no DOM de uma vez deixaria a abertura mais pesada.
- Sem filtro (`modoFiltroAtual === "todos"`), renderiza em lotes de **`150` itens** (`TAMANHO_LOTE_CATALOGO`), exibindo um botão **Carregar mais** no fim e carregando mais lotes automaticamente no evento `"scroll"` de `catalogoLista` quando `scrollHeight - scrollTop - clientHeight < 120`.
- Quando há filtro digitado, limita aos **`120` melhores resultados** (`MAX_RESULTADOS_FILTRADOS`).

---

## 8. Controles Físicos, Navegação Estilo RPG e Proteção de Clique/Scroll

### 1. Como o fechamento por clique externo funciona sem fechar ao usar a barra de rolagem
- **Áreas que preservam a Pokédex aberta ao clicar:**
  - `SELETOR_AREAS_INTERNAS_POKEDEX`: `".painel-busca, .painel-resultado, .controle-interativo"` (telas e todos os botões físicos). Qualquer clique *na carcaça vermelha fora* dessas áreas dentro de `#pokedex-aparelho` fecha a Pokédex!
  - `SELETOR_AREAS_PRESERVADAS`: adiciona `.barra-cenarios` e `.rodape`, para que trocar o cenário de fundo ou clicar no link do rodapé também não feche o aparelho sem querer.
- **O truque para proteger o arraste do scroll (`pointerdown` / `mousedown`):**
  Se o usuário aperta o mouse dentro do visor (ou na barra de rolagem do visor), arrasta um pouco para fora e solta o botão fora da tela, o evento `click` nasce no local onde soltou — ou seja, fora do visor!
  Por isso, `registrarInicioPonteiro` salva `ponteiroIniciouEmAreaPreservada = pertenceArea(evento.target, SELETOR_AREAS_PRESERVADAS)` logo no `pointerdown` / `mousedown`. Quando o `click` chega, se `iniciouPreservado` for `true` ou se `alvo.isConnected === false` (caso o elemento clicado tenha acabado de ser removido do DOM durante o clique, como "Carregar mais" ou sugestões 404), **o fechamento é bloqueado**.
- Também fecha ao pressionar a tecla **`Escape`** (`keydown`).

### 2. Sistema de Menus em Camadas Estilo RPG
A navegação inteira responde ao **Joystick D-Pad** (`#btn-dpad-cima/baixo/esquerda/direita`), ao **botão redondo de seleção** (`#btn-controle-selecionar`, sem texto impresso sobre o relevo circular), aos **botões vermelho/azul** (`#btn-limpar-form` / `#btn-limpar-visor`) e ao **teclado** (`↑ ↓ ← →`, `Enter`, `Backspace`, `Escape`).

Tudo gira em torno de 3 variáveis de estado:
- `rpgNivel`: controla a profundidade atual do menu:
  1. **`"telas"` (raiz):** escolhe qual das 4 telas controlar (`"busca"`, `"lista"`, `"visor"` ou `"slots"`).
  2. **`"itens"`:** navega nos botões/itens/slots *dentro* da tela escolhida.
  3. **`"edicao"`:** navega nos campos (`nome`, `apelido`, `Salvar`, `Cancelar`) ao editar um slot no painel de configuração.
- `rpgTela`: guarda qual das 4 telas está ativa.
- `rpgIndices`: objeto `{ busca: 0, visor: 0, slots: 0, edicao: 0 }` que lembra qual item estava destacado em cada painel (e na lista usa `indiceCursorLista`).

#### Movimentação entre telas (Desktop 2D vs. Mobile 1D)
- `estaModoDesktopRpg()` verifica `matchMedia("(min-width: 880px)").matches`.
- **Desktop (mapa em grade 2×2 — `MAPA_PROXIMA_TELA_DESKTOP`):**
  - `busca` <-> `direita` <-> `visor`
  - `lista` <-> `direita` <-> `slots`
  - `busca` <-> `baixo` <-> `lista` e `visor` <-> `baixo` <-> `slots`
- **Mobile (carrossel linear 1D — `ORDEM_TELAS_MOBILE`):**
  - Navega sequencialmente entre `["busca", "lista", "visor", "slots"]`.

#### Navegação dentro de cada tela (`navegarRpg`)
- **Lista (`"lista"`):** `DESLOCAMENTO_LISTA` faz `▲`/`▼` andar `1` item por vez e `◀`/`▶` saltar `5` itens por vez (`moverCursorLista`), chamando `scrollIntoView({ block: "nearest" })` para rolar a lista acompanhando o cursor.
- **Grade de Slots + Botão Amarelo (`"slots"`):** `calcularProximoIndiceSlots` entende a grade física de 2 linhas por 5 colunas (`0..4` na 1ª linha, `5..9` na 2ª linha, índice `10` = botão compacto amarelo `#btn-config-slots`). `▲`/`▼` pula de linha (1ª <-> 2ª <-> botão amarelo) e `◀`/`▶` anda horizontalmente entre botões vizinhos!
- **Visor sem botões (`"visor"` com Pokémon aberto):** quando não há botões interativos dentro do LCD, `▲`/`▼` rola suavemente o visor (`resultadoConteudo.scrollTop += 72 / -72`).
- **Busca (`"busca"`) e Edição (`"edicao"`):** anda entre os botões e inputs visíveis coletados dinamicamente por `coletarControlesInterativos()`.

#### Duplo uso dos botões Vermelho e Azul + Seleção Redonda / `Enter` / `Backspace`
- **Botão Redondo de Seleção (`#btn-controle-selecionar`) / Tecla `Enter` (`confirmarCursorRpg`):**
  - Na raiz (`"telas"`): entra na tela destacada (`entrarTelaRpg`).
  - Dentro de `"itens"` ou `"edicao"`: ativa o controle destacado (`confirmarElementoControle`) — busca o Pokémon selecionado na lista, foca ou submete o input, ativa o slot selecionado, abre o painel de edição pelo botão amarelo ou envia o formulário de edição.
- **Botão Azul (`#btn-limpar-visor` -> `avancarOuLimparVisorRpg`):**
  - **1º uso (Avançar menu):** sempre que estiver em `"telas"` ou com foco em um controle que abre submenu (`controleAtualAbreSubmenu()`, ou seja, `#btn-config-slots` nos slots ou botão `Editar` dentro da configuração), ele **entra** no menu/submenu selecionado.
  - **2º uso (Limpar visor):** quando já está em uma tela folha sem submenu (por exemplo, dentro da lista, dentro do campo de busca, em um slot comum ou na ficha do visor), limpa o Visor de Resultados (`limparVisorResultados()`).
- **Botão Vermelho (`#btn-limpar-form`) / Tecla `Backspace` fora de `<input>` (`voltarMenuRpg`):**
  - **1º uso (Voltar menu):** em `"edicao"` volta para a lista de configuração em `"visor"`; em `"itens"` volta para a raiz `"telas"`.
  - **2º uso (Limpar formulário):** quando já está na raiz `"telas"`, limpa o campo de pesquisa e restaura o catálogo (`limparFormulario()`).
- **`sincronizarTooltipsFenda()`** atualiza os `title` desses dois botões conforme o contexto atual do menu.

#### Lista em 2 cliques vs. Slots em 1 clique
- **Lista (`.catalogo-item`):** clicar uma vez em um Pokémon da lista (`!jaDestacado && detail < 2`) apenas destaca aquele Pokémon (`indiceCursorLista = indice`, `rpgTela = "lista"`, `rpgNivel = "itens"`); clicar novamente no item já selecionado (ou duplo clique, ou pressionar o botão redondo de seleção/`Enter`) executa a busca na API.
- **Slots da direita (`ativarSlotAzul`):** mantém ação imediata em 1 clique — se o slot estiver livre e houver Pokémon aberto, grava na hora; se estiver utilizado, carrega o Pokémon imediatamente.

---

## 9. Os 10 Botões de Slot da Direita (Cores por Estado) e Editor no Botão Amarelo

### Sinalização apenas por cor (sem números visíveis)
Os 10 botões em `#grade-slots-azuis` não exibem números nem nomes escritos por cima, reproduzindo teclas de plástico transparente iluminadas por baixo:
- **Livre (vazio):** cavidade azul escura (`#072238`) com luz de espera suave no fundo, coberta pela tampa plástica translúcida (`::before`) e reflexo especular (`::after`).
- **Utilizado (gravado, `.is-ocupado`):** LED verde aceso na base da cavidade (`#ecfdf5` -> `#4ade80` -> `#052e16`), atravessando o acrílico transparente com brilho externo contido.
- **Utilizado e aberto agora no Visor (`.is-ocupado.is-ativo`):** iluminação esmeralda intensa sob a tampa transparente (`#ffffff` -> `#bbf7d0` -> `#4ade80`) e borda clara (`#dcfce7`) para indicar qual slot corresponde ao Pokémon exibido.
- **Acessibilidade e tooltip preservados:** `sincronizarSlotsAzuis()` preenche `title` e `aria-label` informando o número do slot (`01..10`), estado (`livre` ou `utilizado`) e o nome/apelido do Pokémon salvo.

### Persistência segura em `localStorage`
- Os dados são guardados em JSON na chave `"pokedex_slots_salvos"` (`salvarSlotsNoStorage`).
- Na inicialização (`carregarSlotsSalvos`), um bloco `try/catch` faz `JSON.parse()` e valida cada posição manualmente (`typeof item.name === "string"` etc.) para a página nunca quebrar se o `localStorage` estiver corrompido ou bloqueado por navegação anônima restrita (`lerPreferencia`/`salvarPreferencia`).

### Painel de gerenciamento no botão amarelo (`#btn-config-slots`)
- `btnConfigSlots` (mantido compacto e sem texto visível, identificado via `aria-label` e `title`) alterna `renderizarConfiguracaoSlots()` / `fecharPainelConfigSlots()` no próprio visor LCD (`configSlotsAberta`), permitindo: **Abrir**, **Editar** (trocar nome/ID do Pokémon gravado ou dar um apelido), **Remover** individualmente, **Limpar todos** ou **Voltar ao visor**.

---

## 10. Decisões Técnicas, Trade-offs e Perguntas Frequentes de Arquitetura

Esta seção documenta os principais trade-offs técnicos da implementação e explica como os recursos nativos de HTML5, CSS3 e JavaScript puro substituem frameworks e bibliotecas externas sem abrir mão de robustez, segurança e acessibilidade:

### 1. *"Por que evitar `innerHTML` na montagem da ficha do Pokémon?"*
> **Decisão técnica:** Concatenar strings HTML com dados externos abre superfície para **XSS (Cross-Site Scripting)** caso algum payload contenha marcação ou atributos maliciosos. Usando `document.createElement()` (ou `createElementNS` para SVG) com **`textContent`** e `.replaceChildren()`, o navegador trata todo texto vindo da API estritamente como texto literal, nunca como código executável.

### 2. *"Como lidar com race conditions quando novas pesquisas acontecem antes da resposta anterior?"*
> **Decisão técnica:** Sem controle de concorrência, uma resposta mais lenta pode chegar depois e sobrescrever o resultado mais recente. Cada busca cria um **`AbortController`** próprio (`controladorAtual`). Antes de iniciar uma nova requisição, `controladorAtual?.abort()` cancela a anterior em nível de rede, além da validação `if (controladorAtual !== controller) return;` antes de renderizar.

### 3. *"Como diferenciar timeout de um cancelamento intencional por nova pesquisa?"*
> **Decisão técnica:** Tanto o timeout quanto uma busca sucessiva encerram o `fetch()` gerando `erro.name === "AbortError"` no `catch`. Uma flag booleana local `expirouPorTempo` é marcada como `true` exclusivamente pelo `setTimeout` de `10000ms` antes de acionar `controller.abort()`. No `tratarErroPesquisa`, se `AbortError && !expirouPorTempo`, o cancelamento retorna silenciosamente; se `expirouPorTempo` for `true`, uma mensagem de falha com o botão **Tentar novamente** é exibida.

### 4. *"Por que tratar HTTP 404 separado da rejeição da Promise no `fetch()`?"*
> **Decisão técnica:** Por especificação, `fetch()` **não rejeita a Promise em status HTTP 4xx ou 5xx** — ele só rejeita em erro de rede ou `AbortError`. Testando `resposta.status === 404` e `!resposta.ok` explicitamente e lançando a subclasse `ErroApi` tipada (`nao_encontrado` vs `comunicacao`), cada cenário renderiza uma interface específica e sugestões fonéticas para erros 404.

### 5. *"Por que combinar validação HTML5 no `<input>` com `novalidate` no `<form>`?"*
> **Decisão técnica:** O `<input>` mantém a semântica nativa (`required` e `pattern=".*\S.*"` para bloquear entradas apenas com espaços), inclusive estilizada via `:user-invalid` no CSS. O `novalidate` no `<form>` apenas suprime os balões nativos inconsistentes de cada navegador para que o JavaScript exiba o erro integrado dentro do painel, conectado por `aria-describedby` e `aria-invalid`.

### 6. *"Como funciona a abertura 3D sem que o verso fique espelhado nem o texto embaçado?"*
> **Decisão técnica:** A aba giratória possui duas faces no mesmo container 3D: frente (`rotateY(0deg)`) e verso (`rotateY(180deg)`), ambas com `backface-visibility: hidden`. Ao girar `-180deg` em `transform-origin: left center`, a frente desaparece após 90° e o verso termina alinhado em `0deg`. O card inferior permanece em `translateZ(1px)` e as faces em `translateZ(6px)` para evitar interseção em Z. Ao término de `1260ms`, o JS remove `.is-animando`, desligando `perspective` e `transform-style: preserve-3d` no CSS para que tudo volte ao plano 2D com nitidez idêntica dos dois lados.

### 7. *"Por que chamar `pokedexAparelho.getBoundingClientRect()` em `executarGiroPokedex` sem usar o retorno?"*
> **Decisão técnica:** Trata-se de um *reflow* síncrono intencional. Ao adicionar `.is-animando` e logo em seguida `.is-transicionando`, o navegador pode agrupar os dois estados no mesmo frame e pular diretamente para o estado final. Ler o layout com `getBoundingClientRect()` garante que o frame inicial 3D seja calculado antes de iniciar a transição CSS.

### 8. *"Por que utilizar o atributo nativo `inert` em vez de `display: none` na face oculta?"*
> **Decisão técnica:** Aplicar `display: none` removeria a tampa ou a base do fluxo de renderização instantaneamente e quebraria a rotação 3D. O atributo nativo **`inert`** preserva o elemento no palco visual 3D enquanto bloqueia cliques, navegação por `Tab` e leitura por tecnologias assistivas nos elementos fora de vista.

### 9. *"Como evitar que arrastar a barra de rolagem feche a Pokédex ao soltar o ponteiro fora dela?"*
> **Decisão técnica:** Quando o usuário pressiona o botão dentro de um painel rolável e solta fora do aparelho, o evento `click` dispara no alvo onde o ponteiro foi solto. Ao escutar `pointerdown` e `mousedown` antes do `click`, `ponteiroIniciouEmAreaPreservada` registra se a interação começou dentro de `.painel-busca`, `.painel-resultado`, controles, barra de cenários ou rodapé — cancelando o fechamento no `click` caso tenha iniciado em área protegida ou em elemento removido do DOM durante o clique (`isConnected === false`).

### 10. *"Como o sistema tolera erros de digitação como `'pikaxu'` sem bibliotecas de busca?"*
> **Decisão técnica:** O catálogo leve da PokéAPI é processado em 3 camadas em JS puro: (1) normalização Unicode `NFD` removendo diacríticos e pontuação; (2) chave fonética voltada à pronúncia em português (`ph->f`, `ch->x`, `qu->k`, `y->i`, remoção de duplicadas); e (3) algoritmo de **Damerau-Levenshtein** por programação dinâmica calculando inserções, remoções, substituições e transposições adjacentes com *early exit*.

### 11. *"Por que renderizar lotes de 150 itens em vez de todos os 1.300 Pokémon de uma vez?"*
> **Decisão técnica:** Criar milhares de nós DOM de uma só vez aumenta o tempo de montagem inicial e o custo de recalcular estilos em dispositivos mais simples. A renderização em lotes de `150` entradas expandidos conforme a rolagem (`scrollHeight - scrollTop - clientHeight < 120`) ou navegação por teclado mantém a responsividade em baixo consumo de memória.

### 12. *"Qual a diferença prática entre `@media` e `@container` neste projeto?"*
> **Decisão técnica:** `@media (min-width: 880px)` consulta a largura da **viewport inteira** para decidir entre layout horizontal ou vertical das asas. Já `@container visor (min-width: 340px)` consulta a largura isolada de **`.painel-resultado`** (`container-type: inline-size`), reorganizando os cards internos da ficha baseada no espaço real do componente.

### 13. *"Qual o papel de `@layer reset, base, components, utilities;` no CSS?"*
> **Decisão técnica:** Define explicitamente uma hierarquia em camadas na cascata: regras declaradas em camadas posteriores sempre vencem as anteriores sem depender de inflar especificidade de seletores nem recorrer a `!important`.

### 14. *"Por que definir `min-height: 0` e `min-width: 0` dentro de containers Flexbox?"*
> **Decisão técnica:** Em Flexbox, o valor padrão automático (`auto`) impede o item flex de encolher abaixo do conteúdo intrínseco, fazendo listas longas estourarem a caixa pai. Definir `0` permite ao `flex: 1` assumir a altura disponível e habilitar `overflow-y: auto` internamente.

### 15. *"Como a persistência reage caso o `localStorage` esteja bloqueado ou corrompido?"*
> **Decisão técnica:** As funções `lerPreferencia`, `salvarPreferencia` e `carregarSlotsSalvos` isolam o acesso ao armazenamento em blocos `try/catch` e validam o schema campo a campo (`Array.isArray`, `typeof item.name === "string"`). Em falha ou payload inválido, a aplicação adota padrões seguros e segue operando em memória sem exceções não tratadas.

### 16. *"Como listar mais de 1.300 nomes sem disparar centenas de requisições extras?"*
> **Decisão técnica:** A listagem inicial consome o endpoint leve `?limit=100000&offset=0`, que retorna apenas nome e URL de recurso, permitindo extrair o ID via expressão regular (`/\/(\d+)\/?$/`). As imagens (`sprites`) e atributos completos só são requisitados sob demanda ao selecionar um Pokémon específico.

### 17. *"Quais recursos nativos sustentam a acessibilidade por teclado e leitores de tela?"*
> **Decisão técnica:** Toda a operação é acessível via teclado (`Tab`, `Enter`, `Escape`, `Backspace` e setas `↑ ↓ ← →`), com *Skip Link*, bloqueio de painéis ocultos com `inert`, anúncios assíncronos via `aria-live="polite"` e `role="alert"`, rótulos descritivos (`aria-label`) em controles iconográficos, `:focus-visible`, `@media (prefers-reduced-motion: reduce)` e `@media (forced-colors: active)`.

### 18. *"Por que usar `:user-invalid` em vez de `:invalid` na estilização de formulários?"*
> **Decisão técnica:** `:invalid` marca campos `required` em vermelho imediatamente ao carregar a página. `:user-invalid` só aplica o estado de erro visual **depois** de o usuário interagir com o campo.

### 19. *"Como os pseudo-elementos `::before` e `::after` criam múltiplas camadas materiais sem sujar o HTML?"*
> **Decisão técnica:** Eles permitem simular superfícies físicas complexas em CSS puro mantendo a árvore DOM limpa e semântica: microtextura metálica (`.pokedex-ala::before`, `.painel-busca::before`, `.tampa-dobradica-lateral::before`), botões de acrílico transparente com tampas recuadas (`::before`) e reflexo especular (`::after`) sobre lâmpada interna em `.btn-slot-azul` e `.mini-visor-amarelo`, matriz LCD e vidro antirreflexo das telas da esquerda (`.painel-busca-form::before/.after`, `.pokemon-catalogo-area::before/.after`), cantoneiras em `.pokemon-imagem-box::before/.after` e brilho central em `.dpad-miolo::after` — todos com `pointer-events: none` para preservar cliques e scroll.

### 20. *"Por que utilizar aritmética modular `%` em `avancarProximoCenario()`?"*
> **Decisão técnica:** A expressão `(indiceAtual + 1) % CENARIOS_IDS.length` cria um ciclo circular exato que retorna ao índice `0` automaticamente após o último elemento (`(3 + 1) % 4 === 0`) sem ramificações condicionais extras.

### 21. *"Por que concentrar todo o código em apenas 3 arquivos principais em vez de dividir em pastas e módulos JS?"*
> **Decisão técnica:** Sem um *bundler* (Vite/Webpack) para unir dezenas de arquivos em produção, fragmentar o JavaScript com *ES Modules* (`type="module"`) impede abrir `index.html` diretamente via `file://` por bloqueio de **CORS** no navegador, enquanto fragmentar via múltiplos `<script defer>` clássicos poluiria o escopo global. Concentrar em `1` HTML declarativo, `1` CSS estruturado em `@layer` e `1` JS separado internamente por responsabilidades mantém compatibilidade universal (`file://` e servidor HTTP), menos requisições de rede e encapsulamento limpo.

---

## 11. Glossário Técnico Completo (Conceitos, Siglas, APIs e Ferramentas)

Esta seção define todos os termos técnicos, siglas, propriedades, APIs nativas, conceitos algorítmicos e ferramentas externas citados ao longo deste manual e do [README.md](README.md), contextualizando cada definição com o papel exato dentro do projeto.

### 11.1. Fundamentos da Web, DOM e Ecossistema (Vanilla JS vs. Ferramentas Externas)

- **JavaScript Vanilla (Vanilla JS):** JavaScript puro executado diretamente pelo motor do navegador (V8, SpiderMonkey, JavaScriptCore), utilizando apenas recursos nativos da linguagem (**ES6+** — *ECMAScript 2015* e revisões modernas) e das Web APIs, sem frameworks, bibliotecas de terceiros ou compiladores.
- **HTML5 (*HyperText Markup Language*, versão 5):** Linguagem de marcação responsável pela estrutura e significado do documento Web. A versão 5 consolidou elementos semânticos (`<nav>`, `<main>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<search>`), validação nativa de formulários e suporte integrado a multimídia e acessibilidade.
- **HTML Semântico:** Prática de escolher cada tag HTML pelo **significado** do conteúdo que ela representa, e não apenas pela aparência visual. Em vez de empilhar `<div>` e `<span>` genéricos, usam-se `<button>` para ações clicáveis, `<nav>` para blocos de navegação, `<search>` e `<form>` para pesquisa, `<ul>`/`<li>` para listas reais e `<fieldset>`/`<legend>` para grupos de controles. Isso permite que leitores de tela naveguem por regiões (*landmarks*), garante operação nativa via teclado e organiza a estrutura para motores de busca (**SEO** — *Search Engine Optimization*).
- **CSS3 (*Cascading Style Sheets*, versão 3):** Linguagem de folhas de estilo que descreve layout, cores, tipografia, responsividade e animações. O termo *Cascata* define as regras determinísticas pelas quais o navegador resolve conflitos quando várias regras atingem o mesmo elemento (ordem de camadas `@layer`, especificidade e ordem de declaração).
- **DOM (*Document Object Model*):** Representação em árvore viva na memória **RAM** (*Random Access Memory*) do navegador criada após a leitura do HTML. Cada tag, atributo e texto vira um nó que o JavaScript inspeciona e manipula em tempo real (`getElementById`, `querySelector`, `createElement`, `append`, `replaceChildren`, `textContent`).
  - *Nota de terminologia — DOM vs. ROM / RAM:* **DOM** não tem relação com **ROM** (*Read-Only Memory*, memória física permanente somente de leitura usada em chips de hardware e cartuchos clássicos); trata-se de uma estrutura de objetos em memória RAM gerenciada pelo motor do navegador para modelar documentos HTML/SVG.
- **Web APIs (APIs Nativas do Navegador):** Conjunto de interfaces padronizadas que o navegador entrega pronto fora do núcleo da linguagem JavaScript: `DOM`, `fetch()`, `AbortController`, `localStorage`, `matchMedia()`, `requestAnimationFrame()`, `setTimeout()`, `setInterval()` e `Intl.NumberFormat`.
- **Framework vs. Biblioteca:**
  - **Biblioteca:** pacote de funções utilitárias que **seu código chama** quando precisa (ex.: jQuery, Axios, Lodash).
  - **Framework:** arcabouço estrutural que define a arquitetura e o ciclo de vida, aplicando *Inversão de Controle* — isto é, **o framework chama o seu código** nos pontos que ele define (ex.: React, Angular, Vue).
- **React (JSX e *Virtual DOM*):** Ecossistema popular de interface baseado em componentes declarativos, *JSX* (sintaxe que mistura HTML dentro de JavaScript e exige compilação antes de rodar no navegador) e *Virtual DOM* (cópia em memória para calcular diferenças antes de atualizar a página). Neste projeto, funções puras de construção de elementos (`criarCaixaImagemPokemon`, `criarCabecalhoPokemon`) e `replaceChildren()` atualizam apenas os containers necessários sem precisar de JSX ou build.
- **jQuery:** Biblioteca JavaScript lançada em 2006 para unificar incompatibilidades entre navegadores antigos (como Internet Explorer 6–8) oferecendo o seletor `$()`, helpers de animação e `$.ajax()`. Nos navegadores modernos, `document.querySelector()` / `querySelectorAll()`, `element.classList`, `addEventListener()`, transições CSS e `fetch()` substituem o jQuery nativamente sem custo adicional de rede.
- **Tailwind CSS:** Framework CSS *utility-first* composto por milhares de classes utilitárias atômicas (`flex`, `p-4`, `rounded-lg`) geradas por uma etapa de build que varre os arquivos do projeto. Aqui, `@layer` + Design Tokens no `:root` cumprem o papel de padronização visual em CSS puro.
- **Axios:** Cliente HTTP externo baseado em `Promise` muito adotado por trazer timeout configurável, cancelamento e transformação automática de JSON quando `XMLHttpRequest` ainda predominava. Hoje, `fetch()` + `AbortController` + `setTimeout` + `ErroApi` entregam controle equivalente nativamente.
- **Lodash:** Biblioteca de utilitários gerais para arrays, objetos e strings (`uniq`, `sortBy`, `cloneDeep`, `debounce`). Recursos nativos modernos do JavaScript (`Array.prototype.map/filter/sort`, `Set`, `Map`, `String.prototype.normalize`, `Intl`) eliminam essa dependência externa.
- **Compiladores, *Bundlers* (Vite / Webpack) e Etapa de *Build*:** Ferramentas executadas em desenvolvimento (normalmente sobre Node.js) para transpilar sintaxes que o navegador não lê diretamente (JSX, TypeScript, Sass), empacotar dezenas de módulos em poucos arquivos (*bundling*), remover código não utilizado (*tree-shaking*) e minificar. Sem etapa de *build*, o navegador lê `index.html`, `css/style.css` e `js/app.js` diretamente, inclusive abrindo o arquivo local ou via servidor estático simples (*Live Server*).
- **ES Modules (`type="module"`, `import`/`export`) e Escopo Global (`globalThis`):** Sistema nativo de módulos do JavaScript moderno em que cada arquivo tem escopo isolado e compartilha funções explícitas via `export`/`import`. Scripts clássicos sem `type="module"` compartilham o mesmo escopo global da página (`globalThis`), razão pela qual um script único organizado evita colisões de nomes e mantém compatibilidade com `file://`.
- **Gerenciador de Estado:** Solução externa (como Redux ou Zustand) voltada a centralizar estados compartilhados entre centenas de componentes. Em Vanilla JS modularizado, constantes de estado de módulo (`rpgNivel`, `rpgTela`, `rpgIndices`, `catalogoPokemon`), persistência em `localStorage` e funções explícitas de sincronização mantêm previsibilidade sem dependências externas.
- **JSON (*JavaScript Object Notation*):** Formato textual leve e padronizado para troca de dados baseado em pares chave-valor e listas. `JSON.parse()` (ou `resposta.json()`) converte texto JSON em objeto JavaScript; `JSON.stringify()` converte objeto em texto para gravação (ex.: em `localStorage`).
- **UI (*User Interface*) vs. UX (*User Experience*):** **UI** refere-se à camada visual e interativa visível na tela (cores, tipografia, botões, visores, espaçamento); **UX** abrange a jornada e facilidade de uso completas (atalhos de teclado, proteção contra fechamento ao arrastar scroll, busca tolerante a erros de digitação e feedback imediato de erro/carregamento).
- **Trade-off:** Escolha consciente entre duas características concorrentes em engenharia (por exemplo: renderizar tudo em 3D permanente vs. desligar `preserve-3d` após a abertura para trocar efeito espacial contínuo por máxima nitidez de texto).

---

### 11.2. HTML5, Semântica, Acessibilidade (`a11y`) e Segurança

- **Acessibilidade Digital (`a11y`):** Numerônimo de *accessibility* (11 letras entre `a` e `y`). Conjunto de práticas para garantir que todas as pessoas — incluindo usuários cegos ou com baixa visão, pessoas com limitações motoras que operam apenas teclado ou usuários em modo de alto contraste — percebam, naveguem, interajam e compreendam a interface.
- **WAI-ARIA (*Web Accessibility Initiative – Accessible Rich Internet Applications*):** Especificação do **W3C** (*World Wide Web Consortium*) que fornece atributos (`role`, `aria-*`) para descrever estados e comportamentos dinâmicos a tecnologias assistivas quando o HTML puro não consegue expressá-los sozinho.
- **Leitor de Tela (*Screen Reader*):** Software assistivo (como NVDA, JAWS, VoiceOver e TalkBack) que converte a árvore de acessibilidade da página em voz sintetizada ou saída Braille.
- **Landmarks (Regiões Estruturais):** Tags semânticas (`<header>`, `<nav>`, `<main>`, `<search>`, `<section>`, `<footer>`) que delimitam grandes blocos da página e permitem que usuários de leitor de tela saltem diretamente ao bloco desejado.
- **Skip Link (`.skip-link`):** Link posicionado no topo do documento, oculto visualmente até receber foco via `Tab`, que transporta o foco diretamente para `#conteudo-principal` (`tabindex="-1"`), poupando o usuário de teclado de percorrer controles anteriores repetidamente.
- **Atributo `defer`:** Diretiva booleana na tag `<script src="js/app.js" defer>` que baixa o JavaScript em paralelo ao carregamento do HTML e adia sua execução até o DOM estar totalmente construído, preservando a ordem entre scripts.
- **Modo Estrito (`"use strict";`), `let` / `const` e `null`:** Diretiva JavaScript que impede criação acidental de variáveis globais sem declaração, rejeita atribuições silenciosamente inválidas e melhora a segurança do código. `const` bloqueia reatribuição da variável; `let` permite reatribuição em escopo de bloco; `null` indica ausência intencional de objeto/nó (como quando um elemento buscado não existe).
- **Atributos Customizados `data-*`:** Padrão HTML5 para armazenar estado ou identificadores diretamente em tags (`data-aberta`, `data-cenario-id`, `data-error`), acessíveis tanto em CSS (`[data-aberta="true"]`) quanto em JS (`elemento.dataset`).
- **Validação HTML5 (`required`, `pattern`, `novalidate`) e `:user-invalid`:** `required` exige preenchimento; `pattern=".*\S.*"` valida via expressão regular que não há apenas espaços; `novalidate` desliga os balões de erro padrão de cada navegador para que o JS e o CSS exibam erro unificado; `:user-invalid` diferencia de `:invalid` por só destacar erro **após** o usuário interagir com o campo.
- **Atributos de Entrada Mobile (`autocorrect`, `autocapitalize`, `spellcheck`, `enterkeyhint`):** Desativam correção ortográfica e maiúscula automática em nomes em inglês de Pokémon e alteram a tecla Enter do teclado virtual para o rótulo/ícone de busca (`"search"`).
- **Atributos ARIA principais do projeto:**
  - `aria-hidden="true"`: remove ícones, **LEDs** (*Light Emitting Diodes* — diodos emissores de luz), Pokébolas decorativas e fundos visuais da árvore lida por leitores de tela.
  - `aria-label` e `aria-labelledby`: definem o nome acessível de botões sem texto visível (D-Pad, slots, botão amarelo) ou conectam uma `<section>` ao texto do seu título (`<h2>`).
  - `aria-expanded` e `aria-controls`: indicam em `#btn-abrir-pokedex` se a tampa está aberta (`"true"`) ou fechada (`"false"`) e quais IDs de região ela controla.
  - `aria-pressed` (Botão *Toggle* / Alternância): indica estado ligado/desligado persistente em botões de cenário, `Auto: ON/OFF` e `#btn-config-slots`.
  - `aria-current="true"`: identifica qual item do catálogo corresponde ao Pokémon atualmente carregado no visor.
  - `aria-live="polite"`, `aria-busy` e `role="alert"`: `aria-live="polite"` anuncia atualizações no visor quando o leitor termina a frase atual; `aria-busy="true"` sinaliza carregamento em curso; `role="alert"` anuncia falhas graves imediatamente.
  - `aria-invalid` e `aria-describedby`: marcam erro no input e conectam simultaneamente o texto da dica (`pokemon-dica`) e a mensagem de erro (`pokemon-erro-campo`).
- **Atributo `inert`:** Atributo nativo do HTML que torna um bloco inteiro (e todos os seus descendentes) não clicável, não focável via `Tab` e invisível para leitores de tela enquanto está oculto/virado, sem removê-lo visualmente da animação 3D.
- **`:focus-visible`:** Pseudo-classe que mostra o anel de foco apenas quando o navegador identifica navegação por teclado ou assistiva, evitando bordas indesejadas em cliques rápidos com mouse sem prejudicar a acessibilidade.
- **`prefers-reduced-motion: reduce` e `matchMedia()`:** *Media feature* do sistema operacional para usuários com sensibilidade a movimento. Lida pelo CSS (`@media`) e pelo JS (`matchMedia("(prefers-reduced-motion: reduce)")`), desativa rotações 3D, reflexo dinâmico ao ponteiro e alternância automática de cenários.
- **`forced-colors: active` (`CanvasText`, `Highlight`):** Modo Alto Contraste do sistema (como Windows Alto Contraste), no qual o navegador substitui paletas customizadas por cores do sistema operacional; o CSS oculta camadas decorativas e restaura bordas sólidas com palavras-chave de sistema (`CanvasText`, `Highlight`).
- **XSS (*Cross-Site Scripting*), `innerHTML` vs. `createElement` / `createElementNS` / `textContent` / `replaceChildren`:** *XSS* é uma vulnerabilidade em que strings externas injetam tags HTML ou JavaScript executável na página (risco clássico de `innerHTML`). Criando nós via `document.createElement()` (HTML) e `createElementNS()` (SVG) com `textContent` e substituindo filhos via `.replaceChildren()`, todo conteúdo da API é tratado estritamente como texto plano seguro.
- **Tabnabbing, `window.opener` e `rel="noopener noreferrer"`:** *Tabnabbing* ocorre quando um link externo aberto em nova aba (`target="_blank"`) usa `window.opener` para redirecionar a aba original para uma página falsa. `noopener` corta a referência `window.opener`; `noreferrer` omite o cabeçalho HTTP `Referer` para preservar privacidade.

---

### 11.3. Design System, Cores Perceptuais (`oklch`), `@property`, Microtexturas e CSS Moderno

- **Design System (Sistema de Design):** Conjunto coeso de princípios visuais, tokens de cor/espaçamento/tipografia, regras de acessibilidade e padrões de componentes que mantém consistência visual e comportamental em toda a interface.
- **Tokens Visuais (*Design Tokens*):** Variáveis CSS semânticas (`--nome`) definidas em `:root` divididas em **Tokens Primitivos** (valores brutos nomeados pela escala, como `--palette-red-600`, `--metal-carcaca-base`) e **Tokens Semânticos** (papéis funcionais, como `--cor-destaque`, `--bg-resultado`, `--texto-lcd-principal`). Alterar um token propaga a mudança com consistência para todos os componentes ligados a ele.
- **Espaço de Cor `oklch(L C H)` vs. Hexadecimal (`#rrggbb`) e `rgba()`:**
  - **Hexadecimal / RGB (`#rrggbb`, `rgba()`):** modelo voltado ao hardware de tela (mistura de Vermelho, Verde e Azul + transparência `alpha`). Na transição entre tons, o brilho percebido oscila e gera faixas opacas no meio de gradientes.
  - **`oklch(L C H)` (*Oklab Lightness, Chroma, Hue*):** modelo baseado na percepção visual humana — **L** define luminosidade (`0` preto a `1` branco), **C** define saturação/croma e **H** define o matiz em graus (`0°–360°`). Permite construir reflexos metálicos e plásticos variando luminosidade com aparência uniforme e realista sem desbotar a cor.
- **Propriedades Animáveis CSS (`@property`):** Regra da especificação *CSS Properties and Values API* que registra variáveis CSS customizadas com tipo explícito (`syntax`), herança (`inherits`) e valor inicial (`initial-value`). Ao declarar `@property --luz-x` e `@property --luz-y` como `<percentage>`, o navegador consegue **interpolar numericamente** a posição da luz sobre a carcaça metálica em transições suaves, em vez de tratá-las como strings estáticas.
- **Microtexturas Vetoriais Inline (`data:image/svg+xml` / Data URI) e Shaders Procedurais:** Técnica de incorporar gráficos **SVG** (*Scalable Vector Graphics*, baseados em geometria vetorial e filtros matemáticos em vez de imagens bitmap em grade fixa de pixels como PNG/JPEG) diretamente dentro de CSS via *Data URI* (`url("data:image/svg+xml,...")`). Os filtros atuam como pequenos **shaders procedurais** — calculando ruído e iluminação diretamente na renderização com resolução infinita e zero requisições HTTP extras.
- **Filtros SVG usados nas texturas:**
  - `<filter>` + **`feTurbulence`** (`type="fractalNoise"`, `stitchTiles="stitch"`): gera ruído fractal contínuo e repetível sem emendas nas bordas.
  - **`feColorMatrix`** (`type="saturate" values="0"`): remove saturação cromática do ruído para formar granulação neutra no metal (`--textura-metal-floco`).
  - **`feDiffuseLighting` + `feDistantLight`**: trata o ruído como mapa de relevo microscópico iluminado sob determinado ângulo, simulando a textura áspera moldada de **plástico ABS** (*Acrilonitrila Butadieno Estireno*) em `--textura-plastico-grao`.
  - **`feComponentTransfer` (`feFuncR/G/B/A`)**: ajusta linearmente intensidade e transparência alfa dos grãos.
- **`mix-blend-mode` (`soft-light`, `overlay`):** Define matematicamente como uma camada superior (microtextura ou brilho) se mistura às cores abaixo dela, preservando reflexos e sombras sem cobrir a carcaça com cinza sólido.
- **Camadas Óticas (Backlight, Vinheta, Gradientes e Reflexo Especular):**
  - *Backlight:* iluminação traseira concentrada por trás da cavidade dos botões ou atrás da matriz de cristal líquido (**LCD** — *Liquid Crystal Display*).
  - *Vinheta:* escurecimento sutil nas bordas internas para criar sensação de profundidade física e vidro rebaixado.
  - *Gradientes (`linear-gradient`, `radial-gradient`, `repeating-linear-gradient`):* transições lineares, elípticas (fontes de luz) e repetidas em faixa (usadas nas saídas de som e grades de pixel).
  - *Reflexo especular:* brilho concentrado e nítido na superfície lisa de vidro ou tampa transparente em acrílico (`::after` da câmera, LEDs e botões de slot).
- **Pseudo-elementos (`::before`, `::after`) vs. Pseudo-classes (`:hover`, `:active`, `:where()`, `:not()`):** Pseudo-elementos criam até duas camadas gráficas extras dentro de um elemento sem adicionar tags extras ao HTML (sempre com `pointer-events: none` quando decorativos para não bloquear cliques/scroll); pseudo-classes filtram estados ou condições de elementos reais.
- **`@layer` (*CSS Cascade Layers*), `@import` e `!important`:** `@layer reset, base, components, utilities;` cria camadas hierárquicas de cascata onde estilos da camada posterior sempre superam os da anterior, dispensando `!important` (regra de qualidade `css:S9423` no SonarQube) e mantendo o código limpo. Já `@import` carrega arquivos CSS de dentro de outro CSS em cascata sequencial (mais lento que `<link>` direto no HTML ou um único `style.css`).
- **Especificidade CSS:** Cálculo de peso entre seletores (`ID` > `classe / atributo / pseudo-classe` > `tag / pseudo-elemento`) dentro de uma mesma `@layer`. Manter seletores em ordem crescente de especificidade evita conflitos silenciosos (`css:S4662`).
- **`box-sizing: border-box` e Propriedades Lógicas (`min-inline-size`):** Com `border-box`, largura e altura incluem `padding` e `border`, evitando estouro de tamanho; propriedades lógicas (`inline-size`, `min-inline-size: 0`) adaptam-se ao eixo de leitura horizontal/vertical e destravam o encolhimento de `<fieldset>` no Flexbox.
- **Flexbox (`display: flex`), `flex: 1`, `min-height: 0` e `min-width: 0`:** Sistema de layout unidimensional (linha ou coluna). Como o valor padrão `min-height: auto` impede containers flex de ficarem menores que listas longas, definir `0` em `.painel-busca`, `.pokemon-catalogo-area`, `.painel-resultado` e `#pokemon-catalogo` habilita a barra de rolagem interna (`overflow-y: auto`).
- ***Viewport* e Unidades (`rem`, `vw`, `dvh`):** *Viewport* é a janela útil de visualização; `rem` (*root em*) escala proporcionalmente à fonte raiz (`<html>`); `vw` (*viewport width*) equivale a `1%` da largura da janela; `dvh` (*Dynamic Viewport Height*) recalcula a altura útil dinamicamente quando barras de endereço móveis surgem ou somem.
- **Funções Matemáticas CSS (`min()`, `clamp()`, `calc()`):** Calculam limites responsivos diretamente no CSS sem media queries redundantes (`clamp(mínimo, preferencial, máximo)`).
- **Media Queries (`@media`) vs. Container Queries (`@container`):** `@media` adapta o layout ao tamanho da janela inteira ou preferências do sistema; `@container` (`container-type: inline-size`) permite que `.painel-resultado` reorganize seu conteúdo interno com base apenas em sua própria largura disponível.
- **Cinemática 3D CSS (`perspective`, `preserve-3d`, `backface-visibility`, `transform-origin`, `rotateX/Y`, `translateX/Z`):** `perspective` define a distância virtual da câmera; `transform-style: preserve-3d` preserva filhos no eixo Z; `backface-visibility: hidden` oculta faces viradas para trás; `transform-origin` posiciona o pivô da dobradiça (`left center` ou `top center`).
- **GPU, Rasterização e *Subpixel Interpolation*:** A **GPU** (*Graphics Processing Unit*) acelera composições 3D em texturas projetadas, mas manter textos estáticos rotacionados em `preserve-3d` aplica interpolação subpixel e gera leve desfoque — resolvido desligando `preserve-3d` e `perspective` ao concluir os `1260ms` de abertura.
- **Reflow Síncrono (`getBoundingClientRect()`), `requestAnimationFrame()` e `cubic-bezier()`:** *Reflow* (recalculação de geometria/layout) provocado entre a aplicação de `.is-animando` e `.is-transicionando` impede que o navegador junte os dois estados no mesmo frame e pule a transição; `requestAnimationFrame()` (*rAF*) sincroniza atualizações de luz do mouse à taxa de quadros do monitor (~60–120 **FPS** — *Frames Per Second*); `cubic-bezier()` define a curva de aceleração suave da dobradiça.
- **`@keyframes`, *Crossfade*, *Skeleton Loading*, `object-fit`, `clip-path`, `outline`, `tabular-nums`, `overflow-wrap` e *Favicon*:**
  - `@keyframes`: linha do tempo de animações contínuas (`pulsar`, `pulso-lente`, `flash-disparo`).
  - *Crossfade*: transição cruzada suave de `opacity` entre imagens empilhadas (`object-fit: cover` preenche sem distorcer; `object-position` ajusta o recorte).
  - *Skeleton Loading*: blocos provisórios animados exibidos enquanto dados chegam, mantendo a altura final reservada.
  - `clip-path`: recorte poligonal/retangular vetorial (usado em `.trava-triangulo` e `.visually-hidden`).
  - `outline` vs. `border` vs. `box-shadow`: `outline` (usado no foco `.is-rpg-foco`) desenha fora da caixa **sem ocupar espaço no layout nem deslocar botões vizinhos** como faria uma alteração de `border`.
  - `tabular-nums`: força todos os algarismos a terem a mesma largura fixa para números e tabelas alinharem verticalmente.
  - `overflow-wrap: anywhere`: quebra palavras ou identificadores muito longos antes de vazarem da borda do container.
  - *Favicon*: ícone exibido na aba e favoritos do navegador ([assets/favicon.svg](assets/favicon.svg)).

---

### 11.4. Rede, Performance (*Core Web Vitals*), Persistência e Algoritmos

- ***Core Web Vitals* — LCP e CLS (`fetchpriority="high"`, `decoding="async"`):**
  - **LCP (*Largest Contentful Paint*):** métrica que mede quanto tempo o maior elemento visual inicial leva para aparecer. Otimizado com `fetchpriority="high"` na imagem de cenário inicial e no sprite principal.
  - **CLS (*Cumulative Layout Shift*):** métrica que mede saltos inesperados de elementos na tela enquanto a página carrega. Evitado com dimensões declaradas (`width`/`height`), espaços reservados e *Skeleton Loading*.
  - **`decoding="async"`:** permite decodificar imagens secundárias fora da linha crítica de renderização inicial.
- **API, *Endpoint*, API REST e HTTP Status Codes (`200`, `404`, `429`, `500`, `502`):** **API** (*Application Programming Interface*) é o contrato de integração entre sistemas; **API REST** (*Representational State Transfer*) expõe recursos por endereços **URL** (*Uniform Resource Locator* — **endpoints**) usando verbos do protocolo **HTTP** (*Hypertext Transfer Protocol*, ex.: `GET https://pokeapi.co/api/v2/pokemon/25`). Códigos HTTP sinalizam o resultado: `200` (sucesso), `404` (não encontrado), `429` (limite de taxa excedido), `500`/`502` (erro no servidor remoto).
- **CORS (*Cross-Origin Resource Sharing*) e Protocolo `file://` vs. `http://`:** Mecanismo de segurança dos navegadores que controla quais origens podem ler recursos via JavaScript. Ao abrir um HTML direto do disco com protocolo `file://`, scripts com `type="module"` são bloqueados por CORS pela maioria dos navegadores (exigindo servidor `http://` ou `https://`), enquanto `<script src="..." defer>` clássico funciona nos dois modos.
- **`fetch()`, `Promise`, `async/await`, `try/catch/finally` e Herança (`extends Error`):** `fetch()` realiza requisições de rede assíncronas e devolve uma **`Promise`** (representação de uma operação que concluirá com valor ou erro no futuro). `async/await` torna o código assíncrono linear para leitura; `try/catch/finally` trata exceções tipadas (subclasse `ErroApi extends Error`) e sempre executa limpeza de timers e travas no `finally`.
- ***Timeout*, *Race Condition* e `AbortController` (`AbortError`):** *Race Condition* (condição de corrida) acontece quando requisições anteriores atrasam e chegam depois de buscas mais recentes, sobrescrevendo o resultado certo. `AbortController` fornece um `signal` capaz de cancelar `fetch()` ainda na rede (`AbortError`), além de permitir *timeout* explícito com `setTimeout`/`clearTimeout`.
- ***Lazy Loading* e *Cache* em Memória:** Carregamento tardio sob demanda (`garantirCatalogoCarregado` evita baixar os nomes dos mais de 1.300 Pokémon até a Pokédex abrir ou a busca receber foco) aliado ao *cache* em variável de módulo (`catalogoPokemon`) para não repetir o download durante a sessão.
- ***Batch Rendering* (Renderização em Lotes) e *Infinite Scroll*:** Em vez de inserir mais de mil `<li>` no DOM de uma só vez, a lista renderiza `150` itens por bloco e anexa o próximo lote automaticamente ao detectar proximidade do final da rolagem (`scrollHeight - scrollTop - clientHeight < 120`, onde `scrollHeight` é a altura total do conteúdo, `scrollTop` é o quanto já rolou e `clientHeight` é a área visível).
- **Busca *Fuzzy*, Normalização Unicode `NFD`, Diacríticos e `RegExp`:** Busca *fuzzy* (aproximada) encontra resultados mesmo com erros ortográficos. `.normalize("NFD")` separa caracteres Unicode acentuados em letra base + marca diacrítica combinante (`é` -> `e` + `´`), permitindo que uma **RegEx** (*Regular Expression* — expressão de padrão textual, como `/[\u0300-\u036f]/g`) remova acentos, ou extraia IDs numéricos de URLs (`/\/(\d+)\/?$/`).
- **Chave Fonética, Algoritmo Damerau-Levenshtein, Programação Dinâmica e *Early Exit*:** A chave fonética aproxima grafias em português da pronúncia original (`"pikaxu"` -> `"picaxu"`). Já a distância de **Damerau-Levenshtein** usa uma tabela de **programação dinâmica** (matriz que reaproveita cálculos intermediários de prefixos) para medir o mínimo de edições entre duas strings — inserção, remoção, substituição e **transposição de letras adjacentes** (`pikahcu` -> `pikachu`) — com **early exit** (abandono imediato antes de alocar matriz quando a diferença de tamanho excede o limite aceito).
- **Fallback:** Estratégia reserva acionada quando o recurso principal falha (ex.: exibir arte padrão se faltar artwork oficial, ou texto seguro caso imagens falhem).
- **`Intl.NumberFormat` e Conversão `dm`/`hg`:** API nativa de internacionalização que formata decimais segundo regras locais (`pt-BR`, vírgula decimal). Converte as unidades padrão da PokéAPI — decímetros (`dm`, 1 m = 10 dm) e hectogramas (`hg`, 1 kg = 10 hg) — em metros e quilogramas.
- **`localStorage` e Validação de *Schema*:** Armazenamento persistente chave-valor no navegador por origem (protocolo + domínio + porta). Como dados locais podem estar indisponíveis ou alterados externamente, toda leitura/escrita usa `try/catch` e valida o *schema* (estrutura e tipo de cada campo) manualmente antes de restaurar slots ou cenários.
- **Eventos de Ponteiro (`pointerdown`, `mousedown`, `click`), `MouseEvent.detail`, `Node.isConnected` e `scrollIntoView()`:** Escutar `pointerdown`/`mousedown` antes de `click` garante detectar onde um arraste começou mesmo se o botão for solto fora da janela; `evento.detail` informa contagem de cliques (usado para selecionar em 1 clique e abrir em 2); `Node.isConnected` confirma se o elemento clicado ainda está anexado ao DOM; `scrollIntoView({ block: "nearest" })` mantém o cursor do teclado visível na lista.
- **`visibilitychange`, `document.hidden`, `setTimeout` e `setInterval`:** `visibilitychange` alerta quando o usuário muda de aba no navegador (`document.hidden === true`), pausando automaticamente o temporizador cíclico (`setInterval`) para economizar CPU e bateria.
- **Aritmética Modular (`%`):** Operador de resto da divisão inteira (`(indiceAtual + 1) % 4`) que cria rotação circular contínua (`0 -> 1 -> 2 -> 3 -> 0`) em uma única expressão sem `if/else`.
- **Máquina de Estados Finitos, D-Pad, Navegação Estilo RPG e *Tooltip* Nativo (`title`):** Modelo determinístico em que o controle físico só transita entre estados permitidos e previsíveis (`rpgNivel`: `"telas"` <-> `"itens"` <-> `"edicao"`), guiado pelo **D-Pad** (*Directional Pad* — direcional em cruz) em menus hierárquicos estilo **RPG** (*Role-Playing Game*) e sincronizando dinamicamente o atributo HTML `title` (*tooltip* nativo exibido ao repousar o mouse).
