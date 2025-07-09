// server.js - MCP Agent with Gemini + Stability.AI + Hugging Face + Email
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

// Hugging Face API Functions
async function callHuggingFaceModel(model, inputs, parameters = {}) {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: inputs,
        parameters: parameters
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Hugging Face Error:', error.response?.data || error.message);
    return `Hugging Face Error: ${error.response?.data?.error || error.message}`;
  }
}

async function generateHuggingFaceImage(prompt, model = 'black-forest-labs/FLUX.1-dev') {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    
    // Convert to base64
    const base64Image = Buffer.from(response.data).toString('base64');
    return {
      image: base64Image,
      model: model
    };
  } catch (error) {
    console.error('Hugging Face Image Error:', error.response?.data || error.message);
    return `Hugging Face Image Error: ${error.response?.data?.error || error.message}`;
  }
}

async function analyzeImageWithHuggingFace(imageBase64, model = 'microsoft/DiT-3B') {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: imageBase64
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Hugging Face Image Analysis Error:', error.response?.data || error.message);
    return `Hugging Face Image Analysis Error: ${error.response?.data?.error || error.message}`;
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Curam AI MCP Agent',
    version: '1.1.0',
    description: 'MCP agent with Gemini models, Stability.AI, Hugging Face, and Email',
    models: {
      text: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro', 'Hugging Face Models'],
      image: ['Stable Diffusion XL', 'FLUX.1', 'Various Hugging Face Models']
    },
    endpoints: {
      health: '/health',
      compare: 'POST /api/compare',
      analyze: 'POST /api/analyze',
      generate_image: 'POST /api/generate-image',
      huggingface_text: 'POST /api/huggingface/text',
      huggingface_image: 'POST /api/huggingface/image',
      huggingface_analyze: 'POST /api/huggingface/analyze',
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
      huggingface: !!process.env.HUGGING_FACE_API_KEY,
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

// Hugging Face Text Generation
app.post('/api/huggingface/text', async (req, res) => {
  try {
    const { 
      prompt, 
      model = 'microsoft/DialoGPT-medium', 
      max_length = 100,
      temperature = 0.7,
      top_p = 0.9
    } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🤗 Calling Hugging Face text model: ${model} with prompt: "${prompt.substring(0, 50)}..."`);

    const result = await callHuggingFaceModel(model, prompt, {
      max_length,
      temperature,
      top_p
    });
    
    if (typeof result === 'string') {
      return res.status(500).json({ error: result });
    }
    
    res.json({
      prompt,
      model,
      response: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face text error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hugging Face Image Generation
app.post('/api/huggingface/image', async (req, res) => {
  try {
    const { 
      prompt, 
      model = 'black-forest-labs/FLUX.1-dev'
    } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🤗🎨 Generating image with Hugging Face model: ${model} for prompt: "${prompt.substring(0, 50)}..."`);

    const imageResult = await generateHuggingFaceImage(prompt, model);
    
    if (typeof imageResult === 'string') {
      return res.status(500).json({ error: imageResult });
    }
    
    res.json({
      prompt,
      model,
      image_base64: imageResult.image,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face image generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hugging Face Image Analysis
app.post('/api/huggingface/analyze', async (req, res) => {
  try {
    const { 
      image_base64, 
      model = 'microsoft/DiT-3B'
    } = req.body;
    
    if (!image_base64) {
      return res.status(400).json({ error: 'Base64 image is required' });
    }

    console.log(`🤗🔍 Analyzing image with Hugging Face model: ${model}`);

    const analysisResult = await analyzeImageWithHuggingFace(image_base64, model);
    
    if (typeof analysisResult === 'string') {
      return res.status(500).json({ error: analysisResult });
    }
    
    res.json({
      model,
      analysis: analysisResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face image analysis error:', error);
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
    console.warn('⚠️  HUGGING_FACE_API_KEY not found');
  }
  if (!process.env.MAILCHANNELS_API_KEY) {
    console.warn('⚠️  MAILCHANNELS_API_KEY not found');
  }
});

export default app;
