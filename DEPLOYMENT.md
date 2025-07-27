# Quick Deployment Guide

## 📋 Pre-Deployment Checklist

✅ All files copied to this folder  
✅ package.json configured for production  
✅ render.yaml created for Render configuration  
✅ Environment variables template ready  
✅ README.md with deployment instructions  

## 🚀 Deploy to Render in 5 Steps

### 1. Create GitHub Repository
```bash
# Create a new repository on GitHub
# Upload all files from this render_deploy folder
git init
git add .
git commit -m "Initial commit - Interview Transcription App"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo-name.git
git push -u origin main
```

### 2. Connect to Render
- Go to https://dashboard.render.com/
- Click "New +" → "Web Service"
- Connect your GitHub repository

### 3. Configure Service
- **Name**: interview-transcription-app
- **Environment**: Node
- **Build Command**: npm install
- **Start Command**: npm start
- **Plan**: Free (or upgrade as needed)

### 4. Add Environment Variables
In Render dashboard → Environment:
```
ELEVENLABS_API_KEY=your_actual_api_key
OPENAI_API_KEY=your_actual_openai_key  # Optional
```

### 5. Deploy
- Click "Create Web Service"
- Wait for deployment to complete
- Access your app at: https://your-service-name.onrender.com

## 🔑 Getting API Keys

### ElevenLabs (Required)
1. Sign up: https://elevenlabs.io/
2. Go to Profile → API Keys
3. Copy your key
4. Add to Render environment variables

### OpenAI (Optional)
1. Sign up: https://platform.openai.com/
2. Go to API Keys
3. Create new key
4. Add to Render environment variables

## ✅ Verify Deployment

After deployment, check:
- [ ] App loads at your Render URL
- [ ] Health check works: /api/health
- [ ] Demo mode works without API keys
- [ ] Real transcription works with API keys
- [ ] All pages load (main, history, test)

## 🔧 Troubleshooting

**Build Fails?**
- Check Node.js version in package.json
- Verify all dependencies are listed

**App Crashes?**
- Check Render logs
- Verify environment variables are set
- Ensure API keys are valid

**Microphone Issues?**
- HTTPS is required (automatic on Render)
- Check browser permissions

## 💡 Tips

- Use Free tier for testing
- Upgrade to Starter ($7/month) for production
- Monitor API usage and costs
- Keep API keys secure 