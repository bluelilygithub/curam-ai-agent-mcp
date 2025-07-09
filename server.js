// server.js - MCP Agent with Gemini + Stability.AI + Email
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

console.log('=== PORT DEBUG ===');
console.log('process.env.PORT:', process.env.PORT);
console.log('Final PORT:', PORT);
console.log('==================');

// Middleware
app.use(cors({
  origin: [
    'https://curam-ai.com.au',
    'https://curam-ai-agent-mcp-production.up.railway.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

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
    console.error('Gemini Flash Error:', error.response?.data || error.message);
    return `Gemini Flash Error: ${error.response?.data?.error?.message || error.message}`;
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
    console.error('Gemini Pro Error:', error.response?.data || error.message);
    return `Gemini Pro Error: ${error.response?.data?.error?.message || error.message}`;
  }
}

// NEW: Hugging Face API Function
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
    console.error(`Hugging Face ${modelId} Error:`, error.response?.data || error.message);
    return `Hugging Face ${modelId} Error: ${error.response?.data?.error || error.message}`;
  }
}

async function generateImage(prompt, style = 'photographic') {
  try {
    console.log(`🎨 Generating image for: "${prompt.substring(0, 50)}..."`);
    
    if (!process.env.STABILITY_API_KEY) {
      throw new Error('STABILITY_API_KEY not configured');
    }

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
        },
        timeout: 120000 // 2 minutes timeout
      }
    );
    
    if (!response.data.artifacts || !response.data.artifacts[0]) {
      throw new Error('No image artifacts returned from Stability AI');
    }
    
    console.log(`✅ Image generated successfully with seed: ${response.data.artifacts[0].seed}`);
    
    return {
      image: response.data.artifacts[0].base64,
      seed: response.data.artifacts[0].seed
    };
  } catch (error) {
    console.error('🎨 Stability AI Error Details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      code: error.code
    });
    
    if (error.code === 'ECONNABORTED') {
      return `Stability Error: Request timeout after 2 minutes. Image generation may be taking longer than expected.`;
    } else if (error.response?.status === 401) {
      return `Stability Error: Authentication failed. Please check your STABILITY_API_KEY.`;
    } else if (error.response?.status === 404) {
      return `Stability Error: Model endpoint not found. The API endpoint may have changed.`;
    } else if (error.response?.status === 429) {
      return `Stability Error: Rate limit exceeded. Please wait a moment before trying again.`;
    } else if (error.response?.status === 500) {
      return `Stability Error: Server error. The image generation service is temporarily unavailable.`;
    } else {
      return `Stability Error: ${error.response?.data?.message || error.message}`;
    }
  }
}

// Intelligent Selection Helper Functions
async function analyzeTask(taskInput) {
  try {
    const analysisPrompt = `Analyze this task and return a JSON response with these fields:
    - complexity: "low", "medium", or "high"
    - task_type: "creative_writing", "classification", "complex_analysis", "simple_qa", or "other"
    - priority: "speed" or "quality"
    - estimated_tokens: number
    - reasoning: brief explanation
    
    Task: "${taskInput}"
    
    Return only valid JSON:`;

    const response = await callGeminiFlash(analysisPrompt);
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // Fallback analysis
        return {
          complexity: taskInput.length > 200 ? 'high' : 'low',
          task_type: 'other',
          priority: 'speed',
          estimated_tokens: Math.ceil(taskInput.length / 4),
          reasoning: 'Fallback analysis based on input length'
        };
      }
    } catch (parseError) {
      console.error('Task analysis JSON parse error:', parseError);
      return {
        complexity: 'medium',
        task_type: 'other',
        priority: 'speed',
        estimated_tokens: 100,
        reasoning: 'Default analysis due to parsing error'
      };
    }
  } catch (error) {
    console.error('Task analysis error:', error);
    return {
      complexity: 'medium',
      task_type: 'other',
      priority: 'speed',
      estimated_tokens: 100,
      reasoning: 'Error in analysis, using defaults'
    };
  }
}

async function selectOptimalModel(taskAnalysis) {
  const models = [
    {
      id: 'gemini_flash',
      name: 'Gemini 1.5 Flash',
      provider: 'Google',
      characteristics: ['speed', 'cost_effective', 'creative_writing'],
      bestFor: ['quick_responses', 'creative_tasks'],
      cost: 'low',
      speed: 'fast'
    },
    {
      id: 'gemini_pro',
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      characteristics: ['reasoning', 'analysis', 'complex_tasks'],
      bestFor: ['complex_analysis', 'detailed_responses'],
      cost: 'medium',
      speed: 'medium'
    },
    {
      id: 'hugging_face_gpt2',
      name: 'GPT-2 (Hugging Face)',
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

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Curam AI MCP Agent',
    version: '1.0.0',
    description: 'MCP agent with Gemini models, Stability.AI, and Email',
    models: {
      text: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro'],
      image: ['Stable Diffusion XL']
    },
    endpoints: {
      health: '/health',
      compare: 'POST /api/compare',
      hugging_face: 'POST /api/hugging-face',
      intelligent_selection: 'POST /api/intelligent-selection',
      generate_image: 'POST /api/generate-image',
      send_email: 'POST /api/send-email'
    },
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    models: {
      gemini: !!process.env.GEMINI_API_KEY,
      stability: !!process.env.STABILITY_API_KEY,
      hugging_face: !!process.env.HUGGING_FACE_API_KEY,
      mailchannels: !!process.env.MAILCHANNELS_API_KEY
    }
  });
});

// Compare Gemini Models
app.post('/api/compare', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`📝 Processing compare request for prompt: "${prompt.substring(0, 50)}..."`);

    const [flashResponse, proResponse] = await Promise.all([
      callGeminiFlash(prompt),
      callGeminiPro(prompt)
    ]);
    
    res.json({
      prompt,
      responses: {
        gemini_flash: {
          model: 'Gemini 1.5 Flash',
          response: flashResponse,
          characteristics: 'Fast, cost-effective'
        },
        gemini_pro: {
          model: 'Gemini 1.5 Pro',
          response: proResponse,
          characteristics: 'Higher quality, better reasoning'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Simple Hugging Face Endpoint
app.post('/api/hugging-face', async (req, res) => {
  try {
    const { prompt, model_id = 'gpt2' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key not configured' });
    }

    console.log(`🤗 Processing Hugging Face request for model: ${model_id}`);

    const response = await callHuggingFaceModel(prompt, model_id);
    
    res.json({
      prompt,
      model_id,
      response,
      provider: 'Hugging Face',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Intelligent Model Selection Endpoint
app.post('/api/intelligent-selection', async (req, res) => {
  try {
    const { task, show_reasoning = true } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    console.log(`🧠 Processing intelligent selection for task: "${task.substring(0, 50)}..."`);

    // Step 1: Analyze the task
    const taskAnalysis = await analyzeTask(task);
    
    // Step 2: Select optimal model
    const selectedModel = await selectOptimalModel(taskAnalysis);
    
    // Step 3: Execute with selected model
    let response;
    try {
      switch (selectedModel.id) {
        case 'gemini_flash':
          response = await callGeminiFlash(task);
          break;
        case 'gemini_pro':
          response = await callGeminiPro(task);
          break;
        case 'hugging_face_gpt2':
          response = await callHuggingFaceModel(task, 'gpt2');
          break;
        default:
          response = await callGeminiFlash(task);
      }
    } catch (error) {
      console.error('Model execution error:', error);
      response = `Error executing with ${selectedModel.name}: ${error.message}`;
    }
    
    res.json({
      task,
      task_analysis: show_reasoning ? taskAnalysis : null,
      selected_model: {
        id: selectedModel.id,
        name: selectedModel.name,
        provider: selectedModel.provider,
        reasoning: show_reasoning ? `Selected based on ${taskAnalysis.complexity} complexity, ${taskAnalysis.task_type} task type, and ${taskAnalysis.priority} priority` : null
      },
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Intelligent selection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate Image
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, style = 'photographic' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Processing image generation request for: "${prompt.substring(0, 50)}..."`);

    const result = await generateImage(prompt, style);
    
    if (typeof result === 'string' && result.startsWith('Stability Error:')) {
      return res.status(500).json({ error: result });
    }
    
    res.json({
      prompt,
      style,
      image: result.image,
      seed: result.seed,
      metadata: {
        model: 'Stable Diffusion XL 1024',
        dimensions: '1024x1024',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send Email
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ error: 'To, subject, and message are required' });
    }

    if (!process.env.MAILCHANNELS_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    console.log(`📧 Processing email request to: ${to}`);

    const response = await axios.post(
      'https://api.mailchannels.net/tx/v1/send',
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'noreply@curam-ai.com.au', name: 'Curam AI' },
        subject: subject,
        content: [{ type: 'text/plain', value: message }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MAILCHANNELS_API_KEY}`
        }
      }
    );

    res.json({ 
      status: 'sent', 
      message: 'Email sent successfully!',
      message_id: response.data.message_id || 'sent',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('📧 Detailed email error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      config: error.config?.url
    });
    
    // More specific error messages
    let errorMessage = 'Email sending failed';
    if (error.response?.status === 401) {
      errorMessage = 'Authentication failed - check API key or domain verification';
    } else if (error.response?.status === 403) {
      errorMessage = 'Forbidden - check domain permissions or API key scope';
    } else if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded - too many requests';
    } else if (error.response?.status === 500) {
      errorMessage = 'Mail service error - try again later';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Network error - check internet connection';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - try again';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Curam AI MCP Agent running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   • GET  / - Server info`);
  console.log(`   • GET  /health - Health check`);
  console.log(`   • POST /api/compare - Compare Gemini models`);
  console.log(`   • POST /api/hugging-face - Hugging Face models`);
  console.log(`   • POST /api/intelligent-selection - Intelligent model selection`);
  console.log(`   • POST /api/generate-image - Generate images`);
  console.log(`   • POST /api/send-email - Send emails`);
  console.log(`💡 Environment check:`);
  console.log(`   • Gemini API: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`   • Stability AI: ${process.env.STABILITY_API_KEY ? '✅' : '❌'}`);
  console.log(`   • Hugging Face: ${process.env.HUGGING_FACE_API_KEY ? '✅' : '❌'}`);
  console.log(`   • MailChannels: ${process.env.MAILCHANNELS_API_KEY ? '✅' : '❌'}`);
}); 
