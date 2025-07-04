{
  "name": "curam-ai-agent-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP agent with Gemini models and Stability.AI image generation - REST API + MCP Protocol",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "echo 'No build step required'",
    "demo": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  },
  "optionalDependencies": {
    "@modelcontextprotocol/sdk": "^0.4.0"
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
  "license": "MIT"
}
