import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GetAppInfoSchema, GetReviewsSchema } from './tools.js';
import { fetchPlayStoreAppInfo, fetchPlayStoreReviews } from './scraper.js';

const server = new Server(
  {
    name: 'playstore-reviews-mcp',
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
        description: 'Fetch reviews for an app from the Google Play Store',
        inputSchema: {
          type: 'object',
          properties: {
            app_id: { type: 'string', description: 'The Google Play app ID (e.g. com.nextbillion.groww)' },
            lang: { type: 'string', description: 'Language code', default: 'en' },
            country: { type: 'string', description: 'Country code', default: 'in' },
            count: { type: 'number', description: 'Number of reviews to fetch (max 2000)', default: 200 },
            sort: { type: 'string', enum: ['newest', 'rating', 'helpfulness'], default: 'newest' },
          },
          required: ['app_id'],
        },
      },
      {
        name: 'get_app_info',
        description: 'Fetch app metadata from the Google Play Store',
        inputSchema: {
          type: 'object',
          properties: {
            app_id: { type: 'string', description: 'The Google Play app ID' },
            lang: { type: 'string', description: 'Language code', default: 'en' },
            country: { type: 'string', description: 'Country code', default: 'in' },
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
    const reviews = await fetchPlayStoreReviews(args.app_id, args.lang, args.country, args.count, args.sort);
    return {
      content: [{ type: 'text', text: JSON.stringify(reviews) }],
    };
  }

  if (request.params.name === 'get_app_info') {
    const args = GetAppInfoSchema.parse(request.params.arguments);
    const info = await fetchPlayStoreAppInfo(args.app_id, args.lang, args.country);
    return {
      content: [{ type: 'text', text: JSON.stringify(info) }],
    };
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Play Store Reviews MCP server running on stdio');
}

main().catch(console.error);
