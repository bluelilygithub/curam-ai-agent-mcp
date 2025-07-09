// server.js - MCP Agent with Gemini + Stability.AI + Email + Enhanced Hugging Face
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

// Add CORS debugging
app.use((req, res, next) => {
  console.log(`🌐 CORS Request: ${req.method} ${req.path} from ${req.headers.origin}`);
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});
app.use(express.json());

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

// Enhanced Hugging Face API call with retry logic
async function callHuggingFaceModel(prompt, modelId, task = 'text-generation', retries = 3) {
  const maxRetries = retries;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🤗 Attempt ${i + 1}/${maxRetries} for model: ${modelId}`);

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
        console.log(`🤗 Model ${modelId} loading, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      // Check for rate limit
      if (response.data.error && response.data.error.includes('rate')) {
        console.log(`🤗 Rate limited, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      return {
        success: true,
        model: modelId,
        response: parseHuggingFaceResponse(response.data, task),
        raw_response: response.data
      };

    } catch (error) {
      lastError = error;
      
      if (error.response?.status === 503) {
        console.log(`🤗 Service unavailable for ${modelId}, retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      if (error.response?.status === 429) {
        console.log(`🤗 Rate limited for ${modelId}, retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }
      
      // For other errors, break immediately
      break;
    }
  }

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
      // For QA, prompt should be formatted as {"question": "...", "context": "..."}
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
    console.error('Compare error:', error);
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
        timeout: 10000
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
    console.error('📧 Email error:', error.response?.data || error.message);
    
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
    console.error('🤗 Hugging Face Test Error:', error);
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
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Separate successful and failed results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Completed: ${successful.length} successful, ${failed.length} failed`);

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
    console.error('🤗 Multi-model error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
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
  if (!process.env.MAILCHANNELS_API_KEY) {
    console.warn('⚠️  MAILCHANNELS_API_KEY not found');
  }
  if (!process.env.HUGGING_FACE_API_KEY) {
    console.warn('⚠️  HUGGING_FACE_API_KEY not found');
  }
});

export default app;
