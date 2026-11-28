# `@pokeverse/mcp` — Game Devkit MCP Server

Servidor **Model Context Protocol (MCP)** em TypeScript estrito sobre transporte `stdio`, voltado para desenvolvimento de jogos no navegador com **Babylon.js + Havok Physics + Blender + Figma + Angular HUD**.

## Ferramentas expostas (`Tools`)

| Tool | Função |
| :--- | :--- |
| `inspect_glb_asset` | Faz parse binário GLB 2.0 (sem decodificadores nativos) e audita meshes, vértices, triângulos, materiais PBR, texturas embutidas, compressão Draco/KTX2, ossos (`<= 64`) e orçamento mobile WebGL. |
| `inspect_texture_assets` | Audita texturas (`.webp`, `.png`, `.jpg`, `.svg`, `.ktx2`) em diretórios do workspace, medindo dimensões reais nos cabeçalhos, alinhamento *power-of-two* e alertas de VRAM/tamanho. |
| `generate_procedural_texture` | Gera texturas SVG determinísticas (`grid`, `hex-holo`, `metal-brushed`, `scanline-hud`, `checker-uv`) com gravação restrita a `apps/web/public/assets/textures/generated/`. |
| `simulate_havok_physics` | Calcula métricas físicas (altura de salto, tempo no ar, energia cinética), valida colisores e gera código `@babylonjs/havok` (`PhysicsAggregate` / `PhysicsShapeType`). |
| `scaffold_babylon_scene` | Gera esqueletos TypeScript *tree-shaken* de cenas Babylon.js + Havok compatíveis com lazy-loading Angular e CSP estrita (`/assets/draco/`, `/assets/havok/`). |
| `build_character_blueprint` | Constrói e simula fichas de personagem sem classe (atributos, vitais, treino em cascata, arquétipos emergentes e contrato de cápsula/rig GLB) via `@pokeverse/shared`. |
| `audit_hud_tokens_and_contrast` | Valida contraste WCAG 2.2 AA/AAA, consulta tokens `--pv-*` de `_tokens.scss` e verifica limites de componentes/bundle Angular. |
| `run_workspace_check` | Executa scripts allowlisted (`typecheck:*`, `lint:*`, `audit:duplication`, `test:quality-gates`, `test:unit:*`, `build:*`) com timeout e saída limitada. |

## Recursos (`Resources`) e Prompts

- **Resources:** `pokeverse://devkit/architecture`, `pokeverse://devkit/design-tokens`, `pokeverse://devkit/assets-manifest`, `pokeverse://devkit/babylon-havok-presets` e `pokeverse://devkit/character-catalog`.
- **Prompts:** `create-game-hud-from-figma`, `design-babylon-character-and-physics` e `create-pbr-texture-pack`.

## Configuração no editor & Blender MCP

O workspace já inclui [`.vscode/mcp.json`](../../.vscode/mcp.json) (VS Code) e [`.mcp.json`](../../.mcp.json) (formato `mcpServers` para Antigravity, Cursor, Claude Desktop e Copilot CLI) configurando:

1. **`pokeverse-devkit`:** `node apps/mcp/dist/index.js` (compile antes com `npm run build:mcp`).
2. **`blender` (`mcp-for-blender`):** `uvx mcp-for-blender` — requer [`uv`](https://docs.astral.sh/uv/) no `PATH` e o add-on do repositório `ahujasid/mcp-for-blender` ativo no Blender (`N` > aba **MCP for Blender**).
