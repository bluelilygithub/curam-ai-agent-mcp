// mcp-server.js - ACTUAL MCP Protocol Implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Create MCP server instance
const server = new Server(
  {
    name: 'curam-ai-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// AI API Functions
async function callGeminiFlash(prompt) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Gemini Flash Error: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

async function callGeminiPro(prompt) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Gemini Pro Error: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

async function generateImage(prompt, style = 'photographic') {
  try {
    const response = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
        steps: 30,
        style_preset: style
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );
    
    return {
      image: response.data.artifacts[0].base64,
      seed: response.data.artifacts[0].seed
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Stability Error: ${error.response?.data?.message || error.message}`
    );
  }
}

// MCP Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'compare_gemini_models',
        description: 'Compare responses from Gemini 1.5 Flash and Gemini 1.5 Pro models',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to send to both models for comparison'
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'generate_image',
        description: 'Generate an image using Stable Diffusion XL',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Description of the image to generate'
            },
            style: {
              type: 'string',
              description: 'Art style for the image',
              enum: ['photographic', 'digital-art', 'cinematic', 'anime', 'fantasy-art'],
              default: 'photographic'
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'analyze_text',
        description: 'Analyze text with Gemini Pro for advanced reasoning tasks',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to analyze'
            },
            analysis_type: {
              type: 'string',
              description: 'Type of analysis to perform',
              enum: ['sentiment', 'summary', 'technical', 'creative', 'logical'],
              default: 'summary'
            }
          },
          required: ['text']
        }
      }
    ]
  };
});

// MCP Tool Handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'compare_gemini_models': {
        const { prompt } = args;
        
        if (!prompt || typeof prompt !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Prompt is required and must be a string');
        }

        // Call both models in parallel
        const [flashResponse, proResponse] = await Promise.all([
          callGeminiFlash(prompt),
          callGeminiPro(prompt)
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                prompt,
                comparison: {
                  gemini_flash: {
                    model: 'Gemini 1.5 Flash',
                    response: flashResponse,
                    characteristics: 'Fast, cost-effective, good for simple tasks'
                  },
                  gemini_pro: {
                    model: 'Gemini 1.5 Pro',
                    response: proResponse,
                    characteristics: 'Advanced reasoning, better for complex tasks'
                  }
                },
                analysis: {
                  flash_length: flashResponse.length,
                  pro_length: proResponse.length,
                  difference: 'Pro model typically provides more detailed and nuanced responses'
                },
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      case 'generate_image': {
        const { prompt, style = 'photographic' } = args;
        
        if (!prompt || typeof prompt !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Prompt is required and must be a string');
        }

        const result = await generateImage(prompt, style);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                prompt,
                style,
                image_data: `data:image/png;base64,${result.image}`,
                seed: result.seed,
                metadata: {
                  model: 'Stable Diffusion XL 1024',
                  dimensions: '1024x1024',
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ]
        };
      }

      case 'analyze_text': {
        const { text, analysis_type = 'summary' } = args;
        
        if (!text || typeof text !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Text is required and must be a string');
        }

        let analysisPrompt;
        switch (analysis_type) {
          case 'sentiment':
            analysisPrompt = `Analyze the sentiment of this text. Provide sentiment score (-1 to 1), emotional tone, and key sentiment indicators:\n\n${text}`;
            break;
          case 'summary':
            analysisPrompt = `Provide a concise summary of this text, highlighting the main points:\n\n${text}`;
            break;
          case 'technical':
            analysisPrompt = `Analyze this text from a technical perspective. Identify technical concepts, accuracy, and complexity level:\n\n${text}`;
            break;
          case 'creative':
            analysisPrompt = `Analyze the creative elements of this text. Look at literary devices, creativity, and artistic merit:\n\n${text}`;
            break;
          case 'logical':
            analysisPrompt = `Analyze the logical structure of this text. Identify arguments, reasoning patterns, and logical fallacies:\n\n${text}`;
            break;
          default:
            analysisPrompt = `Analyze this text:\n\n${text}`;
        }

        const analysis = await callGeminiPro(analysisPrompt);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                original_text: text,
                analysis_type,
                analysis,
                metadata: {
                  model: 'Gemini 1.5 Pro',
                  text_length: text.length,
                  analysis_length: analysis.length,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
  }
});

// Error handling
server.onerror = (error) => {
  console.error('[MCP Server Error]', error);
};

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down MCP server...');
  await server.close();
  process.exit(0);
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  
  console.log('🚀 Starting Curam AI MCP Server...');
  console.log('📋 Available tools:');
  console.log('   • compare_gemini_models - Compare Gemini Flash vs Pro');
  console.log('   • generate_image - Create images with Stable Diffusion XL');
  console.log('   • analyze_text - Advanced text analysis with Gemini Pro');
  console.log('💡 This server follows the MCP protocol specification');
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found - text tools will fail');
  }
  if (!process.env.STABILITY_API_KEY) {
    console.warn('⚠️  STABILITY_API_KEY not found - image generation will fail');
  }
  
  await server.connect(transport);
  console.log('✅ MCP Server connected and ready!');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default server;
