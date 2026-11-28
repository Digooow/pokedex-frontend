import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_SERVER_NAME, createPokeverseMcpServer } from './server.js';

async function main(): Promise<void> {
  const server = createPokeverseMcpServer();
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.connect(transport);
  console.error(`[${MCP_SERVER_NAME}] stdio transport connected.`);
}

try {
  await main();
} catch (error) {
  console.error(`[${MCP_SERVER_NAME}] fatal startup error:`, error);
  process.exit(1);
}
