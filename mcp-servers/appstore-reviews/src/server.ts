import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GetAppInfoSchema, GetReviewsSchema } from './tools.js';
import { fetchAppStoreAppInfo, fetchAppStoreReviews } from './client.js';

const server = new Server(
  {
    name: 'appstore-reviews-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_reviews',
        description: 'Fetch reviews for an app from the Apple App Store',
        inputSchema: {
          type: 'object',
          properties: {
            app_id: { type: 'string', description: 'The iTunes App ID (e.g. 1404684361)' },
            country: { type: 'string', description: '2-letter country code', default: 'in' },
            pages: { type: 'number', description: 'Number of pages to fetch (max 10)', default: 1 },
            sort_by: { type: 'string', enum: ['mostRecent', 'mostHelpful'], default: 'mostRecent' },
          },
          required: ['app_id'],
        },
      },
      {
        name: 'get_app_info',
        description: 'Fetch app metadata from the Apple App Store',
        inputSchema: {
          type: 'object',
          properties: {
            app_id: { type: 'string', description: 'The iTunes App ID' },
            country: { type: 'string', description: '2-letter country code', default: 'in' },
          },
          required: ['app_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_reviews') {
    const args = GetReviewsSchema.parse(request.params.arguments);
    const reviews = await fetchAppStoreReviews(args.app_id, args.country, args.pages, args.sort_by);
    return {
      content: [{ type: 'text', text: JSON.stringify(reviews) }],
    };
  }

  if (request.params.name === 'get_app_info') {
    const args = GetAppInfoSchema.parse(request.params.arguments);
    const info = await fetchAppStoreAppInfo(args.app_id, args.country);
    return {
      content: [{ type: 'text', text: JSON.stringify(info) }],
    };
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('App Store Reviews MCP server running on stdio');
}

main().catch(console.error);
