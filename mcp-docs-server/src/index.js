import express from 'express';
import { WebSocketServer } from 'ws';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import Parser from 'rss-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Initialize RSS parser
const parser = new Parser();

// Store connected clients
const clients = new Set();

// MCP Server implementation
class MCPServer {
  constructor() {
    this.resources = new Map();
    this.tools = new Map();
    this.setupTools();
  }

  setupTools() {
    // Tool: Search documentation
    this.tools.set('searchDocs', {
      name: 'searchDocs',
      description: 'Search through documentation',
      parameters: {
        query: { type: 'string', description: 'Search query' },
        source: { type: 'string', description: 'Documentation source (github, docs)' }
      },
      execute: async ({ query, source }) => {
        switch (source) {
          case 'github':
            return this.searchGitHubDocs(query);
          case 'docs':
            return this.searchTechnicalDocs(query);
          default:
            throw new Error('Invalid source');
        }
      }
    });

    // Tool: Get latest updates
    this.tools.set('getLatestUpdates', {
      name: 'getLatestUpdates',
      description: 'Get latest documentation updates',
      parameters: {
        source: { type: 'string', description: 'Update source (github, docs)' }
      },
      execute: async ({ source }) => {
        switch (source) {
          case 'github':
            return this.getGitHubUpdates();
          case 'docs':
            return this.getTechnicalDocsUpdates();
          default:
            throw new Error('Invalid source');
        }
      }
    });
  }

  async searchGitHubDocs(query) {
    try {
      // Search in both docs and discussions
      const [docsResult, discussionsResult] = await Promise.all([
        // Search in documentation
        octokit.search.code({
          q: `${query} in:file language:md repo:algorandfoundation/docs`,
          per_page: 10
        }),
        // Search in discussions
        octokit.search.issuesAndPullRequests({
          q: `${query} repo:algorandfoundation/docs is:discussion`,
          per_page: 10
        })
      ]);

      return {
        docs: docsResult.data.items,
        discussions: discussionsResult.data.items.map(discussion => ({
          title: discussion.title,
          url: discussion.html_url,
          state: discussion.state,
          updatedAt: discussion.updated_at,
          category: discussion.category?.name || 'Uncategorized'
        }))
      };
    } catch (error) {
      console.error('Error searching GitHub docs:', error);
      throw error;
    }
  }

  async searchTechnicalDocs(query) {
    // Implement technical docs search based on your sources
    // This is a placeholder implementation
    return [];
  }

  async getGitHubUpdates() {
    try {
      const [repoUpdates, discussions] = await Promise.all([
        // Get latest documentation changes
        octokit.repos.listCommits({
          owner: 'algorandfoundation',
          repo: 'docs',
          per_page: 10
        }),
        // Get latest discussions
        octokit.graphql(`
          query {
            repository(owner: "algorandfoundation", name: "docs") {
              discussions(first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
                nodes {
                  title
                  url
                  category { name }
                  updatedAt
                  comments { totalCount }
                }
              }
            }
          }
        `)
      ]);

      return {
        docs: repoUpdates.data.map(commit => ({
          type: 'commit',
          message: commit.commit.message,
          url: commit.html_url,
          date: commit.commit.author.date,
          author: commit.commit.author.name
        })),
        discussions: discussions.repository.discussions.nodes.map(discussion => ({
          type: 'discussion',
          title: discussion.title,
          url: discussion.url,
          category: discussion.category?.name || 'Uncategorized',
          updatedAt: discussion.updatedAt,
          commentCount: discussion.comments.totalCount
        }))
      };
    } catch (error) {
      console.error('Error getting GitHub updates:', error);
      throw error;
    }
  }

  async getTechnicalDocsUpdates() {
    // Implement technical docs updates based on your sources
    // This is a placeholder implementation
    return [];
  }

  // MCP Protocol methods
  handleMessage(message, ws) {
    try {
      const { type, id, method, params } = JSON.parse(message);
      
      switch (method) {
        case 'initialize':
          this.handleInitialize(id, ws);
          break;
        case 'listTools':
          this.handleListTools(id, ws);
          break;
        case 'executeTool':
          this.handleExecuteTool(id, params, ws);
          break;
        default:
          this.sendError(id, 'Method not found', ws);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(null, 'Invalid message format', ws);
    }
  }

  handleInitialize(id, ws) {
    this.sendResponse(id, {
      capabilities: {
        tools: true,
        resources: true,
        notifications: true
      }
    }, ws);
  }

  handleListTools(id, ws) {
    this.sendResponse(id, {
      tools: Array.from(this.tools.values())
    }, ws);
  }

  async handleExecuteTool(id, params, ws) {
    try {
      const tool = this.tools.get(params.tool);
      if (!tool) {
        throw new Error('Tool not found');
      }

      const result = await tool.execute(params.parameters);
      this.sendResponse(id, { result }, ws);
    } catch (error) {
      this.sendError(id, error.message, ws);
    }
  }

  sendResponse(id, result, ws) {
    ws.send(JSON.stringify({
      id,
      type: 'response',
      result
    }));
  }

  sendError(id, error, ws) {
    ws.send(JSON.stringify({
      id,
      type: 'error',
      error: { message: error }
    }));
  }

  broadcastUpdate(update) {
    const message = JSON.stringify({
      type: 'notification',
      method: 'update',
      params: update
    });

    for (const client of clients) {
      client.send(message);
    }
  }
}

// Create MCP server instance
const mcpServer = new MCPServer();

// Set up WebSocket server
const server = app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.on('message', (message) => {
    mcpServer.handleMessage(message, ws);
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Set up periodic updates
setInterval(async () => {
  try {
    const [githubUpdates, docsUpdates] = await Promise.all([
      mcpServer.getGitHubUpdates(),
      mcpServer.getTechnicalDocsUpdates()
    ]);

    mcpServer.broadcastUpdate({
      github: githubUpdates,
      docs: docsUpdates
    });
  } catch (error) {
    console.error('Error fetching updates:', error);
  }
}, 5 * 60 * 1000); // Check for updates every 5 minutes

export default mcpServer;
