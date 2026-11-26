# Fila Prioritaria de Melhorias e Correcoes (Prioridade Maxima)

> **Regra de Governanca do Projeto:** Todo item listado neste documento tem **prioridade maxima (P0/P1)** na fila de execucao do PokéVerse OS e deve ser analisado e tratado **antes** da abertura de novas fases do roadmap geral ([`00-visao-geral-e-roadmap.md`](00-visao-geral-e-roadmap.md)).
> Sempre que uma feature nao ficar boa na usabilidade ou visual, ou surgir uma correcao urgente, registre aqui usando o template do final deste arquivo.

---

## 1. Pendencias Prioritarias (Backlog Ativo)

| ID | Prioridade | Area | Item / Descricao | Criterio de Conclusao |
| :--- | :---: | :--- | :--- | :--- |
| **MEL-01** | **P0** | Holocron 3D | **Pacote de Modelos 3D Leves (`.glb` Draco):** a infraestrutura `GLTFLoader` + registro `LOCAL_POKEMON_GLB_MODELS` ja esta conectada ao projetor, mas faltam os assets `.glb` reais dos Pokemon para substituir o prisma holografico 2D dupla-face. | Disponibilizar pacote curado de `.glb` leves (ou streaming S3/CDN com fallback ao prisma 3D) para iniciais/favoritos e validar carregamento sem travar FPS. |
| **MEL-02** | **P0** | Tela Inicial (`/inicio`) | **Definicao de Identidade e Conteudo do Hub Inicial:** a tela `/inicio` foi entregue propositalmente enxuta (nao-Pokedex) apos a tela classica `Iniciar Jogo` (`/`) aguardando ideias do dono do projeto. | Definir blocos definitivos (ex.: atalhos rapidos, destaques do dia, resumo de perfil/slots, noticias/eventos) e evoluir o layout sem poluir a tela. |
| **MEL-03** | **P1** | Pokedex 3D (Visor) | **Modo Visor Expandido / Zoom no LCD:** como Enciclopedia, Comparador 1v1, Holocron 3D e Calculadora agora vivem dentro da Pokedex, telas menores (notebooks 13" e mobile) podem se beneficiar de um botao de expansao temporaria do visor. | Adicionar toggle de expansao controlada do visor mantendo 100% da carcaca 3D intacta quando recolhido. |
| **MEL-04** | **P1** | Calculadora de Atributos | **Calculadora Fase 2 (Competitivo & Dano):** evoluir a calculadora embarcada com presets Smogon/VGC, simulacao basica de dano entre dois Pokemon e importacao/exportacao de spreads em texto. | Permitir simular golpes com STAB/eficacia e exportar/importar build de EVs/IVs/Natureza. |
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

---

## 3. Template para Registrar Novas Melhorias ou Feats Ruims

Copie o bloco abaixo para adicionar novos itens no topo da secao 1:

```markdown
| **MEL-XX** | **P0/P1** | Modulo | **Titulo curto:** o que esta ruim hoje e o comportamento esperado. | Criterio objetivo para considerar resolvido. |
```
