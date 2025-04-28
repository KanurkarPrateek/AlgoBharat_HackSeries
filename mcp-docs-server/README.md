# MCP Docs Server

An MCP (Model Context Protocol) server that fetches real-time documentation updates from GitHub docs, discussions, and technical documentation websites. The server can be easily integrated with Discord bots or Slack bots.

## Features

- Real-time monitoring of GitHub documentation changes
- Integration with technical documentation websites
- Support for Discord and Slack bot integration
- Automatic updates when new versions or features are released
- LLM-ready data formatting

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file with your configuration:
```
GITHUB_TOKEN=your_github_token
PORT=3000
```
4. Start the server:
```bash
npm start
```

## MCP Protocol Implementation

This server implements the Model Context Protocol to provide:
- Resources: Documentation content from various sources
- Tools: APIs for fetching and searching documentation
- Real-time updates through WebSocket notifications

## Integration

### Discord Bot Integration
```javascript
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const mcpClient = new MCPClient('ws://localhost:3000');

// Connect to the MCP server and listen for updates
mcpClient.connect();
```

### Slack Bot Integration
```javascript
const { App } = require('@slack/bolt');
const mcpClient = new MCPClient('ws://localhost:3000');

// Connect to the MCP server and listen for updates
mcpClient.connect();
```

## License

MIT
