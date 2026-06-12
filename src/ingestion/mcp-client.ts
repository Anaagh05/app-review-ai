import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

export interface McpServerConfig {
  command: string;
  args: string[];
}

export class McpClientWrapper {
  private transport: StdioClientTransport | null = null;
  public client: Client | null = null;

  constructor(private config: McpServerConfig) {}

  public async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
    });
    this.client = new Client(
      { name: 'pulse-agent', version: '1.0.0' },
      { capabilities: {} }
    );
    await this.client.connect(this.transport);
  }

  public async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.client) throw new Error('Client not connected');
    const response = await this.client.request(
      {
        method: 'tools/call',
        params: { name, arguments: args },
      },
      CallToolResultSchema
    );

    if (response.isError) {
      throw new Error(`Tool ${name} failed: ${JSON.stringify(response.content)}`);
    }

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent) {
      throw new Error(`Tool ${name} returned no text content`);
    }

    return JSON.parse((textContent as any).text);
  }

  public async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.client = null;
    }
  }
}
