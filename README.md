# Interview Transcription App - Render Deployment

A professional interview transcription application with real-time speech-to-text, GPT-4.1 analysis, and local storage history. Ready for deployment on Render.

## 🌟 Features

- **Real-time Transcription**: Powered by ElevenLabs Speech-to-Text API
- **Multi-Speaker Support**: Track up to 5 students with instant speaker switching
- **GPT-4.1 Analysis**: Post-processing conversation analysis for educational insights
- **Local Storage History**: Save interviews to device for future reference
- **History Management**: View, search, and manage saved interviews
- **Demo Mode**: Test recording functionality without API keys
- **Modern UI**: Beautiful, responsive design optimized for all devices

## 🚀 Deploy to Render

### Step 1: Prepare Your Repository

1. Create a new GitHub repository
2. Upload all files from this `render_deploy` folder to your repository
3. Commit and push the files

### Step 2: Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `interview-transcription-app` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (or upgrade as needed)

### Step 3: Configure Environment Variables

In your Render service dashboard, go to "Environment" and add:

#### Required:
```
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

#### Optional (for GPT analysis):
```
OPENAI_API_KEY=your_openai_api_key_here
```

**Note**: Render automatically sets the `PORT` environment variable.

### Step 4: Get Your API Keys

#### ElevenLabs API Key (Required for transcription):
1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Go to your profile settings
3. Copy your API key
4. Add it to Render environment variables

#### OpenAI API Key (Optional for GPT analysis):
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Generate an API key in your account settings
3. Add it to Render environment variables

### Step 5: Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your app
3. Your app will be available at: `https://your-service-name.onrender.com`

## 🎯 How to Use

### Basic Interview Setup
1. **Enter Question**: Type your interview question
2. **Add Students**: Enter names for up to 5 students
3. **Start Interview**: Click "Start Interview Setup"

### Recording Process  
1. **Start Recording**: Click the record button
2. **Select Speaker**: Click on student boxes to indicate who's speaking
3. **Automatic Transcription**: Speech is transcribed when you switch speakers
4. **Stop Recording**: Click stop when the interview is complete

### Post-Processing Analysis 🧠
After stopping the recording, use the **Post-Processing Analysis** section:

1. **Customize Prompt**: Edit the analysis prompt for specific focus
2. **Run Analysis**: Click "Run GPT-4.1 Analysis" for AI insights
3. **Review Results**: Get detailed analysis of collaborative thinking patterns
4. **Copy Results**: Copy the analysis for further use

### Local Storage & History 💾
- **Save Interviews**: Click "Save Interview" to store locally
- **View History**: Click "History" to see all saved interviews
- **Export Options**: Download individual interviews as CSV/JSON
- **Privacy**: All data stays on the user's device

## 🛠️ Technical Details

### API Endpoints
- `POST /api/transcribe` - ElevenLabs speech-to-text transcription
- `POST /api/analyze` - OpenAI GPT-4.1 conversation analysis  
- `GET /api/health` - Server status and API key validation

### Data Storage
- **Transcription**: Real-time via API calls
- **Local History**: Browser localStorage (client-side only)
- **Analysis Results**: Saved with interview data locally
- **No Server Storage**: All user data remains on device

### Demo Mode
The application works without API keys in demo mode:
- **Transcription**: Shows placeholder responses
- **Analysis**: Displays sample analysis structure
- **Recording**: Full microphone functionality for testing

## 🔧 Environment Variables

Copy `env.example` and configure:

```env
# Required for transcription
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional for GPT analysis  
OPENAI_API_KEY=your_openai_api_key_here

# Automatically set by Render
PORT=3000
```

## 📱 Browser Support

- Chrome 66+
- Firefox 60+
- Safari 12+
- Edge 79+

**Note**: Microphone access requires HTTPS (automatically provided by Render).

## 🚨 Important Notes for Deployment

### HTTPS Requirement
- Microphone access requires HTTPS
- Render provides HTTPS automatically
- No additional SSL configuration needed

### API Rate Limits
- **ElevenLabs**: Check your plan's transcription limits
- **OpenAI**: Monitor your usage and set appropriate limits
- Consider upgrading your Render plan for high traffic

### Performance
- **Free Tier**: May have cold starts (30-second delay)
- **Paid Tiers**: Faster response times and always-on service
- **Memory**: App uses minimal memory, free tier sufficient

## 💰 Cost Considerations

### Render Hosting
- **Free Tier**: $0/month (with limitations)
- **Starter**: $7/month (recommended for production)
- **Standard**: $25/month (for high traffic)

### API Costs
- **ElevenLabs**: Pay per character transcribed
- **OpenAI**: Pay per token (GPT-4 usage)
- Monitor usage to control costs

## 🔍 Troubleshooting

### Deployment Issues
- Check build logs in Render dashboard
- Verify all dependencies in package.json
- Ensure Node.js version compatibility (>=18.0.0)

### API Issues
- Verify API keys in environment variables
- Check API credit balances
- Review browser console for error messages

### Microphone Issues
- Ensure HTTPS is enabled (automatic on Render)
- Check browser permissions
- Test with different browsers

## 📞 Support

- Check Render build logs for deployment issues
- Verify API key configuration in environment variables
- Test locally first before deploying

## 📄 License

MIT License - feel free to use and modify as needed. 