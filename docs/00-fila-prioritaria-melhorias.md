# Fila Prioritaria de Melhorias e Correcoes (Prioridade Maxima)

> **Regra de Governanca do Projeto:** A única precedência acima desta fila é a **Prioridade 0 (`P0-CI`) de CI/CD & SonarQube** ([`21-qualidade-de-codigo-sonarqube-e-regras.md`](21-qualidade-de-codigo-sonarqube-e-regras.md) + [`AGENTS.md §0`](../AGENTS.md#0-prioridade-máxima-absoluta-regras-de-cicd--portão-sonarqube-sempre-à-frente-do-resto)): se o CI/CD ou o SonarCloud acusar qualquer issue, vulnerabilidade ou duplicação, ela deve ser corrigida antes de avançar em qualquer item deste backlog.
> Abaixo do portão `P0-CI`, todo item listado neste documento tem **prioridade maxima (P0/P1)** na fila de execucao do PokéVerse OS e deve ser analisado e tratado **antes** da abertura de novas fases do roadmap geral ([`00-visao-geral-e-roadmap.md`](00-visao-geral-e-roadmap.md)).
> Sempre que uma feature nao ficar boa na usabilidade ou visual, ou surgir uma correcao urgente, registre aqui usando o template do final deste arquivo.

---

## 1. Pendencias Prioritarias (Backlog Ativo)

| ID | Prioridade | Area | Item / Descricao | Criterio de Conclusao |
| :--- | :---: | :--- | :--- | :--- |
| **MEL-02** | **P0** | Tela Inicial (`/inicio`) | **Definicao de Identidade e Conteudo do Hub Inicial:** a tela `/inicio` foi entregue propositalmente enxuta (nao-Pokedex) apos a tela classica `Iniciar Jogo` (`/`) aguardando ideias do dono do projeto. | Definir blocos definitivos (ex.: atalhos rapidos, destaques do dia, resumo de perfil/slots, noticias/eventos) e evoluir o layout sem poluir a tela. |
| **MEL-05** | **P2** | Museu das Regioes | **Museu Fase 2 (Mapas & Ginasios):** enriquecer o dossie limpo do Museu com lideres de ginasio, insignias e marcos visuais por regiao sem duplicar listas. | Exibir trilha de ginasios e insignias por regiao no inspetor sem recriar cards redundantes. |

---

## 2. Melhorias e Correcoes Entregues no Ciclo Atual

| ID | Area | Mudanca Aplicada | Status |
| :--- | :--- | :--- | :---: |
| **ENT-01** | Fluxo de Entrada (`/`) | Criada Tela de Titulo retro minimalista na rota `/` com foco exclusivo em **Iniciar Jogo** (`Enter`/`Space`/clique) sem topbar. | Concluido |
| **ENT-02** | Tela Inicial (`/inicio`) | Criado Hub inicial separado da Pokedex na rota `/inicio`; marca `PokéVerse OS` na topbar agora volta para `/inicio` em vez da Pokedex. | Concluido |
| **ENT-03** | Pokedex Unificada | Enciclopedia Global, Projetor Holocron 3D, Comparador 1v1 e a nova Calculadora de Atributos movidos para dentro do Visor da Pokedex (`/pokedex`). | Concluido |
| **ENT-04** | Busca -> Modos | Adicionados atalhos diretos na busca e no visor da Pokedex para enviar o Pokemon selecionado diretamente para o **Holocron 3D**, **Comparador 1v1** ou **Calculadora**. | Concluido |
| **ENT-05** | Holocron 3D | Corrigido bug em que o Pokemon girava junto com a camera ficando aparentemente parado: removido espelhamento da rotacao no eixo Y e implementado prisma 3D dupla-face + suporte a modelos `.glb`. | Concluido |
| **ENT-06** | Slots Azuis (Selecao) | Removida a modal de confirmacao ao clicar em botoes azuis ja salvos; clicar em um slot ocupado agora abre o Pokemon imediatamente sem sobrescrever. | Concluido |
| **ENT-07** | Slots Azuis (Reordenacao) | Adicionado **clicar e arrastar** (Drag-and-Drop) e botoes `↑`/`↓` na configuracao de slots para trocar/mover posicoes (persistencia local e `PATCH /api/v1/pokedex/slots/swap` em transacao ACID). | Concluido |
| **ENT-08** | Museu das Regioes (`/museu`) | Removida a grade duplicada de 9 cards abaixo da linha do tempo e reestruturado o dossie com foco unico, hierarquia limpa e integracao direta com Holocron e Enciclopedia dentro da Pokedex. | Concluido |
| **ENT-09** | Pokedex 3D (Visor — `MEL-03`) | Adicionado botao **Expandir / Recolher** (`#btn-visor-expand`) no cabecalho do Visor LCD com modal expandida sobre o backdrop (`Esc`, clique no scrim ou fechamento da tampa recolhem), preservando 100% da carcaca 3D quando recolhido. | Concluido |
| **ENT-10** | Calculadora Fase 2 (`MEL-04`) | Evoluida a calculadora com **25 naturezas oficiais**, **8 presets Smogon OU / VGC**, **Simulador de Dano 1v1** (STAB, eficacia 18 tipos Gen VI–IX, clima, critico, queimado, VGC spread, itens, golpe aprendido e 16 rolls + KO verdict) e **Import/Export Showdown** (`pokemon-battle-calc.ts` + `pokemon-showdown-spread.ts`). | Concluido |
| **ENT-11** | Busca Esquerda | Compactado o bloco de pesquisa em uma linha (`Buscar`) ampliando a area visivel da lista de Pokemon e adicionado scroll vertical temporario em `.painel-busca` para visualizar filtros + lista em telas menores. | Concluido |
| **ENT-12** | Visor Holograma (`MEL-03`) | Corrigido *stacking context* da aba esquerda sobre o visor expandido e adicionada animacao de projecao holografica: a Pokedex desliza para a base inferior como projetor enquanto feixe ciano (`.visor-holo-beam`) e visor translucido abrem acima. | Concluido |
| **ENT-13** | Holocron 3D (`MEL-01`) | Conectado streaming `.glb` (`1..1025`, regular/shiny) da `Pokemon-3D-api/assets` com `DRACOLoader` auto-hospedado (`/assets/draco/` via `scripts/sync-draco-assets.mjs`), `AnimationMixer` com seletor de clipes, animacao procedural *idle* para modelos sem esqueleto e sincronizacao automatica ao buscar outro Pokemon na aba 3D. | Concluido |
| **ENT-14** | Comparador 1v1 | Redesenhado `PokedexComparePanelComponent` para arena lado a lado (`Lado A` vs `Lado B`) com placar resumido `VS`, barras espelhadas, troca rapida inline e perfil defensivo limpo em layout compacto e expandido. | Concluido |

---

## 3. Template para Registrar Novas Melhorias ou Feats Ruims

Copie o bloco abaixo para adicionar novos itens no topo da secao 1:

```markdown
| **MEL-XX** | **P0/P1** | Modulo | **Titulo curto:** o que esta ruim hoje e o comportamento esperado. | Criterio objetivo para considerar resolvido. |
```
