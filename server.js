// server.js - MCP Agent with Gemini + Stability.AI + Email + Claude API
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

// NEW: Claude API Functions
async function callClaudeSonnet(prompt) {
  try {
    console.log('🤖 Calling Claude Sonnet...');
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      }
    );
    
    console.log('✅ Claude Sonnet response received');
    return response.data.content[0].text;
  } catch (error) {
    console.error('❌ Claude Sonnet Error:', error.response?.data || error.message);
    return `Claude Sonnet Error: ${error.response?.data?.error?.message || error.message}`;
  }
}

async function callClaudeHaiku(prompt) {
  try {
    console.log('⚡ Calling Claude Haiku...');
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      }
    );
    
    console.log('✅ Claude Haiku response received');
    return response.data.content[0].text;
  } catch (error) {
    console.error('❌ Claude Haiku Error:', error.response?.data || error.message);
    return `Claude Haiku Error: ${error.response?.data?.error?.message || error.message}`;
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
    description: 'MCP agent with Gemini models, Claude API, Stability.AI, and Email',
    models: {
      text: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro', 'Claude Sonnet', 'Claude Haiku'],
      image: ['Stable Diffusion XL']
    },
    endpoints: {
      health: '/health',
      compare: 'POST /api/compare',
      claude_test: 'POST /api/claude-test',
      multi_compare: 'POST /api/multi-compare',
      generate_image: 'POST /api/generate-image',
      send_email: 'POST /api/send-email',
      hugging_face_test: 'POST /api/hugging-face-test'
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
      claude: !!process.env.CLAUDE_API_KEY,
      stability: !!process.env.STABILITY_API_KEY,
      mailchannels: !!process.env.MAILCHANNELS_API_KEY,
      huggingface: !!process.env.HUGGING_FACE_API_KEY
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

// NEW: Claude API Test Endpoint
app.post('/api/claude-test', async (req, res) => {
  try {
    const { prompt, model = 'sonnet' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    console.log(`🤖 Testing Claude ${model} with prompt: "${prompt.substring(0, 50)}..."`);

    let response;
    if (model.toLowerCase() === 'haiku') {
      response = await callClaudeHaiku(prompt);
    } else {
      response = await callClaudeSonnet(prompt);
    }

    res.json({
      success: true,
      model: model.toLowerCase() === 'haiku' ? 'Claude Haiku' : 'Claude Sonnet',
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🤖 Claude Test Error:', error);
    res.status(500).json({
      error: 'Claude API call failed',
      details: error.message
    });
  }
});

// NEW: Multi-Model Compare (Gemini + Claude)
app.post('/api/multi-compare', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🔄 Processing multi-model compare for prompt: "${prompt.substring(0, 50)}..."`);

    // Call all available models
    const promises = [
      callGeminiFlash(prompt),
      callGeminiPro(prompt)
    ];

    // Add Claude models if API key is available
    if (process.env.CLAUDE_API_KEY) {
      promises.push(callClaudeSonnet(prompt));
      promises.push(callClaudeHaiku(prompt));
    }

    const responses = await Promise.all(promises);
    
    const responseObj = {
      gemini_flash: {
        model: 'Gemini 1.5 Flash',
        response: responses[0],
        characteristics: 'Fast, cost-effective'
      },
      gemini_pro: {
        model: 'Gemini 1.5 Pro',
        response: responses[1],
        characteristics: 'Higher quality, better reasoning'
      }
    };

    // Add Claude responses if available
    if (process.env.CLAUDE_API_KEY) {
      responseObj.claude_sonnet = {
        model: 'Claude Sonnet',
        response: responses[2],
        characteristics: 'Balanced performance and capability'
      };
      responseObj.claude_haiku = {
        model: 'Claude Haiku',
        response: responses[3],
        characteristics: 'Fast, lightweight responses'
      };
    }
    
    res.json({
      prompt,
      responses: responseObj,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Multi-compare error:', error);
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

    console.log('📧 API Key present:', !!process.env.MAILCHANNELS_API_KEY);

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

// Hugging Face API endpoint
app.post('/api/hugging-face-test', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    const modelId = model || 'gpt2';

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key not configured' });
    }

    console.log(`🤗 Testing Hugging Face with prompt: "${prompt.substring(0, 50)}..." using model: ${modelId}`);

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${modelId}`,
      { inputs: prompt },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Hugging Face API call successful');

    res.json({
      success: true,
      model: modelId,
      response: response.data[0]?.generated_text || response.data[0]?.answer || response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🤗 Hugging Face Error:', error.response?.data || error.message);

    let errorMessage = 'Hugging Face API call failed';
    if (error.response?.status === 401) {
      errorMessage = 'Authentication failed - check Hugging Face API key';
    } else if (error.response?.status === 503) {
      errorMessage = 'Model is loading - try again in a few seconds';
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
  console.log(`📊 Health check available at /health`);
  console.log(`🌐 API endpoints ready at https://curam-ai-agent-mcp-production.up.railway.app`);
  
  // Environment variable checks
  const apiKeys = {
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    CLAUDE_API_KEY: !!process.env.CLAUDE_API_KEY,
    STABILITY_API_KEY: !!process.env.STABILITY_API_KEY,
    MAILCHANNELS_API_KEY: !!process.env.MAILCHANNELS_API_KEY,
    HUGGING_FACE_API_KEY: !!process.env.HUGGING_FACE_API_KEY
  };

  console.log('🔑 API Keys Status:');
  Object.entries(apiKeys).forEach(([key, present]) => {
    if (present) {
      console.log(`✅ ${key} configured`);
    } else {
      console.warn(`⚠️  ${key} not found`);
    }
  });
});

export default app;
