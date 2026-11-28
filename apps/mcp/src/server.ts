import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDevkitPrompts } from './prompts/register-devkit-prompts.js';
import { registerDevkitResources } from './resources/register-devkit-resources.js';
import { registerAssetTools } from './tools/register-asset-tools.js';
import { registerEngineTools } from './tools/register-engine-tools.js';
import { findRepoRoot } from './utils/path-sandbox.util.js';

export const MCP_SERVER_NAME = 'pokeverse-devkit';
export const MCP_SERVER_VERSION = '0.1.0';

export function createPokeverseMcpServer(repoRoot = findRepoRoot()): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  registerAssetTools(server, repoRoot);
  registerEngineTools(server, repoRoot);
  registerDevkitResources(server, repoRoot);
  registerDevkitPrompts(server);

  return server;
}
