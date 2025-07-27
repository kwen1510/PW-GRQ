class InterviewTranscriptionApp {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.currentSpeaker = null;
        this.transcriptionData = [];
        this.timerInterval = null;
        this.startTime = null;
        this.students = [];
        this.demoMode = false;
        this.currentAudioChunks = [];
        
        this.initializeElements();
        this.setupEventListeners();
        this.checkServerStatus();
        this.updateSaveButtonState(); // Initialize save button state
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/health');
            const health = await response.json();
            this.demoMode = !health.hasApiKey;
            
            if (this.demoMode) {
                this.showStatus('⚠️ Add your ElevenLabs API key to .env for real transcription', 'info');
            }
        } catch (error) {
            console.error('Server health check failed:', error);
        }
    }

    initializeElements() {
        // Setup elements
        this.questionInput = document.getElementById('question');
        this.studentInputs = [
            document.getElementById('student1'),
            document.getElementById('student2'),
            document.getElementById('student3'),
            document.getElementById('student4'),
            document.getElementById('student5')
        ];
        this.startSetupBtn = document.getElementById('startSetup');
        
        // Interview elements
        this.setupSection = document.querySelector('.setup-section');
        this.interviewSection = document.querySelector('.interview-section');
        this.displayQuestion = document.getElementById('displayQuestion');
        this.studentBoxes = document.getElementById('studentBoxes');
        this.noSpeakerBtn = document.getElementById('noSpeaker');
        this.recordBtn = document.getElementById('recordBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.timer = document.getElementById('timer');
        this.transcriptionContainer = document.getElementById('transcriptionContainer');
        
        // Export elements
        this.exportCSVBtn = document.getElementById('exportCSV');
        this.exportJSONBtn = document.getElementById('exportJSON');
        this.resetBtn = document.getElementById('resetInterview');
        this.saveInterviewBtn = document.getElementById('saveInterviewBtn');
        
        // Post-processing elements
        this.postProcessingSection = document.getElementById('postProcessingSection');
        this.postProcessingContent = document.getElementById('postProcessingContent');
        this.postProcessingChevron = document.getElementById('postProcessingChevron');
        this.analysisPrompt = document.getElementById('analysisPrompt');
        this.runAnalysisBtn = document.getElementById('runAnalysisBtn');
        this.analysisStatus = document.getElementById('analysisStatus');
        this.analysisResults = document.getElementById('analysisResults');
        this.analysisContent = document.getElementById('analysisContent');
        this.copyAnalysisBtn = document.getElementById('copyAnalysisBtn');
        this.downloadWordBtn = document.getElementById('downloadWordBtn');
        
        // Status message
        this.statusMessage = document.getElementById('statusMessage');
    }

    setupEventListeners() {
        this.startSetupBtn.addEventListener('click', () => this.startInterview());
        this.recordBtn.addEventListener('click', () => this.startMainRecording());
        this.stopBtn.addEventListener('click', () => this.stopMainRecording());
        this.noSpeakerBtn.addEventListener('click', () => this.selectSpeaker(null));
        this.exportCSVBtn.addEventListener('click', () => this.exportToCSV());
        this.exportJSONBtn.addEventListener('click', () => this.exportToJSON());
        this.resetBtn.addEventListener('click', () => this.resetInterview());
        this.saveInterviewBtn.addEventListener('click', () => this.saveInterviewToHistory());
        
        // Post-processing event listeners
        this.runAnalysisBtn.addEventListener('click', () => this.runGPTAnalysis());
        this.copyAnalysisBtn.addEventListener('click', () => this.copyAnalysisToClipboard());
        this.downloadWordBtn.addEventListener('click', () => this.downloadAnalysisAsWord());
    }

    startInterview() {
        const question = this.questionInput.value.trim();
        const studentNames = this.studentInputs.map(input => input.value.trim()).filter(name => name);

        if (!question) {
            this.showStatus('Please enter an interview question', 'error');
            return;
        }

        if (studentNames.length === 0) {
            this.showStatus('Please enter at least one student name', 'error');
            return;
        }

        this.students = studentNames;
        this.displayQuestion.textContent = question;
        
        // Generate student boxes
        this.generateStudentBoxes();
        
        // Show interview section and hide setup
        this.setupSection.style.display = 'none';
        this.interviewSection.style.display = 'block';
        
        const modeText = this.demoMode ? ' (No API Key)' : '';
        this.showStatus(`Interview setup complete! Click "Start Recording" then select speakers.${modeText}`, 'success');
    }

    generateStudentBoxes() {
        this.studentBoxes.innerHTML = '';
        
        this.students.forEach((student, index) => {
            const box = document.createElement('div');
            box.className = 'student-box';
            box.textContent = student;
            box.addEventListener('click', () => this.selectSpeaker(student));
            this.studentBoxes.appendChild(box);
        });
    }

    async selectSpeaker(speaker) {
        const previousSpeaker = this.currentSpeaker;
        const shouldTranscribe = this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording' && this.currentSpeaker !== speaker;
        
        // IMMEDIATELY update UI - no waiting for transcription
        this.updateSpeakerUI(speaker);
        
        // If we need to process transcription for previous speaker
        if (shouldTranscribe) {
            console.log(`🔄 Switching from "${previousSpeaker || 'No Speaker'}" to "${speaker || 'No Speaker'}"`);
            
            // Stop current recording and wait for it to finish
            await this.stopCurrentRecordingAndProcess(previousSpeaker);
        }
        
        // Update current speaker
        this.currentSpeaker = speaker;
        console.log(`🎙️ Speaker selected: ${speaker || 'No Speaker'}`);
        
        // If main recording is active, start recording for new speaker
        if (this.isRecording) {
            await this.startSpeakerRecording();
            this.showStatus(`🎤 Recording for: ${speaker || 'No Speaker'}`, 'info');
        }
    }

    async stopCurrentRecordingAndProcess(previousSpeaker) {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;

        return new Promise((resolve) => {
            // Capture the current chunks before stopping
            const chunksToProcess = [...this.currentAudioChunks];
            
            this.mediaRecorder.onstop = async () => {
                // Process the chunks we captured for the previous speaker
                if (chunksToProcess.length > 0) {
                    console.log(`📎 Processing ${chunksToProcess.length} chunks for previous speaker: ${previousSpeaker || 'No Speaker'}`);
                    
                    try {
                        const audioBlob = new Blob(chunksToProcess, { type: 'audio/webm' });
                        
                        if (audioBlob.size > 5000) { // 5KB minimum
                            // Show transcribing indicator
                            this.addTranscribingIndicator(previousSpeaker);
                            
                            // Process transcription in background
                            this.transcribeAudio(audioBlob, previousSpeaker);
                        } else {
                            console.log('⚠️ Recording too short, skipping transcription');
                        }
                    } catch (error) {
                        console.error('Error processing previous recording:', error);
                    }
                } else {
                    console.log('⚠️ No chunks to process');
                }
                
                // Clear chunks for new recording
                this.currentAudioChunks = [];
                resolve();
            };
            
            this.mediaRecorder.stop();
        });
    }

    updateSpeakerUI(speaker) {
        // Update UI immediately
        document.querySelectorAll('.student-box').forEach(box => {
            box.classList.remove('active');
        });
        this.noSpeakerBtn.classList.remove('active');

        if (speaker) {
            document.querySelectorAll('.student-box').forEach(box => {
                if (box.textContent === speaker) {
                    box.classList.add('active');
                }
            });
        } else {
            this.noSpeakerBtn.classList.add('active');
        }
    }

    async processTranscriptionInBackground(forSpeaker) {
        // This function is no longer needed - moved logic to stopCurrentRecordingAndProcess
    }

    addTranscribingIndicator(speaker) {
        // Add a temporary "transcribing..." entry that will be replaced
        const timestamp = new Date().toISOString();
        const transcribingEntry = {
            speaker: speaker || 'No Speaker',
            text: 'Transcribing...',
            timestamp: timestamp,
            isTranscribing: true
        };

        this.transcriptionData.push(transcribingEntry);
        this.updateTranscriptionDisplay();
        this.updateSaveButtonState(); // Update save button state after adding transcribing indicator
    }

    async startMainRecording() {
        try {
            // Get microphone access
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            this.isRecording = true;
            
            // Update UI
            this.recordBtn.style.display = 'none';
            this.stopBtn.style.display = 'inline-flex';
            
            // Start timer
            this.startTimer();
            
            // If a speaker is already selected, start recording for them
            if (this.currentSpeaker !== null) {
                await this.startSpeakerRecording();
                this.showStatus(`🎤 Recording started! Currently recording for: ${this.currentSpeaker || 'No Speaker'}`, 'success');
            } else {
                this.showStatus(`🎤 Recording ready! Select a speaker to begin recording their audio.`, 'info');
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showStatus('Error accessing microphone. Please allow microphone access.', 'error');
        }
    }

    async startSpeakerRecording() {
        if (!this.audioStream || !this.isRecording) {
            return;
        }

        try {
            // Create new MediaRecorder for this speaker
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            // Don't clear chunks here - they should already be cleared after processing

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.currentAudioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                console.log(`🛑 Recording stopped for speaker: ${this.currentSpeaker || 'No Speaker'}`);
            };

            // Start recording with regular chunks
            this.mediaRecorder.start(100); // Request chunks every 100ms
            console.log(`🎤 Started recording for speaker: ${this.currentSpeaker || 'No Speaker'}`);

        } catch (error) {
            console.error('Error starting speaker recording:', error);
        }
    }

    async stopCurrentRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            return new Promise((resolve) => {
                this.mediaRecorder.onstop = () => {
                    resolve();
                };
                this.mediaRecorder.stop();
            });
        }
    }

    async processCompleteRecording() {
        if (this.currentAudioChunks.length === 0) return;

        try {
            // Create complete audio blob
            const audioBlob = new Blob(this.currentAudioChunks, { type: 'audio/webm' });
            console.log(`📎 Processing complete recording: ${audioBlob.size} bytes for speaker: ${this.currentSpeaker || 'No Speaker'}`);

            // Only transcribe if blob is substantial
            if (audioBlob.size > 5000) { // 5KB minimum for complete recordings
                await this.transcribeAudio(audioBlob, this.currentSpeaker);
            } else {
                console.log('⚠️ Recording too short, skipping transcription');
            }

            // Clear chunks
            this.currentAudioChunks = [];

        } catch (error) {
            console.error('Error processing complete recording:', error);
        }
    }

    async stopMainRecording() {
        // Stop current speaker recording if active and process final transcription
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            await this.stopCurrentRecordingAndProcess(this.currentSpeaker);
        }

        // Stop main recording
        this.isRecording = false;
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        // Update UI
        this.recordBtn.style.display = 'inline-flex';
        this.stopBtn.style.display = 'none';
        
        // Stop timer
        this.stopTimer();
        
        // Show post-processing section
        this.showPostProcessingSection();
        
        this.showStatus('🛑 Recording stopped completely.', 'info');
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            this.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async transcribeAudio(audioBlob, speaker) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');

            console.log(`🌐 Sending ${audioBlob.size} bytes for transcription...`);

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success && result.text.trim()) {
                const timestamp = new Date().toISOString();
                
                // Remove any "transcribing..." entry for this speaker
                this.removeTranscribingIndicator(speaker);
                
                const transcriptionEntry = {
                    speaker: speaker || 'No Speaker',
                    text: result.text,
                    timestamp: timestamp
                };

                this.transcriptionData.push(transcriptionEntry);
                this.updateTranscriptionDisplay();
                this.updateSaveButtonState(); // Update save button state after successful transcription
                
                console.log(`✅ Transcribed for ${speaker || 'No Speaker'}: "${result.text}"`);
                
                // Don't show status messages during active recording to avoid UI clutter
                // this.showStatus(`✅ ${speaker || 'No Speaker'}: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}"`, 'success');
                
                // Show demo mode indicator if applicable
                if (result.needsApiKey) {
                    this.showDemoIndicator();
                }
            } else {
                // Remove transcribing indicator even if no text
                this.removeTranscribingIndicator(speaker);
                console.log('⚠️ No transcription text received');
            }

        } catch (error) {
            // Remove transcribing indicator on error
            this.removeTranscribingIndicator(speaker);
            console.error('Transcription error:', error);
            this.showStatus('Transcription failed. Please check your connection.', 'error');
        }
    }

    removeTranscribingIndicator(speaker) {
        // Remove any "transcribing..." entries for this speaker
        this.transcriptionData = this.transcriptionData.filter(entry => 
            !(entry.isTranscribing && entry.speaker === (speaker || 'No Speaker'))
        );
    }

    showDemoIndicator() {
        // Add a subtle demo indicator to the transcription
        const demoIndicator = document.querySelector('.demo-indicator');
        if (!demoIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'demo-indicator';
            indicator.innerHTML = '⚠️ Add ElevenLabs API key to .env for real transcription';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 152, 0, 0.9);
                color: white;
                padding: 12px 20px;
                border-radius: 25px;
                font-size: 14px;
                z-index: 1000;
                animation: fadeInOut 4s ease-in-out;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(indicator);
            
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 4000);
        }
    }

    updateTranscriptionDisplay() {
        // Remove no-transcription message
        const noTranscription = this.transcriptionContainer.querySelector('.no-transcription');
        if (noTranscription) {
            noTranscription.remove();
        }

        // Clear and rebuild transcription display
        this.transcriptionContainer.innerHTML = '';

        this.transcriptionData.forEach((entry, index) => {
            if (entry.text.trim()) {
                const entryDiv = document.createElement('div');
                entryDiv.className = `transcription-entry ${entry.speaker === 'No Speaker' ? 'no-speaker' : ''}`;
                entryDiv.style.animation = 'slideIn 0.3s ease-out';

                // Add special styling for transcribing entries
                if (entry.isTranscribing) {
                    entryDiv.style.opacity = '0.7';
                    entryDiv.style.fontStyle = 'italic';
                }

                const speakerDiv = document.createElement('div');
                speakerDiv.className = `transcription-speaker ${entry.speaker === 'No Speaker' ? 'no-speaker' : ''}`;
                speakerDiv.innerHTML = `<i class="fas fa-user"></i> ${entry.speaker}`;

                const textDiv = document.createElement('div');
                textDiv.className = 'transcription-text';
                
                if (entry.isTranscribing) {
                    textDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${entry.text}`;
                } else {
                    textDiv.textContent = entry.text;
                }

                const timestampDiv = document.createElement('div');
                timestampDiv.className = 'transcription-timestamp';
                timestampDiv.textContent = new Date(entry.timestamp).toLocaleTimeString();

                entryDiv.appendChild(speakerDiv);
                entryDiv.appendChild(textDiv);
                entryDiv.appendChild(timestampDiv);
                this.transcriptionContainer.appendChild(entryDiv);
            }
        });

        // Scroll to bottom
        this.transcriptionContainer.scrollTop = this.transcriptionContainer.scrollHeight;
    }

    exportToCSV() {
        if (this.transcriptionData.length === 0) {
            this.showStatus('No transcription data to export', 'error');
            return;
        }

        const headers = ['Speaker', 'Text', 'Timestamp'];
        const csvContent = [
            headers.join(','),
            ...this.transcriptionData
                .filter(entry => entry.text.trim())
                .map(entry => [
                    `"${entry.speaker}"`,
                    `"${entry.text.replace(/"/g, '""')}"`,
                    `"${entry.timestamp}"`
                ].join(','))
        ].join('\n');

        this.downloadFile(csvContent, 'interview-transcription.csv', 'text/csv');
        this.showStatus('CSV file downloaded successfully!', 'success');
    }

    exportToJSON() {
        if (this.transcriptionData.length === 0) {
            this.showStatus('No transcription data to export', 'error');
            return;
        }

        const jsonData = {
            question: this.displayQuestion.textContent,
            students: this.students,
            transcription: this.transcriptionData.filter(entry => entry.text.trim()),
            exportedAt: new Date().toISOString(),
            demoMode: this.demoMode
        };

        const jsonContent = JSON.stringify(jsonData, null, 2);
        this.downloadFile(jsonContent, 'interview-transcription.json', 'application/json');
        this.showStatus('JSON file downloaded successfully!', 'success');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    resetInterview() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopMainRecording();
        }

        // Reset all data
        this.transcriptionData = [];
        this.currentSpeaker = null;
        this.students = [];
        this.currentAudioChunks = [];

        // Reset UI sections
        this.setupSection.style.display = 'block';
        this.interviewSection.style.display = 'none';
        
        // Clear all inputs
        this.questionInput.value = '';
        this.studentInputs.forEach(input => input.value = '');
        
        // Reset analysis prompt to default placeholder
        this.analysisPrompt.value = '';
        
        // Clear transcription display
        this.transcriptionContainer.innerHTML = '<p class="no-transcription">Transcription will appear here when recording starts...</p>';
        
        // Reset speaker selection UI
        document.querySelectorAll('.student-box').forEach(box => {
            box.classList.remove('active');
        });
        this.noSpeakerBtn.classList.add('active');
        
        // Reset button states
        this.recordBtn.style.display = 'inline-flex';
        this.stopBtn.style.display = 'none';
        this.recordBtn.disabled = false;
        
        // Reset timer
        this.timer.textContent = '00:00';
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Clear student boxes container
        this.studentBoxes.innerHTML = '';
        
        // Clear display question
        this.displayQuestion.textContent = '';
        
        // Hide and reset post-processing section
        this.hidePostProcessingSection();
        this.resetAnalysisResults();
        
        // Clear any status messages
        this.statusMessage.classList.remove('show');
        
        this.showStatus('Interview reset. Ready for new interview setup.', 'info');
        this.updateSaveButtonState(); // Update save button state after resetting
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type} show`;
        
        setTimeout(() => {
            this.statusMessage.classList.remove('show');
        }, 4000);
    }

    // Post-Processing Analysis Methods
    showPostProcessingSection() {
        if (this.transcriptionData.length > 0) {
            this.postProcessingSection.style.display = 'block';
            this.updateAnalysisPromptPlaceholders();
        }
    }

    hidePostProcessingSection() {
        this.postProcessingSection.style.display = 'none';
        this.postProcessingContent.style.display = 'none';
        this.postProcessingChevron.classList.remove('expanded');
        // Also reset the header expanded state
        const header = document.querySelector('.post-processing-header');
        if (header) {
            header.classList.remove('expanded');
        }
    }

    updateAnalysisPromptPlaceholders() {
        // Update the placeholder with actual student names and question
        const studentNames = this.students.join(', ');
        const question = this.displayQuestion.textContent;
        
        const currentPrompt = this.analysisPrompt.value || this.analysisPrompt.placeholder;
        const updatedPrompt = currentPrompt
            .replace('[STUDENT_NAMES_PLACEHOLDER]', studentNames)
            .replace('[QUESTION_PLACEHOLDER]', question);
        
        if (!this.analysisPrompt.value) {
            this.analysisPrompt.placeholder = updatedPrompt;
        }
    }

    async runGPTAnalysis() {
        if (this.transcriptionData.length === 0) {
            this.showStatus('No transcription data available for analysis', 'error');
            return;
        }

        // Prepare the analysis request
        const prompt = this.analysisPrompt.value || this.analysisPrompt.placeholder;
        const conversation = this.transcriptionData
            .filter(entry => entry.text.trim() && !entry.isTranscribing)
            .map(entry => `${entry.speaker}: ${entry.text}`)
            .join('\n\n');

        const analysisData = {
            prompt: prompt,
            conversation: conversation,
            question: this.displayQuestion.textContent,
            studentNames: this.students,
            timestamp: new Date().toISOString()
        };

        // Update UI to show processing state
        this.setAnalysisProcessing(true);
        this.analysisStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing conversation with GPT-4.1...';
        this.analysisStatus.className = 'analysis-status processing';

        try {
            console.log('🧠 Sending conversation to GPT-4.1 for analysis...');
            
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(analysisData)
            });

            const result = await response.json();

            if (result.success) {
                this.displayAnalysisResults(result.analysis);
                this.analysisStatus.innerHTML = '<i class="fas fa-check-circle"></i> Analysis completed successfully!';
                this.analysisStatus.className = 'analysis-status success';
                
                console.log('✅ GPT-4.1 analysis completed successfully');
                this.showStatus('Analysis completed! Check the results below.', 'success');
            } else {
                throw new Error(result.error || 'Analysis failed');
            }

        } catch (error) {
            console.error('❌ Analysis error:', error);
            this.analysisStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Analysis failed. Please try again.';
            this.analysisStatus.className = 'analysis-status error';
            this.showStatus('Analysis failed. Please check your connection and try again.', 'error');
        } finally {
            this.setAnalysisProcessing(false);
        }
    }

    setAnalysisProcessing(processing) {
        this.runAnalysisBtn.disabled = processing;
        if (processing) {
            this.runAnalysisBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        } else {
            this.runAnalysisBtn.innerHTML = '<i class="fas fa-magic"></i> Run GPT-4.1 Analysis';
        }
    }

    displayAnalysisResults(analysisText) {
        // Store original text for clipboard and Word export
        this.originalAnalysisText = analysisText;
        
        this.analysisContent.innerHTML = this.convertMarkdownToHtml(analysisText);
        this.analysisResults.style.display = 'block';
        
        // Scroll to results
        this.analysisResults.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    convertMarkdownToHtml(text) {
        if (!text) return '';
        
        // Convert markdown to HTML
        return text
            // Bold text: **text** or __text__
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            
            // Italic text: *text* or _text_
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            
            // Headers: ### Header
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            
            // Bullet points: - item or * item
            .replace(/^[\-\*] (.*)$/gm, '<li>$1</li>')
            
            // Wrap consecutive list items in <ul>
            .replace(/(<li>.*<\/li>)/gs, (match) => {
                // Split by </li> and rejoin with proper ul wrapping
                const items = match.split('</li>').filter(item => item.trim());
                if (items.length > 0) {
                    return '<ul>' + items.map(item => item + '</li>').join('') + '</ul>';
                }
                return match;
            })
            
            // Line breaks: Convert \n to <br> but preserve paragraph structure
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            
            // Wrap in paragraphs if not already wrapped
            .replace(/^(?!<[uo]l|<h[1-6]|<p)(.+)$/gm, '<p>$1</p>')
            
            // Clean up any double paragraph tags
            .replace(/<p><\/p>/g, '')
            .replace(/<p>(<h[1-6]>.*<\/h[1-6]>)<\/p>/g, '$1')
            .replace(/<p>(<ul>.*<\/ul>)<\/p>/gs, '$1');
    }

    async copyAnalysisToClipboard() {
        try {
            await navigator.clipboard.writeText(this.originalAnalysisText);
            
            // Visual feedback
            const originalText = this.copyAnalysisBtn.innerHTML;
            this.copyAnalysisBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            this.copyAnalysisBtn.style.background = '#27ae60';
            
            setTimeout(() => {
                this.copyAnalysisBtn.innerHTML = originalText;
                this.copyAnalysisBtn.style.background = '#95a5a6';
            }, 2000);
            
            this.showStatus('Analysis copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showStatus('Failed to copy to clipboard', 'error');
        }
    }

    downloadAnalysisAsWord() {
        try {
            const analysisText = this.originalAnalysisText;
            if (!analysisText) {
                this.showStatus('No analysis content to download', 'error');
                return;
            }

            // Create RTF content
            const rtfContent = this.generateRTFDocument(analysisText);
            
            // Create filename with timestamp
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `interview-analysis-${timestamp}.rtf`;
            
            // Download the file
            this.downloadFile(rtfContent, filename, 'application/rtf');
            
            // Visual feedback
            const originalText = this.downloadWordBtn.innerHTML;
            this.downloadWordBtn.innerHTML = '<i class="fas fa-check"></i> Downloaded!';
            this.downloadWordBtn.style.background = '#27ae60';
            
            setTimeout(() => {
                this.downloadWordBtn.innerHTML = originalText;
                this.downloadWordBtn.style.background = '#2b579a';
            }, 2000);
            
            this.showStatus('Word document downloaded successfully!', 'success');
        } catch (error) {
            console.error('Failed to download Word document:', error);
            this.showStatus('Failed to download Word document', 'error');
        }
    }

    generateRTFDocument(text) {
        // Get interview context
        const question = this.displayQuestion.textContent;
        const students = this.students.join(', ');
        const timestamp = new Date().toLocaleDateString();
        
        // Convert text to RTF format
        let rtfText = text
            // Escape RTF special characters
            .replace(/\\/g, '\\\\')
            .replace(/{/g, '\\{')
            .replace(/}/g, '\\}')
            
            // Convert line breaks
            .replace(/\n/g, '\\par ')
            
            // Convert basic formatting (approximate)
            .replace(/\*\*(.*?)\*\*/g, '{\\b $1}') // Bold
            .replace(/__(.*?)__/g, '{\\b $1}')      // Bold
            .replace(/\*(.*?)\*/g, '{\\i $1}')      // Italic
            .replace(/_(.*?)_/g, '{\\i $1}');       // Italic

        // Create RTF document structure
        const rtf = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;}
\\f0\\fs24

{\\b\\fs28 Interview Analysis Report}\\par\\par

{\\b Date:} ${timestamp}\\par
{\\b Question:} ${question}\\par
{\\b Students:} ${students}\\par\\par

{\\b\\fs26 Analysis Results:}\\par\\par

${rtfText}

\\par\\par
{\\i Generated by Interview Transcription App}
}`;
        
        return rtf;
    }

    resetAnalysisResults() {
        this.analysisResults.style.display = 'none';
        this.analysisContent.textContent = '';
        this.analysisStatus.innerHTML = '';
        this.analysisStatus.className = 'analysis-status';
        this.setAnalysisProcessing(false);
        this.originalAnalysisText = null; // Reset the original text
        
        // Reset button states
        if (this.downloadWordBtn) {
            this.downloadWordBtn.innerHTML = '<i class="fas fa-file-word"></i> Download Word';
            this.downloadWordBtn.style.background = '#2b579a';
        }
        if (this.copyAnalysisBtn) {
            this.copyAnalysisBtn.innerHTML = '<i class="fas fa-copy"></i> Copy Analysis';
            this.copyAnalysisBtn.style.background = '#95a5a6';
        }
    }

    // Local Storage Methods
    saveInterviewToHistory() {
        if (this.transcriptionData.length === 0) {
            this.showStatus('No transcription data to save', 'error');
            return;
        }

        try {
            const interview = {
                id: this.generateInterviewId(),
                question: this.displayQuestion.textContent,
                students: [...this.students],
                transcription: this.transcriptionData.filter(entry => !entry.isTranscribing),
                timestamp: new Date().toISOString(),
                duration: this.calculateDuration(),
                analysis: this.getAnalysisResults(),
                savedAt: new Date().toISOString()
            };

            const savedInterviews = this.getSavedInterviews();
            savedInterviews.push(interview);
            
            localStorage.setItem('interviewHistory', JSON.stringify(savedInterviews));
            
            this.showStatus('Interview saved to history successfully!', 'success');
            console.log('✅ Interview saved to local storage:', interview.id);

        } catch (error) {
            console.error('❌ Error saving interview:', error);
            this.showStatus('Failed to save interview. Storage may be full.', 'error');
        }
    }

    getSavedInterviews() {
        try {
            const saved = localStorage.getItem('interviewHistory');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading saved interviews:', error);
            return [];
        }
    }

    generateInterviewId() {
        return 'interview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    calculateDuration() {
        if (this.startTime) {
            const duration = Date.now() - this.startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return 'N/A';
    }

    getAnalysisResults() {
        try {
            const analysisContent = this.analysisContent?.textContent;
            return analysisContent && analysisContent.trim() ? analysisContent : null;
        } catch (error) {
            console.error('Error getting analysis results:', error);
            return null;
        }
    }

    // Check if interview can be saved
    canSaveInterview() {
        return this.transcriptionData.length > 0 && this.students.length > 0;
    }

    // Update save button state
    updateSaveButtonState() {
        if (this.saveInterviewBtn) {
            this.saveInterviewBtn.disabled = !this.canSaveInterview();
        }
    }
}

// Global function for toggling post-processing section (called from HTML onclick)
function togglePostProcessing() {
    const content = document.getElementById('postProcessingContent');
    const chevron = document.getElementById('postProcessingChevron');
    const header = document.querySelector('.post-processing-header');
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        header.classList.add('expanded');
    } else {
        content.style.display = 'none';
        header.classList.remove('expanded');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new InterviewTranscriptionApp();
}); 