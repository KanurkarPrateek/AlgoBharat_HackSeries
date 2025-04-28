import { Client, GatewayIntentBits } from 'discord.js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

class MCPClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messageHandlers = new Map();
    this.nextMessageId = 1;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('Connected to MCP server');
      this.initialize();
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      if (message.type === 'notification') {
        this.handleNotification(message);
      } else if (message.type === 'response') {
        const handler = this.messageHandlers.get(message.id);
        if (handler) {
          handler(message.result);
          this.messageHandlers.delete(message.id);
        }
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from MCP server');
      setTimeout(() => this.connect(), 5000);
    });
  }

  async initialize() {
    return this.sendRequest('initialize', {});
  }

  async searchDocs(query, source) {
    return this.sendRequest('executeTool', {
      tool: 'searchDocs',
      parameters: { query, source }
    });
  }

  async getLatestUpdates(source) {
    return this.sendRequest('executeTool', {
      tool: 'getLatestUpdates',
      parameters: { source }
    });
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId++;
      
      this.messageHandlers.set(id, resolve);
      
      this.ws.send(JSON.stringify({
        id,
        type: 'request',
        method,
        params
      }));
    });
  }

  handleNotification(message) {
    if (message.method === 'update') {
      this.onUpdate?.(message.params);
    }
  }
}

// Create Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Create MCP client
const mcpClient = new MCPClient('ws://localhost:3000');

// Connect to Discord
client.once('ready', () => {
  console.log('Discord bot is ready!');
});

// Handle commands
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!search')) {
    const query = message.content.slice(8);
    try {
      const results = await mcpClient.searchDocs(query, 'github');
      
      const docResults = results.docs.map(item => `📄 ${item.name}: ${item.html_url}`).join('\n');
      const discussionResults = results.discussions.map(item => 
        `💬 ${item.title} (${item.category}): ${item.url}`
      ).join('\n');

      const response = [
        '**Documentation Results:**',
        docResults || 'No documentation matches found.',
        '',
        '**Discussion Results:**',
        discussionResults || 'No discussion matches found.'
      ].join('\n');

      message.reply(response);
    } catch (error) {
      console.error('Search error:', error);
      message.reply('Error searching Algorand documentation.');
    }
  }

  if (message.content === '!updates') {
    try {
      const updates = await mcpClient.getLatestUpdates('github');
      
      const docUpdates = updates.docs.map(item => 
        `📄 ${item.message.split('\n')[0]} by ${item.author} - ${item.url}`
      ).join('\n');

      const discussionUpdates = updates.discussions.map(item => 
        `💬 ${item.title} (${item.category}) - ${item.commentCount} comments - ${item.url}`
      ).join('\n');

      const response = [
        '**Recent Documentation Updates:**',
        docUpdates || 'No recent documentation updates.',
        '',
        '**Recent Discussions:**',
        discussionUpdates || 'No recent discussions.'
      ].join('\n');

      message.reply(response);
    } catch (error) {
      console.error('Updates error:', error);
      message.reply('Error fetching Algorand updates.');
    }
  }
});

// Handle MCP updates
mcpClient.onUpdate = async (update) => {
  // Find the updates channel
  const channel = client.channels.cache.find(ch => ch.name === 'algorand-docs-updates');
  if (!channel) return;

  // Format and send the update
  const docUpdates = update.docs.map(item => 
    `📄 ${item.message.split('\n')[0]} by ${item.author} - ${item.url}`
  ).join('\n');

  const discussionUpdates = update.discussions.map(item => 
    `💬 ${item.title} (${item.category}) - ${item.commentCount} comments - ${item.url}`
  ).join('\n');

  const message = [
    '**New Algorand Documentation Updates**',
    '',
    '**Documentation Changes:**',
    docUpdates || 'No new documentation changes.',
    '',
    '**Recent Discussions:**',
    discussionUpdates || 'No new discussions.'
  ].join('\n');

  channel.send(message);
};

// Connect to Discord and MCP server
client.login(process.env.DISCORD_TOKEN);
mcpClient.connect();
