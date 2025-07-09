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

// NEW: Hugging Face API Functions
async function callHuggingFaceModel(prompt, modelId) {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${modelId}`,
      {
        inputs: prompt,
        parameters: {
          max_length: 100,
          temperature: 0.7,
          do_sample: true
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`
        }
      }
    );
    
    // Handle different response formats from Hugging Face
    if (Array.isArray(response.data) && response.data[0]?.generated_text) {
      return response.data[0].generated_text;
    } else if (typeof response.data === 'string') {
      return response.data;
    } else {
      return JSON.stringify(response.data);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Hugging Face ${modelId} Error: ${error.response?.data?.error || error.message}`
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

// NEW: Intelligent Model Selection Functions
async function analyzeTask(taskInput) {
  // Use Gemini Pro to analyze task complexity and requirements
  const analysisPrompt = `
    Analyze this task and provide a JSON response with:
    - task_type: "simple_question", "complex_analysis", "creative_writing", "technical", "classification"
    - complexity: "low", "medium", "high"
    - requirements: ["speed", "accuracy", "creativity", "reasoning", "classification"]
    - estimated_tokens: number
    - priority: "speed", "quality", "balance"
    
    Task: ${taskInput}
  `;
  
  try {
    const analysis = await callGeminiPro(analysisPrompt);
    return JSON.parse(analysis);
  } catch (error) {
    // Fallback analysis
    return {
      task_type: taskInput.length > 100 ? "complex_analysis" : "simple_question",
      complexity: taskInput.length > 200 ? "high" : taskInput.length > 50 ? "medium" : "low",
      requirements: taskInput.includes("creative") ? ["creativity"] : ["accuracy"],
      estimated_tokens: Math.ceil(taskInput.length / 4),
      priority: "balance"
    };
  }
}

async function selectOptimalModel(taskAnalysis) {
  const models = [
    {
      id: 'gemini_flash',
      name: 'Gemini 1.5 Flash',
      provider: 'Google',
      characteristics: ['speed', 'efficiency'],
      bestFor: ['simple_questions', 'quick_responses'],
      cost: 'low',
      speed: 'fast'
    },
    {
      id: 'gemini_pro',
      name: 'Gemini 1.5 Pro',
      provider: 'Google', 
      characteristics: ['reasoning', 'analysis'],
      bestFor: ['complex_analysis', 'reasoning'],
      cost: 'medium',
      speed: 'medium'
    },
    {
      id: 'gpt2',
      name: 'GPT-2',
      provider: 'Hugging Face',
      characteristics: ['creative_writing', 'text_generation'],
      bestFor: ['creative_writing', 'story_generation'],
      cost: 'very_low',
      speed: 'medium'
    },
    {
      id: 'bert-base-uncased',
      name: 'BERT',
      provider: 'Hugging Face',
      characteristics: ['text_understanding', 'classification'],
      bestFor: ['text_analysis', 'classification'],
      cost: 'very_low',
      speed: 'fast'
    }
  ];

  // Score each model based on task analysis
  const modelScores = models.map(model => {
    let score = 0;
    
    // Complexity matching
    if (taskAnalysis.complexity === 'low' && model.characteristics.includes('speed')) score += 3;
    if (taskAnalysis.complexity === 'high' && model.characteristics.includes('reasoning')) score += 3;
    
    // Task type matching
    if (taskAnalysis.task_type === 'creative_writing' && model.characteristics.includes('creative_writing')) score += 2;
    if (taskAnalysis.task_type === 'classification' && model.characteristics.includes('classification')) score += 2;
    if (taskAnalysis.task_type === 'complex_analysis' && model.characteristics.includes('analysis')) score += 2;
    
    // Priority matching
    if (taskAnalysis.priority === 'speed' && model.speed === 'fast') score += 1;
    if (taskAnalysis.priority === 'quality' && model.cost === 'medium') score += 1;
    
    return { ...model, score };
  });

  // Sort by score and return top model
  modelScores.sort((a, b) => b.score - a.score);
  return modelScores[0];
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
      },
      // NEW: Intelligent Model Selection Tools
      {
        name: 'intelligent_model_selection',
        description: 'MCP intelligently selects the optimal AI model based on task analysis',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The task or question to analyze and execute'
            },
            show_reasoning: {
              type: 'boolean',
              description: 'Whether to include detailed reasoning for model selection',
              default: true
            }
          },
          required: ['task']
        }
      },
      {
        name: 'compare_all_models',
        description: 'Compare responses across all available models (Google + Hugging Face)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to send to all models'
            },
            include_hugging_face: {
              type: 'boolean',
              description: 'Whether to include Hugging Face models in comparison',
              default: true
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'hugging_face_text_generation',
        description: 'Generate text using Hugging Face models (GPT-2, BERT, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text prompt for generation'
            },
            model_id: {
              type: 'string',
              description: 'Hugging Face model ID',
              enum: ['gpt2', 'bert-base-uncased', 't5-base'],
              default: 'gpt2'
            }
          },
          required: ['prompt']
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

      // NEW: Intelligent Model Selection Handler
      case 'intelligent_model_selection': {
        const { task, show_reasoning = true } = args;
        
        if (!task || typeof task !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Task is required and must be a string');
        }

        // Step 1: Analyze the task
        const taskAnalysis = await analyzeTask(task);
        
        // Step 2: Select optimal model
        const selectedModel = await selectOptimalModel(taskAnalysis);
        
        // Step 3: Execute with selected model
        let response;
        switch (selectedModel.id) {
          case 'gemini_flash':
            response = await callGeminiFlash(task);
            break;
          case 'gemini_pro':
            response = await callGeminiPro(task);
            break;
          case 'gpt2':
          case 'bert-base-uncased':
            response = await callHuggingFaceModel(task, selectedModel.id);
            break;
          default:
            response = await callGeminiFlash(task); // Fallback
        }

        const result = {
          task,
          task_analysis: taskAnalysis,
          selected_model: selectedModel,
          response,
          mcp_reasoning: show_reasoning ? {
            why_selected: `Selected ${selectedModel.name} because it matches task requirements: ${taskAnalysis.requirements.join(', ')}`,
            confidence_score: selectedModel.score / 10, // Normalize to 0-1
            alternatives_considered: ['gemini_flash', 'gemini_pro', 'gpt2', 'bert-base-uncased'].filter(id => id !== selectedModel.id)
          } : null,
          timestamp: new Date().toISOString()
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // NEW: Compare All Models Handler
      case 'compare_all_models': {
        const { prompt, include_hugging_face = true } = args;
        
        if (!prompt || typeof prompt !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Prompt is required and must be a string');
        }

        const models = [
          { id: 'gemini_flash', name: 'Gemini 1.5 Flash', call: () => callGeminiFlash(prompt) },
          { id: 'gemini_pro', name: 'Gemini 1.5 Pro', call: () => callGeminiPro(prompt) }
        ];

        if (include_hugging_face) {
          models.push(
            { id: 'gpt2', name: 'GPT-2 (Hugging Face)', call: () => callHuggingFaceModel(prompt, 'gpt2') },
            { id: 'bert-base-uncased', name: 'BERT (Hugging Face)', call: () => callHuggingFaceModel(prompt, 'bert-base-uncased') }
          );
        }

        const results = {};
        const promises = models.map(async (model) => {
          try {
            const startTime = Date.now();
            const response = await model.call();
            const endTime = Date.now();
            
            return {
              model_id: model.id,
              model_name: model.name,
              response,
              response_time: endTime - startTime,
              success: true
            };
          } catch (error) {
            return {
              model_id: model.id,
              model_name: model.name,
              error: error.message,
              success: false
            };
          }
        });

        const modelResults = await Promise.all(promises);
        modelResults.forEach(result => {
          results[result.model_id] = result;
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                prompt,
                comparison_results: results,
                summary: {
                  total_models: models.length,
                  successful_models: modelResults.filter(r => r.success).length,
                  average_response_time: modelResults.filter(r => r.success).reduce((sum, r) => sum + r.response_time, 0) / modelResults.filter(r => r.success).length
                },
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      // NEW: Hugging Face Text Generation Handler
      case 'hugging_face_text_generation': {
        const { prompt, model_id = 'gpt2' } = args;
        
        if (!prompt || typeof prompt !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Prompt is required and must be a string');
        }

        if (!process.env.HUGGING_FACE_API_KEY) {
          throw new McpError(ErrorCode.InternalError, 'Hugging Face API key not configured');
        }

        const response = await callHuggingFaceModel(prompt, model_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                prompt,
                model_id,
                response,
                metadata: {
                  provider: 'Hugging Face',
                  model_name: model_id,
                  prompt_length: prompt.length,
                  response_length: response.length,
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
  console.log('   • intelligent_model_selection - MCP intelligent model selection');
  console.log('   • compare_all_models - Compare across all providers');
  console.log('   • hugging_face_text_generation - Hugging Face text generation');
  console.log('💡 This server follows the MCP protocol specification');
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found - text tools will fail');
  }
  if (!process.env.STABILITY_API_KEY) {
    console.warn('⚠️  STABILITY_API_KEY not found - image generation will fail');
  }
  if (!process.env.HUGGING_FACE_API_KEY) {
    console.warn('⚠️  HUGGING_FACE_API_KEY not found - Hugging Face tools will fail');
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
