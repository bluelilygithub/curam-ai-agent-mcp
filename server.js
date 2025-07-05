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
      analyze: 'POST /api/analyze',
      generate_image: 'POST /api/generate-image',
      send_email: 'POST /api/send-email',
      multimodal: 'POST /api/multimodal'
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
        email: 'michaelbarrett@bluelily.com.au',
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
  if (!process.env.MAILCHANNELS_API_KEY) {
    console.warn('⚠️  MAILCHANNELS_API_KEY not found');
  }
});

export default app;
