// server.js - MCP Agent with Gemini + Stability.AI + Email + Enhanced Hugging Face
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

console.log('=== SERVER STARTUP ===');
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('process.env.PORT:', process.env.PORT);
console.log('Final PORT:', PORT);
console.log('======================');

// Middleware
app.use(cors({
  origin: [
    'https://curam-ai.com.au',
    'https://curam-ai-agent-mcp-production.up.railway.app',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false,
  optionsSuccessStatus: 200
}));

// Enhanced CORS debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`🌐 [${timestamp}] ${req.method} ${req.path} from ${req.headers.origin || 'unknown'}`);
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`📊 ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Reliable models for free tier
const RELIABLE_FREE_MODELS = {
  'text-generation': [
    'gpt2',
    'microsoft/DialoGPT-medium',
    'EleutherAI/gpt-neo-1.3B'
  ],
  'text-classification': [
    'distilbert-base-uncased-finetuned-sst-2-english',
    'cardiffnlp/twitter-roberta-base-sentiment-latest'
  ],
  'question-answering': [
    'distilbert-base-cased-distilled-squad',
    'deepset/roberta-base-squad2'
  ],
  'fill-mask': [
    'bert-base-uncased',
    'distilbert-base-uncased'
  ],
  'summarization': [
    'facebook/bart-large-cnn',
    'sshleifer/distilbart-cnn-12-6'
  ],
  'translation': [
    'Helsinki-NLP/opus-mt-en-fr',
    'Helsinki-NLP/opus-mt-en-de'
  ]
};

// Memory monitoring
function logMemoryUsage() {
  const used = process.memoryUsage();
  const usage = {
    rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(used.external / 1024 / 1024 * 100) / 100
  };
  
  console.log('💾 Memory Usage (MB):', usage);
  
  // Warning if memory usage is high
  if (usage.heapUsed > 400) {
    console.warn('⚠️  High memory usage detected');
  }
  
  return usage;
}

// AI API Functions with better error handling
async function callGeminiFlash(prompt) {
  try {
    console.log('🔥 Calling Gemini Flash...');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    console.log('✅ Gemini Flash response received');
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('❌ Gemini Flash Error:', error.response?.data || error.message);
    return `Gemini Flash Error: ${error.response?.data?.error?.message || error.message}`;
  }
}

async function callGeminiPro(prompt) {
  try {
    console.log('⚡ Calling Gemini Pro...');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000
      }
    );
    console.log('✅ Gemini Pro response received');
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('❌ Gemini Pro Error:', error.response?.data || error.message);
    return `Gemini Pro Error: ${error.response?.data?.error?.message || error.message}`;
  }
}

// Enhanced Hugging Face API call with retry logic
async function callHuggingFaceModel(prompt, modelId, task = 'text-generation', retries = 3) {
  const maxRetries = retries;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🤗 [${i + 1}/${maxRetries}] Calling model: ${modelId}`);

      // Format request based on task type
      const requestData = formatHuggingFaceRequest(prompt, modelId, task);
      
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${modelId}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      // Check if model is still loading
      if (response.data.error && response.data.error.includes('loading')) {
        console.log(`🤗 Model ${modelId} loading, waiting 15s...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        continue;
      }

      // Check for rate limit
      if (response.data.error && response.data.error.includes('rate')) {
        console.log(`🤗 Rate limited, waiting 10s...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      console.log(`✅ Model ${modelId} responded successfully`);
      return {
        success: true,
        model: modelId,
        response: parseHuggingFaceResponse(response.data, task),
        raw_response: response.data
      };

    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${i + 1} failed for ${modelId}:`, error.response?.data || error.message);
      
      if (error.response?.status === 503) {
        console.log(`🤗 Service unavailable for ${modelId}, waiting 8s...`);
        await new Promise(resolve => setTimeout(resolve, 8000));
        continue;
      }
      
      if (error.response?.status === 429) {
        console.log(`🤗 Rate limited for ${modelId}, waiting 12s...`);
        await new Promise(resolve => setTimeout(resolve, 12000));
        continue;
      }
      
      // For other errors, break immediately
      break;
    }
  }

  console.error(`❌ All attempts failed for ${modelId}`);
  return {
    success: false,
    model: modelId,
    error: lastError?.response?.data || lastError?.message || 'Unknown error'
  };
}

// Format request based on model type
function formatHuggingFaceRequest(prompt, modelId, task) {
  const basePayload = { inputs: prompt };
  
  switch (task) {
    case 'text-generation':
      return {
        ...basePayload,
        parameters: {
          max_length: 150,
          temperature: 0.7,
          do_sample: true,
          return_full_text: false,
          top_p: 0.9,
          num_return_sequences: 1
        }
      };
    
    case 'summarization':
      return {
        ...basePayload,
        parameters: {
          max_length: 100,
          min_length: 30,
          do_sample: false
        }
      };
    
    case 'question-answering':
      if (typeof prompt === 'string') {
        return {
          inputs: {
            question: prompt,
            context: "This is a general knowledge question that needs to be answered based on available information."
          }
        };
      }
      return basePayload;
    
    default:
      return basePayload;
  }
}

// Parse response based on task type
function parseHuggingFaceResponse(data, task) {
  if (Array.isArray(data)) {
    switch (task) {
      case 'text-generation':
        return data[0]?.generated_text || data[0]?.text || JSON.stringify(data[0]);
      
      case 'text-classification':
        return data[0]?.label || JSON.stringify(data[0]);
      
      case 'question-answering':
        return data[0]?.answer || JSON.stringify(data[0]);
      
      case 'summarization':
        return data[0]?.summary_text || JSON.stringify(data[0]);
      
      case 'fill-mask':
        return data.map(item => `${item.token_str} (${(item.score * 100).toFixed(1)}%)`).join(', ');
      
      default:
        return JSON.stringify(data[0]);
    }
  }
  
  return JSON.stringify(data);
}

async function generateImage(prompt, style = 'photographic') {
  try {
    console.log('🎨 Generating image...');
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
        timeout: 60000
      }
    );
    
    console.log('✅ Image generated successfully');
    return {
      image: response.data.artifacts[0].base64,
      seed: response.data.artifacts[0].seed
    };
  } catch (error) {
    console.error('❌ Stability Error:', error.response?.data || error.message);
    return `Stability Error: ${error.response?.data?.message || error.message}`;
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Curam AI MCP Agent',
    version: '1.0.0',
    description: 'MCP agent with Gemini models, Stability.AI, Email, and Enhanced Hugging Face',
    models: {
      text: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro'],
      image: ['Stable Diffusion XL'],
      huggingface: Object.keys(RELIABLE_FREE_MODELS)
    },
    endpoints: {
      health: '/health',
      compare: 'POST /api/compare',
      analyze: 'POST /api/analyze',
      generate_image: 'POST /api/generate-image',
      send_email: 'POST /api/send-email',
      multimodal: 'POST /api/multimodal',
      hugging_face_test: 'POST /api/hugging-face-test',
      hugging_face_multi: 'POST /api/hugging-face-multi',
      hugging_face_models: 'GET /api/hugging-face-models'
    },
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Enhanced health check
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024)
    },
    models: {
      gemini: !!process.env.GEMINI_API_KEY,
      stability: !!process.env.STABILITY_API_KEY,
      mailchannels: !!process.env.MAILCHANNELS_API_KEY,
      huggingface: !!process.env.HUGGING_FACE_API_KEY
    }
  });
});

// Get available Hugging Face models
app.get('/api/hugging-face-models', (req, res) => {
  res.json({
    available_tasks: Object.keys(RELIABLE_FREE_MODELS),
    models: RELIABLE_FREE_MODELS,
    usage: {
      single_model: 'POST /api/hugging-face-test',
      multiple_models: 'POST /api/hugging-face-multi'
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
    console.error('❌ Compare error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

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
    console.error('❌ Image generation error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Send Email with MailChannels
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, message, pdf_base64 } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    console.log(`📧 Sending email to: ${to} with subject: "${subject.substring(0, 30)}..."`);

    if (!process.env.MAILCHANNELS_API_KEY) {
      console.error('📧 MAILCHANNELS_API_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'Email service not configured - API key missing' 
      });
    }

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

    if (pdf_base64) {
      emailData.attachments = [{
        content: pdf_base64,
        filename: 'MCP_Session_Report.pdf',
        type: 'application/pdf'
      }];
    }

    const response = await axios.post(
      'https://api.mailchannels.net/tx/v1/send',
      emailData,
      {
        headers: {
          'X-API-Key': process.env.MAILCHANNELS_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`✅ Email sent successfully to ${to}`);
    
    res.json({ 
      status: 'sent', 
      message: 'Email sent successfully!',
      message_id: response.data.message_id || 'sent',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Email error:', error.response?.data || error.message);
    
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

// Enhanced Hugging Face single model test
app.post('/api/hugging-face-test', async (req, res) => {
  try {
    const { prompt, model, task = 'text-generation' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key not configured' });
    }

    // Use provided model or default to reliable one
    let modelId = model;
    if (!modelId && RELIABLE_FREE_MODELS[task]) {
      modelId = RELIABLE_FREE_MODELS[task][0];
    } else if (!modelId) {
      modelId = 'gpt2';
    }

    console.log(`🤗 Testing single model: ${modelId} with task: ${task}`);

    const result = await callHuggingFaceModel(prompt, modelId, task);
    
    if (result.success) {
      res.json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Hugging Face API call failed',
        details: result.error,
        model: result.model
      });
    }

  } catch (error) {
    console.error('❌ Hugging Face Test Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// NEW: Multiple Hugging Face models endpoint
app.post('/api/hugging-face-multi', async (req, res) => {
  try {
    const { prompt, models, task = 'text-generation', max_concurrent = 3 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key not configured' });
    }

    // Use provided models or default to reliable ones for the task
    let modelList = models;
    if (!modelList && RELIABLE_FREE_MODELS[task]) {
      modelList = RELIABLE_FREE_MODELS[task];
    } else if (!modelList) {
      modelList = ['gpt2', 'microsoft/DialoGPT-medium'];
    }

    console.log(`🤗 Testing multiple models: ${modelList.join(', ')} with task: ${task}`);

    // Process models in batches to avoid overwhelming the API
    const results = [];
    const batchSize = Math.min(max_concurrent, 3);
    
    for (let i = 0; i < modelList.length; i += batchSize) {
      const batch = modelList.slice(i, i + batchSize);
      console.log(`🤗 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.join(', ')}`);
      
      const batchPromises = batch.map(modelId => 
        callHuggingFaceModel(prompt, modelId, task)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < modelList.length) {
        console.log('⏳ Waiting 3s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Separate successful and failed results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Multi-model completed: ${successful.length} successful, ${failed.length} failed`);

    res.json({
      prompt,
      task,
      total_models: modelList.length,
      successful_count: successful.length,
      failed_count: failed.length,
      results: {
        successful: successful.map(r => ({
          model: r.model,
          response: r.response,
          raw_response: r.raw_response
        })),
        failed: failed.map(r => ({
          model: r.model,
          error: r.error
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Multi-model error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /api/hugging-face-models',
      'POST /api/compare',
      'POST /api/generate-image',
      'POST /api/send-email',
      'POST /api/hugging-face-test',
      'POST /api/hugging-face-multi'
    ]
  });
});

// Process error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit immediately, let Railway handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately
});

// Start server with better error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Curam AI MCP Agent running on port ${PORT}`);
  console.log(`📊 Health check available at /health`);
  console.log(`🌐 API endpoints ready at https://curam-ai-agent-mcp-production.up.railway.app`);
  
  // Environment variable checks
  const envChecks = {
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    STABILITY_API_KEY: !!process.env.STABILITY_API_KEY,
    MAILCHANNELS_API_KEY: !!process.env.MAILCHANNELS_API_KEY,
    HUGGING_FACE_API_KEY: !!process.env.HUGGING_FACE_API_KEY
  };
  
  console.log('🔑 Environment Variables Status:', envChecks);
  
  Object.entries(envChecks).forEach(([key, value]) => {
    if (!value) {
      console.warn(`⚠️  ${key} not found`);
    } else {
      console.log(`✅ ${key} configured`);
    }
  });
  
  // Log initial memory usage
  logMemoryUsage();
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Keep the server alive
server.keepAliveTimeout = 120000; // 2 minutes
server.headersTimeout = 120000; // 2 minutes

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Log memory usage every 5 minutes
setInterval(logMemoryUsage, 5 * 60 * 1000);

export default app;
