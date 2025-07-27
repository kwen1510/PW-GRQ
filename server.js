const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Add cache-busting headers for development
app.use((req, res, next) => {
    if (req.url.endsWith('.html') || req.url.endsWith('.js') || req.url.endsWith('.css') || req.url === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static('public'));

// Configure multer for handling audio files
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const HAS_API_KEY = ELEVENLABS_API_KEY && ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here';

// Initialize ElevenLabs client
let elevenlabs = null;
if (HAS_API_KEY) {
  elevenlabs = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY
  });
  console.log('✅ ElevenLabs API key found - Real transcription enabled');
} else {
  console.log('⚠️  No ElevenLabs API key found - Add your API key to .env for transcription');
  console.log('💡 You can still test recording, but transcription will not work');
}

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HAS_OPENAI_KEY = OPENAI_API_KEY && OPENAI_API_KEY !== 'your_openai_api_key_here';

// Initialize OpenAI client
let openai = null;
if (HAS_OPENAI_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY
  });
  console.log('✅ OpenAI API key found - GPT analysis enabled');
} else {
  console.log('⚠️  No OpenAI API key found - Add your API key to .env for GPT analysis');
  console.log('💡 You can still test recording, but GPT analysis will not work');
}

// Demo transcription responses (fallback only)
const demoResponses = [
  "Please add your ElevenLabs API key to enable transcription.",
  "Recording is working, but transcription requires an API key.",
  "Add ELEVENLABS_API_KEY to your .env file.",
  "Visit elevenlabs.io to get your API key.",
  "Once you add the API key, restart the server."
];
let demoIndex = 0;

// Transcription endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`🎤 Received audio: ${req.file.buffer.length} bytes, type: ${req.file.mimetype}`);

    // If we have an API key, use real transcription
    if (HAS_API_KEY && elevenlabs) {
      try {
        console.log(`🌐 Calling ElevenLabs API for transcription...`);
        
        // Create audio blob exactly like the official example
        const audioBlob = new Blob([req.file.buffer], { 
          type: req.file.mimetype || 'audio/webm' 
        });
        
        // Use the official ElevenLabs client method
        const transcription = await elevenlabs.speechToText.convert({
          file: audioBlob,
          modelId: "scribe_v1", // Model to use
          tagAudioEvents: false, // We don't need audio event tagging for now
          languageCode: "eng", // English language for better accuracy
          diarize: false // We don't need speaker diarization for this simple test
        });
        
        console.log("✅ ElevenLabs transcription successful:", transcription.text);
        
        res.json({ 
          success: true, 
          text: transcription.text || "No speech detected",
          demo: false
        });

      } catch (apiError) {
        console.error('❌ Transcription error:', apiError);
        res.status(500).json({ 
          error: 'Transcription failed',
          details: apiError.message
        });
      }
    } else {
      // No API key - return demo message
      const demoText = demoResponses[demoIndex % demoResponses.length];
      demoIndex++;
      
      res.json({ 
        success: true, 
        text: demoText,
        demo: true,
        needsApiKey: true
      });
    }

  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message
    });
  }
});

// GPT Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, conversation, question, studentNames, timestamp } = req.body;

    if (!prompt || !conversation) {
      return res.status(400).json({ error: 'Prompt and conversation are required' });
    }

    console.log(`🧠 Received analysis request for conversation with ${studentNames?.length || 0} students`);

    // If we have an OpenAI API key, use real analysis
    if (HAS_OPENAI_KEY && openai) {
      try {
        console.log(`🌐 Calling OpenAI GPT-4 for analysis...`);
        
        // Prepare the full context for GPT
        const fullPrompt = `${prompt}

**Interview Context:**
Question: ${question}
Student Names: ${studentNames?.join(', ') || 'Not provided'}
Timestamp: ${timestamp}

**Conversation Transcript:**
${conversation}

Please provide a comprehensive analysis based on the prompt above.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4", // Using GPT-4 for high-quality analysis
          messages: [
            {
              role: "system",
              content: "You are an expert educational assessment assistant. Analyze group discussions with focus on collaborative communication, argument quality, and learning outcomes. Always use only actual quotes from the provided transcript - never create or imagine content that wasn't actually said."
            },
            {
              role: "user", 
              content: `${prompt}\n\n**TRANSCRIPT TO ANALYZE:**\n${conversation}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        });

        const analysis = completion.choices[0].message.content;
        console.log('✅ GPT-4 analysis completed successfully');
        
        res.json({ 
          success: true, 
          analysis: analysis,
          model: "gpt-4",
          timestamp: new Date().toISOString()
        });

      } catch (apiError) {
        console.error('❌ OpenAI analysis error:', apiError);
        res.status(500).json({ 
          error: 'GPT analysis failed',
          details: apiError.message
        });
      }
    } else {
      // No API key - return demo message
      const demoAnalysis = `**Demo Analysis (Add OpenAI API Key for Real Analysis)**

This is a demonstration response. To get real GPT-4 analysis:
1. Add your OpenAI API key to the .env file as OPENAI_API_KEY
2. Restart the server
3. Run the analysis again

**Sample Analysis Structure:**

**Collaborative Thinking Patterns:**
- Students demonstrated active listening and building upon each other's ideas
- Evidence of respectful disagreement and constructive dialogue

**Idea Development:**
- Initial concepts were introduced and refined through group discussion
- Complex topics were broken down collaboratively

**Participation Patterns:**
- Balanced participation among group members
- Some students took leadership roles while others provided supportive input

**Critical Thinking Indicators:**
- Students asked clarifying questions
- Evidence of analysis and synthesis of different perspectives

Add your OpenAI API key to get detailed, personalized analysis of your specific conversation.`;
      
      res.json({ 
        success: true, 
        analysis: demoAnalysis,
        demo: true,
        needsApiKey: true
      });
    }

  } catch (error) {
    console.error('❌ Server error in analysis:', error);
    res.status(500).json({ 
      error: 'Server error during analysis',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    hasApiKey: HAS_API_KEY,
    demoMode: !HAS_API_KEY,
    hasOpenAIKey: HAS_OPENAI_KEY,
    gptAnalysisEnabled: HAS_OPENAI_KEY
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  if (!HAS_API_KEY) {
    console.log('📝 Add your ElevenLabs API key to .env to enable real transcription');
  }
  console.log(`📁 Serving files from public directory`);
}); 