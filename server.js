const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const OpenAI = require('openai');
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

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

// MongoDB setup
const MONGO_DB_USERNAME = process.env.MONGO_DB_USERNAME || 'kwen1510';
const MONGO_DB_PASSWORD = process.env.MONGO_DB_PASSWORD;
const MONGO_URI = process.env.MONGO_URI || `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@cluster0.bwtbeur.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'pw_grq';

let mongoClient = null;
let db = null;
let promptsCollection = null;
let questionsCollection = null;

(async () => {
  try {
    if (!MONGO_DB_PASSWORD) {
      console.log('ℹ️  MONGO_DB_PASSWORD not set - MongoDB features disabled');
      return;
    }
    mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
    db = mongoClient.db(MONGO_DB_NAME);
    promptsCollection = db.collection('prompts');
    questionsCollection = db.collection('questions');
    console.log(`✅ Connected to MongoDB (db: ${MONGO_DB_NAME})`);
  } catch (err) {
    console.log('⚠️  MongoDB connection failed:', err.message);
  }
})();

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

// GPT Analysis endpoint (accepts either `transcript` or legacy `conversation`)
app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, conversation, transcript, question, studentNames, timestamp, questionIndex, sessionId } = req.body;

    const conversationText = (typeof transcript === 'string' && transcript.trim().length)
      ? transcript
      : (typeof conversation === 'string' ? conversation : '');

    if (!prompt || !conversationText) {
      return res.status(400).json({ error: 'Prompt and transcript are required' });
    }

    console.log(`🧠 Received analysis request for conversation with ${studentNames?.length || 0} students`);

    // If we have an OpenAI API key, use real analysis
    if (HAS_OPENAI_KEY && openai) {
      try {
        console.log(`🌐 Calling OpenAI GPT-4 for analysis...`);
        
        // Prepare the full context for GPT
        const fullPrompt = `${prompt}

**Important Context:**
- This transcript comes from speech-to-text, so speaker names may be imperfectly transcribed
- Student names: ${studentNames?.join(', ') || 'Not provided'}
- Question discussed: ${question}
- If a speaker name in quotes doesn't match the provided names, correct ONLY the name part while keeping the rest of the quote unchanged
  Example: If the transcript shows "[incorrect name]: great point" and the student is actually "John", write "John: great point"

**Conversation Transcript:**
${conversationText}

Please provide a comprehensive analysis based on the prompt above.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini", // Using GPT-4 for high-quality analysis
          messages: [
            {
              role: "system",
              content: "You are good at following instructions and output the correct format. Follow the instructions and output the correct format."
            },
            {
              role: "user", 
              content: fullPrompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        });

        const analysis = completion.choices[0].message.content;
        console.log('✅ GPT-4 analysis completed successfully');
        
        // Note: Do not persist analysis; client stores results in localStorage

        res.json({
          success: true,
          analysis: analysis,
          model: "gpt-4.1-mini",
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
    gptAnalysisEnabled: HAS_OPENAI_KEY,
    mongoConnected: !!db
  });
});

// Prompt endpoints (support multiple prompts)
// List prompts
app.get('/api/prompts', async (req, res) => {
  try {
    if (!promptsCollection) return res.json({ prompts: [] });
    const raw = await promptsCollection
      .find({}, { projection: { text: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
    const prompts = raw.map(p => ({
      _id: (p._id && p._id.toString) ? p._id.toString() : p._id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt
    }));
    res.json({ prompts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list prompts', details: err.message });
  }
});

// Get single prompt
app.get('/api/prompts/:id', async (req, res) => {
  try {
    if (!promptsCollection) return res.status(503).json({ error: 'MongoDB not connected' });
    const id = req.params.id;
    const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const doc = await promptsCollection.findOne({ _id });
    if (!doc) return res.status(404).json({ error: 'Prompt not found' });
    const normalized = {
      _id: (doc._id && doc._id.toString) ? doc._id.toString() : doc._id,
      name: doc.name,
      text: doc.text,
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt
    };
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load prompt', details: err.message });
  }
});

// Create new prompt
app.post('/api/prompts', async (req, res) => {
  try {
    const { name, text } = req.body || {};
    if (!name || !text) return res.status(400).json({ error: 'name and text required' });
    if (!promptsCollection) return res.status(503).json({ error: 'MongoDB not connected' });
    const now = new Date().toISOString();
    const doc = { name, text, updatedAt: now, createdAt: now };
    const result = await promptsCollection.insertOne(doc);
    res.json({ success: true, id: result.insertedId.toString(), ...doc });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create prompt', details: err.message });
  }
});

// Update prompt
app.put('/api/prompts/:id', async (req, res) => {
  try {
    const { name, text } = req.body || {};
    if (!name && !text) return res.status(400).json({ error: 'name or text required' });
    if (!promptsCollection) return res.status(503).json({ error: 'MongoDB not connected' });
    const id = req.params.id;
    const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const now = new Date().toISOString();
    const update = { $set: { updatedAt: now } };
    if (name) update.$set.name = name;
    if (text) update.$set.text = text;
    const result = await promptsCollection.updateOne({ _id }, update);
    if (!result.matchedCount) return res.status(404).json({ error: 'Prompt not found' });
    res.json({ success: true, updatedAt: now });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prompt', details: err.message });
  }
});

// Delete prompt
app.delete('/api/prompts/:id', async (req, res) => {
  try {
    if (!promptsCollection) return res.status(503).json({ error: 'MongoDB not connected' });
    const id = req.params.id;
    const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const result = await promptsCollection.deleteOne({ _id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Prompt not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete prompt', details: err.message });
  }
});

// Save per-question transcript endpoint
// Deprecated: local-only persistence; keep endpoint for compatibility but no-op
app.post('/api/save-question', async (req, res) => {
  res.json({ success: true, message: 'LocalStorage only. No server persistence.' });
});

// Analysis endpoint - integrates with AI service for transcript analysis
// (Remove duplicate legacy analyze endpoint)

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  if (!HAS_API_KEY) {
    console.log('📝 Add your ElevenLabs API key to .env to enable real transcription');
  }
  console.log(`📁 Serving files from public directory`);
}); 