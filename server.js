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
    console.error('Stability Error:', error.response?.data || error.message);
    return `Stability Error: ${error.response?.data?.message || error.message}`;
  }
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
        case 'gpt2':
        case 'bert-base-uncased':
          response = await callHuggingFaceModel(task, selectedModel.id);
          break;
        default:
          response = await callGeminiFlash(task); // Fallback
      }
    } catch (error) {
      // Fallback to Gemini Flash
      selectedModel.id = 'gemini_flash';
      selectedModel.name = 'Gemini 1.5 Flash';
      response = await callGeminiFlash(task);
    }

    const result = {
      task,
      task_analysis: taskAnalysis,
      selected_model: selectedModel,
      response,
      mcp_reasoning: show_reasoning ? {
        why_selected: `Selected ${selectedModel.name} because it matches task requirements: ${taskAnalysis.requirements.join(', ')}`,
        confidence_score: selectedModel.score / 10,
        alternatives_considered: ['gemini_flash', 'gemini_pro', 'gpt2', 'bert-base-uncased'].filter(id => id !== selectedModel.id)
      } : null,
      timestamp: new Date().toISOString()
    };

    res.json(result);
  } catch (error) {
    console.error('Intelligent selection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Task Analysis Functions
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
        case 'gpt2':
        case 'bert-base-uncased':
          response = await callHuggingFaceModel(task, selectedModel.id);
          break;
        default:
          response = await callGeminiFlash(task); // Fallback
      }
    } catch (error) {
      // Fallback to Gemini Flash
      selectedModel.id = 'gemini_flash';
      selectedModel.name = 'Gemini 1.5 Flash';
      response = await callGeminiFlash(task);
    }

    const result = {
      task,
      task_analysis: taskAnalysis,
      selected_model: selectedModel,
      response,
      mcp_reasoning: show_reasoning ? {
        why_selected: `Selected ${selectedModel.name} because it matches task requirements: ${taskAnalysis.requirements.join(', ')}`,
        confidence_score: selectedModel.score / 10,
        alternatives_considered: ['gemini_flash', 'gemini_pro', 'gpt2', 'bert-base-uncased'].filter(id => id !== selectedModel.id)
      } : null,
      timestamp: new Date().toISOString()
    };

    res.json(result);
  } catch (error) {
    console.error('Intelligent selection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Task Analysis Functions
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
        case 'gpt2':
        case 'bert-base-uncased':
          response = await callHuggingFaceModel(task, selectedModel.id);
          break;
        default:
          response = await callGeminiFlash(task); // Fallback
      }
    } catch (error) {
      // Fallback to Gemini Flash
      selectedModel.id = 'gemini_flash';
      selectedModel.name = 'Gemini 1.5 Flash';
      response = await callGeminiFlash(task);
    }

    const result = {
      task,
      task_analysis: taskAnalysis,
      selected_model: selectedModel,
      response,
      mcp_reasoning: show_reasoning ? {
        why_selected: `Selected ${selectedModel.name} because it matches task requirements: ${taskAnalysis.requirements.join(', ')}`,
        confidence_score: selectedModel.score / 10,
        alternatives_considered: ['gemini_flash', 'gemini_pro', 'gpt2', 'bert-base-uncased'].filter(id => id !== selectedModel.id)
      } : null,
      timestamp: new Date().toISOString()
    };

    res.json(result);
  } catch (error) {
    console.error('Intelligent selection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Task Analysis Functions
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

// Generate Image
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, style = 'photographic' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Generating image for prompt: "${prompt.substring(0, 50)}..." with style: ${style}`);

    const imageResult = await generateImage(prompt, style);
    
    if (typeof imageResult === 'string') {
      return res.status(500).json({ error: imageResult });
    }
    
    res.json({
      prompt,
      style,
      image_base64: imageResult.image,
      seed: imageResult.seed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send Email with MailChannels - Fixed Authentication
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, message, pdf_base64 } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    console.log(`📧 Sending email to: ${to} with subject: "${subject.substring(0, 30)}..."`);

    // Check if API key is present
    if (!process.env.MAILCHANNELS_API_KEY) {
      console.error('📧 MAILCHANNELS_API_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'Email service not configured - API key missing' 
      });
    }

    // MailChannels API call - Correct format
    const emailData = {
      personalizations: [{
        to: [{ email: to }]
      }],
      from: { 
        email: 'michael@curam-ai.com.au',
        name: 'Curam AI MCP Agent'
      },
      subject: subject,
      content: [{
        type: 'text/html',
        value: message.replace(/\n/g, '<br>')
      }]
    };

    // Add PDF attachment if provided
    if (pdf_base64) {
      emailData.attachments = [{
        content: pdf_base64,
        filename: 'MCP_Session_Report.pdf',
        type: 'application/pdf'
      }];
    }

    // Debug logging
    console.log('📧 API Key present:', !!process.env.MAILCHANNELS_API_KEY);
    console.log('📧 API Key first 10 chars:', process.env.MAILCHANNELS_API_KEY?.substring(0, 10));

    const response = await axios.post(
      'https://api.mailchannels.net/tx/v1/send',
      emailData,
      {
        headers: {
          'X-API-Key': process.env.MAILCHANNELS_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`✅ Email sent successfully to ${to}`, response.data);
    
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
      errorMessage = 'Forbidden - domain not verified or sending limit reached';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - email service unavailable';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.response?.data || error.message,
      status_code: error.response?.status
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Curam AI MCP Agent running on port ${PORT}`);
  console.log(`📊 Health check available at /health`);
  console.log(`🌐 API endpoints ready at https://curam-ai-agent-mcp-production.up.railway.app`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found');
  }
  if (!process.env.STABILITY_API_KEY) {
    console.warn('⚠️  STABILITY_API_KEY not found');
  }
  if (!process.env.HUGGING_FACE_API_KEY) {
    console.warn('⚠️  HUGGING_FACE_API_KEY not found - Hugging Face features disabled');
  }
  if (!process.env.MAILCHANNELS_API_KEY) {
    console.warn('⚠️  MAILCHANNELS_API_KEY not found');
  }
});

export default app; 
