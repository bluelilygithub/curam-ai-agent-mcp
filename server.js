// Add this function after your generateImage function (around line 75)

async function callHuggingFace(prompt, model = 'gpt2') {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          max_length: 100,
          temperature: 0.7,
          return_full_text: false
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Handle different response formats
    if (Array.isArray(response.data)) {
      return response.data[0]?.generated_text || response.data[0]?.label || JSON.stringify(response.data[0]);
    } else if (response.data.generated_text) {
      return response.data.generated_text;
    } else {
      return JSON.stringify(response.data);
    }
  } catch (error) {
    console.error('Hugging Face Error:', error.response?.data || error.message);
    return `Hugging Face Error: ${error.response?.data?.error || error.message}`;
  }
}

// Add these routes after your /api/send-email route (around line 240)

// Test Hugging Face Connection
app.post('/api/hugging-face-test', async (req, res) => {
  try {
    const { prompt, model = 'gpt2' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(500).json({ 
        error: 'Hugging Face API key not configured' 
      });
    }

    console.log(`🤗 Testing Hugging Face with model: ${model}, prompt: "${prompt.substring(0, 50)}..."`);

    const response = await callHuggingFace(prompt, model);
    
    res.json({
      prompt,
      model,
      response,
      provider: 'Hugging Face',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// General Hugging Face Endpoint
app.post('/api/hugging-face', async (req, res) => {
  try {
    const { prompt, model = 'gpt2' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🤗 Hugging Face request for model: ${model}, prompt: "${prompt.substring(0, 50)}..."`);

    const response = await callHuggingFace(prompt, model);
    
    res.json({
      prompt,
      model,
      response,
      provider: 'Hugging Face',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hugging Face error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
