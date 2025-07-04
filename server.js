{
  "name": "curam-ai-agent-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP agent with Gemini models and Stability.AI image generation - REST API + MCP Protocol",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "mcp": "node mcp-server.js",
    "mcp-advanced": "node advanced-mcp-server.js",
    "test-mcp": "node test-mcp.js",
    "test-advanced": "node test-advanced-mcp.js",
    "demo": "node server.js",
    "demo-boss": "echo '🚀 Starting boss demo...' && npm run test-advanced"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.4.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "@types/node": "^20.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "mcp", 
    "model-context-protocol",
    "ai", 
    "gemini", 
    "stability", 
    "agent",
    "rest-api",
    "anthropic"
  ],
  "author": "Curam AI",
  "license": "MIT",
  "mcp": {
    "server": {
      "command": "node",
      "args": ["mcp-server.js"],
      "env": {
        "GEMINI_API_KEY": "your-gemini-key",
        "STABILITY_API_KEY": "your-stability-key"
      }
    }
  }
}
