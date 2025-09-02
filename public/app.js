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
        
        // Session tracking for multiple questions
        this.sessionData = {
            sessionId: null,
            questions: [],
            currentQuestionIndex: 0,
            students: [],
            startTime: null,
            state: 'setup', // 'setup' | 'active' | 'ended' | 'analyzed'
            lastSaved: null,
            autoSaveEnabled: true,
            metadata: {
                totalTranscriptions: 0,
                averageQuestionDuration: 0,
                mostActiveStudent: null,
                sessionQuality: 'good', // 'good' | 'partial' | 'incomplete'
                deviceInfo: navigator.userAgent.split(' ')[0],
                browserInfo: navigator.userAgent.split(' ').slice(-2).join(' '),
                totalRecordingTime: 0,
                questionsCompleted: 0,
                transcriptionAccuracy: 'high' // estimated based on response lengths
            }
        };
        
        // Auto-save throttling
        this.autoSaveTimeout = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.checkServerStatus();
        this.updateSaveButtonState(); // Initialize save button state
        
        // Check for incomplete sessions from previous use
        setTimeout(() => this.checkForIncompleteSession(), 1000);
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

    // Question Management Methods
    updateQuestionInputs() {
        this.questionInputs = Array.from(this.questionsContainer.querySelectorAll('.question-input'));
        this.updateQuestionCount();
    }

    addQuestionInput() {
        const questionIndex = this.questionInputs.length;
        const questionNumber = questionIndex + 1;
        
        const questionGroup = document.createElement('div');
        questionGroup.className = 'question-input-group';
        questionGroup.innerHTML = `
            <div class="question-header">
                <span class="question-number">Question ${questionNumber}</span>
                <button type="button" class="remove-question-btn" onclick="app.removeQuestionInput(${questionIndex})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <textarea class="question-input" placeholder="Enter question ${questionNumber} here..." rows="2"></textarea>
        `;
        
        this.questionsContainer.appendChild(questionGroup);
        this.updateQuestionInputs();
        this.updateRemoveButtons();
        
        // Focus on the new question input
        const newInput = questionGroup.querySelector('.question-input');
        newInput.focus();
    }

    removeQuestionInput(index) {
        if (this.questionInputs.length <= 1) {
            this.showStatus('You must have at least one question', 'info');
            return;
        }
        
        const questionGroups = this.questionsContainer.querySelectorAll('.question-input-group');
        if (questionGroups[index]) {
            questionGroups[index].remove();
            this.updateQuestionInputs();
            this.updateQuestionNumbers();
            this.updateRemoveButtons();
        }
    }

    updateQuestionNumbers() {
        const questionGroups = this.questionsContainer.querySelectorAll('.question-input-group');
        questionGroups.forEach((group, index) => {
            const questionNumber = group.querySelector('.question-number');
            const questionInput = group.querySelector('.question-input');
            const removeBtn = group.querySelector('.remove-question-btn');
            
            questionNumber.textContent = `Question ${index + 1}`;
            questionInput.placeholder = `Enter question ${index + 1} here...`;
            removeBtn.setAttribute('onclick', `app.removeQuestionInput(${index})`);
        });
    }

    updateRemoveButtons() {
        const removeButtons = this.questionsContainer.querySelectorAll('.remove-question-btn');
        removeButtons.forEach(btn => {
            btn.style.display = this.questionInputs.length > 1 ? 'flex' : 'none';
        });
    }

    updateQuestionCount() {
        const count = this.questionInputs.length;
        if (this.questionCount) {
            this.questionCount.textContent = `${count} question${count !== 1 ? 's' : ''}`;
        }
    }

    initializeElements() {
        // Setup elements
        this.questionInputs = [];
        this.questionsContainer = document.querySelector('.questions-container');
        this.addQuestionBtn = document.getElementById('addQuestionBtn');
        this.questionCount = document.getElementById('questionCount');
        
        // Student inputs (dynamic)
        this.studentInputsContainer = document.querySelector('.student-inputs');
        this.addStudentBtn = document.getElementById('addStudentBtn');
        this.removeStudentBtn = document.getElementById('removeStudentBtn');
        this.studentInputs = Array.from(this.studentInputsContainer.querySelectorAll('.student-input'));
        this.startSetupBtn = document.getElementById('startSetup');
        
        // Initialize with first question input
        this.updateQuestionInputs();
        
        // Interview elements
        this.setupSection = document.querySelector('.setup-section');
        this.interviewSection = document.querySelector('.interview-section');
        this.displayQuestion = document.getElementById('displayQuestion');
        this.studentBoxes = document.getElementById('studentBoxes');
        this.noSpeakerBtn = document.getElementById('noSpeaker');
        this.recordBtn = document.getElementById('recordBtn');
        this.endSessionBtn = document.getElementById('endSessionBtn');
        this.timer = document.getElementById('timer');
        this.transcriptionContainer = document.getElementById('transcriptionContainer');
        this.sessionNavigation = document.getElementById('sessionNavigation');
        this.nextQuestionBtn = document.getElementById('nextQuestionBtn');
        
        // Session progress elements
        this.sessionProgressDisplay = document.getElementById('sessionProgressDisplay');
        this.currentQuestionDisplay = document.getElementById('currentQuestionDisplay');
        this.totalQuestionsDisplay = document.getElementById('totalQuestionsDisplay');
        this.progressFill = document.getElementById('progressFill');
        
        // Export elements
        this.exportCSVBtn = document.getElementById('exportCSV');
        this.exportJSONBtn = document.getElementById('exportJSON');
        this.resetBtn = document.getElementById('resetInterview');
        
        // Session elements
        this.sessionInfo = document.getElementById('sessionInfo');
        this.sessionProgress = document.getElementById('sessionProgress');
        this.totalQuestions = document.getElementById('totalQuestions');
        this.sessionStatus = document.getElementById('sessionStatus');
        this.sessionStatusIcon = document.getElementById('sessionStatusIcon');
        this.sessionStatusText = document.getElementById('sessionStatusText');
        
        // Session completion elements
        this.sessionCompletionSection = document.getElementById('sessionCompletionSection');
        this.sessionSummaryText = document.getElementById('sessionSummaryText');
        this.sessionDuration = document.getElementById('sessionDuration');
        this.questionsReviewContainer = document.getElementById('questionsReviewContainer');
        this.questionsReview = document.getElementById('questionsReviewContainer'); // Fix: use correct element
        this.sessionAnalysisPrompt = document.getElementById('sessionAnalysisPrompt');
        this.runSessionAnalysisBtn = document.getElementById('runSessionAnalysisBtn');
        this.sessionAnalysisStatus = document.getElementById('sessionAnalysisStatus');
        this.sessionAnalysisResults = document.getElementById('sessionAnalysisResults');
        this.sessionAnalysisContent = document.getElementById('sessionAnalysisContent');
        this.copySessionAnalysisBtn = document.getElementById('copySessionAnalysisBtn');
        this.downloadSessionWordBtn = document.getElementById('downloadSessionWordBtn');
        // Transcript editor elements
        this.transcriptEditor = document.getElementById('transcriptEditor');
        this.saveTranscriptBtn = document.getElementById('saveTranscriptBtn');
        this.revertTranscriptBtn = document.getElementById('revertTranscriptBtn');
        this.transcriptHistoryStatus = document.getElementById('transcriptHistoryStatus');
        this.transcriptDisplay = document.getElementById('transcriptDisplay');
        this.editTranscriptBtn = document.getElementById('editTranscriptBtn');
        this.openPromptModalAtEndBtn = document.getElementById('openPromptModalAtEnd');
        
        // Status message
        this.statusMessage = document.getElementById('statusMessage');

        // Prompt modal elements
        this.promptModal = document.getElementById('promptModal');
        this.openPromptModalBtn = document.getElementById('openPromptModal');
        this.openPromptModalFloatingBtn = document.getElementById('openPromptModalFloating');
        this.promptModalTextarea = document.getElementById('promptModalTextarea');
        this.savePromptBtn = document.getElementById('savePromptBtn');
        this.closePromptBtn = document.getElementById('closePromptBtn');
        this.reloadPromptBtn = document.getElementById('reloadPromptBtn');
        this.promptModalStatus = document.getElementById('promptModalStatus');
        // Multi-prompt controls
        this.promptItems = document.getElementById('promptItems');
        this.promptNameInput = document.getElementById('promptNameInput');
        this.newPromptBtn = document.getElementById('newPromptBtn');
        this.deletePromptBtn = document.getElementById('deletePromptBtn');
        this.choosePromptBtn = document.getElementById('choosePromptBtn');
        this.activePromptId = null;
    }

    setupEventListeners() {
        console.log('🔧 Setting up event listeners...');
        console.log('startSetupBtn found:', !!this.startSetupBtn);
        
        if (this.startSetupBtn) {
            this.startSetupBtn.addEventListener('click', () => {
                console.log('🎯 Start interview button clicked!');
                this.startInterview();
            });
        } else {
            console.error('❌ startSetupBtn element not found!');
        }
        
        this.addQuestionBtn.addEventListener('click', () => this.addQuestionInput());
        this.recordBtn.addEventListener('click', () => this.startMainRecording());
        this.endSessionBtn.addEventListener('click', () => this.endSession());
        this.noSpeakerBtn.addEventListener('click', () => this.selectSpeaker('Teacher'));
        this.exportCSVBtn.addEventListener('click', () => this.exportToCSV());
        this.exportJSONBtn.addEventListener('click', () => this.exportToJSON());
        this.resetBtn.addEventListener('click', () => this.resetInterview());
        this.nextQuestionBtn.addEventListener('click', () => this.startNextQuestion());

        // Student input controls
        if (this.addStudentBtn) this.addStudentBtn.addEventListener('click', () => this.addStudentInput());
        if (this.removeStudentBtn) this.removeStudentBtn.addEventListener('click', () => this.removeStudentInput());
        
        // Session completion event listeners
        this.runSessionAnalysisBtn.addEventListener('click', () => this.runSessionAnalysis());
        this.copySessionAnalysisBtn.addEventListener('click', () => this.copySessionAnalysisToClipboard());
        this.downloadSessionWordBtn.addEventListener('click', () => this.downloadSessionAnalysisAsWord());
        if (this.openPromptModalAtEndBtn) {
            this.openPromptModalAtEndBtn.addEventListener('click', () => this.openPromptEditor());
        }

        // Transcript editor listeners
        if (this.transcriptEditor) {
            this.transcriptEditor.addEventListener('input', () => this.autosaveTranscriptDraft());
        }
        if (this.editTranscriptBtn) {
            this.editTranscriptBtn.addEventListener('click', () => this.toggleTranscriptEdit(true));
        }
        if (this.saveTranscriptBtn) {
            this.saveTranscriptBtn.addEventListener('click', () => this.saveEditedTranscript());
        }
        if (this.revertTranscriptBtn) {
            this.revertTranscriptBtn.addEventListener('click', () => this.revertLastTranscriptVersion());
        }

        // Prompt modal listeners
        if (this.openPromptModalBtn) {
            this.openPromptModalBtn.addEventListener('click', () => this.openPromptEditor());
        }
        if (this.openPromptModalFloatingBtn) {
            this.openPromptModalFloatingBtn.addEventListener('click', () => this.openPromptEditor());
        }
        if (this.closePromptBtn) {
            this.closePromptBtn.addEventListener('click', () => this.closePromptEditor());
        }
        if (this.reloadPromptBtn) {
            this.reloadPromptBtn.addEventListener('click', () => this.loadPromptList());
        }
        if (this.savePromptBtn) {
            this.savePromptBtn.addEventListener('click', () => this.saveCurrentPrompt());
        }
        if (this.newPromptBtn) {
            this.newPromptBtn.addEventListener('click', () => this.createNewPrompt());
        }
        if (this.deletePromptBtn) {
            this.deletePromptBtn.addEventListener('click', () => this.deleteCurrentPrompt());
        }
        if (this.choosePromptBtn) {
            this.choosePromptBtn.addEventListener('click', () => this.applyCurrentPromptToSession());
        }

        // Close prompt modal when clicking outside content or pressing Escape
        if (this.promptModal) {
            const backdrop = this.promptModal.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closePromptEditor());
            }
            this.promptModal.addEventListener('mousedown', (event) => {
                const content = this.promptModal.querySelector('.modal-content');
                if (!content) return;
                if (!content.contains(event.target)) {
                    this.closePromptEditor();
                }
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.promptModal.style.display === 'flex') {
                    this.closePromptEditor();
                }
            });
        }
    }

    // ===== Transcript Editing with Versioned Local Storage =====
    buildFullTranscriptFromSession() {
        if (!this.sessionData || !this.sessionData.questions) return '';
        const parts = [];
        this.sessionData.questions.forEach((q, i) => {
            parts.push(`Question ${i + 1}: ${q.question || ''}`);
            if (Array.isArray(q.transcription)) {
                q.transcription.forEach(t => {
                    if (t && t.text) parts.push(`${t.speaker || 'Speaker'}: ${t.text}`);
                });
            }
            parts.push('');
        });
        return parts.join('\n');
    }

    loadTranscriptEditor() {
        if (!this.transcriptEditor) return;
        const transcript = this.buildFullTranscriptFromSession();
        this.transcriptEditor.value = transcript;
        this.renderTranscriptDisplay(transcript);
    }

    renderTranscriptDisplay(text) {
        if (!this.transcriptDisplay) return;
        const lines = (text || '').split(/\n+/).filter(Boolean);
        const html = lines.map((line, idx) => {
            const m = line.match(/^(.*?):\s*(.*)$/);
            if (m) {
                const userRaw = m[1] || '';
                const user = this.escapeHtml(userRaw);
                const content = this.escapeHtml(m[2] || '');
                const isQuestion = idx === 0 && /^question\b/i.test(userRaw.trim());
                const rowClass = `td-row${isQuestion ? ' td-question' : ''}`;
                return `<div class="${rowClass}"><span class="td-user">${user}</span><span class="td-text">${content}</span></div>`;
            }
            return `<div class="td-row td-sep">${this.escapeHtml(line)}</div>`;
        }).join('');
        this.transcriptDisplay.innerHTML = html || '<div class="td-empty">Transcript will appear here...</div>';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    toggleTranscriptEdit(show) {
        if (!this.transcriptEditor || !this.transcriptDisplay) return;
        const actions = document.querySelector('.transcript-actions');
        if (show) {
            this.transcriptEditor.style.display = 'block';
            if (actions) actions.style.display = 'flex';
            this.transcriptDisplay.style.display = 'none';
        } else {
            this.transcriptEditor.style.display = 'none';
            if (actions) actions.style.display = 'none';
            this.transcriptDisplay.style.display = 'block';
        }
    }

    autosaveTranscriptDraft() {
        if (!this.transcriptEditor || !this.sessionData?.sessionId) return;
        const draftKey = `transcript_draft_${this.sessionData.sessionId}`;
        localStorage.setItem(draftKey, this.transcriptEditor.value);
        this.showTranscriptStatus('Draft autosaved', 'success');
    }

    saveEditedTranscript() {
        if (!this.transcriptEditor || !this.sessionData?.sessionId) return;
        const id = this.sessionData.sessionId;
        const archiveKey = `transcript_archive_${id}`;
        const currentKey = `transcript_current_${id}`;
        const timestamp = new Date().toISOString();

        // Push current version to archive
        const archive = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        const previous = localStorage.getItem(currentKey) || '';
        archive.push({ timestamp, text: previous });
        // Keep last 20 versions
        while (archive.length > 20) archive.shift();
        localStorage.setItem(archiveKey, JSON.stringify(archive));

        // Save new current
        localStorage.setItem(currentKey, this.transcriptEditor.value);
        localStorage.removeItem(`transcript_draft_${id}`);
        this.renderTranscriptDisplay(this.transcriptEditor.value);
        this.toggleTranscriptEdit(false);
        this.showTranscriptStatus('Transcript saved with version history', 'success');
    }

    revertLastTranscriptVersion() {
        if (!this.transcriptEditor || !this.sessionData?.sessionId) return;
        const id = this.sessionData.sessionId;
        const archiveKey = `transcript_archive_${id}`;
        const currentKey = `transcript_current_${id}`;
        const archive = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        if (archive.length === 0) {
            this.showTranscriptStatus('No previous versions available', 'error');
            return;
        }
        const last = archive.pop();
        const current = localStorage.getItem(currentKey) || '';
        // Move current into archive and restore last
        archive.push({ timestamp: new Date().toISOString(), text: current });
        localStorage.setItem(archiveKey, JSON.stringify(archive));
        localStorage.setItem(currentKey, last.text || '');
        this.transcriptEditor.value = last.text || '';
        this.showTranscriptStatus('Reverted to previous version', 'success');
    }

    showTranscriptStatus(message, kind = 'success') {
        if (!this.transcriptHistoryStatus) return;
        this.transcriptHistoryStatus.textContent = message;
        this.transcriptHistoryStatus.className = `status-message ${kind} show`;
        setTimeout(() => this.transcriptHistoryStatus.classList.remove('show'), 1500);
    }

    refreshStudentInputsList() {
        this.studentInputs = Array.from(this.studentInputsContainer.querySelectorAll('.student-input'));
    }

    addStudentInput() {
        if (!this.studentInputsContainer) return;
        const count = this.studentInputsContainer.querySelectorAll('.student-input').length;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'student-input';
        input.placeholder = `Student ${count + 1} name`;
        this.studentInputsContainer.appendChild(input);
        this.refreshStudentInputsList();
        input.focus();
    }

    removeStudentInput() {
        if (!this.studentInputsContainer) return;
        const inputs = this.studentInputsContainer.querySelectorAll('.student-input');
        if (inputs.length > 1) {
            const last = inputs[inputs.length - 1];
            last.parentNode.removeChild(last);
            this.refreshStudentInputsList();
        } else {
            this.showStatus('At least one student is required', 'info');
        }
    }

    startInterview() {
        console.log('🚀 startInterview method called');
        
        const studentNames = this.studentInputs.map(input => input.value.trim()).filter(name => name);
        console.log('👥 Student names:', studentNames);

        if (studentNames.length === 0) {
            console.log('❌ No student names provided');
            this.showStatus('Please enter at least one student name', 'error');
            return;
        }

        console.log('✅ Student names validation passed');
        
        // Check if we're editing a question during an active session
        if (this.sessionData.sessionId && this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            console.log('🔄 Editing existing session question');
            // We're editing an existing question during the session
            const currentQuestion = this.sessionData.questions[this.sessionData.currentQuestionIndex];
            const questionText = this.questionInputs[0].value.trim() || `Question ${this.sessionData.currentQuestionIndex + 1}`;
            
            // Update the question text and mark as no longer placeholder
            currentQuestion.question = questionText;
            currentQuestion.isPlaceholder = questionText.startsWith('Question ') && questionText === `Question ${this.sessionData.currentQuestionIndex + 1}`;
            currentQuestion.startTime = new Date().toISOString();
            
            this.transcriptionData = [];
            this.displayQuestion.textContent = currentQuestion.question;
            
            // Show interview section and hide setup
            this.setupSection.style.display = 'none';
            this.interviewSection.style.display = 'block';
            
            // Scroll to top of the page for better UX
            window.scrollTo({ top: 0, behavior: 'smooth' });
            console.log('📜 Scrolled to top for question editing experience');
            
            // Update session info
            this.updateSessionInfo();
            
            const modeText = this.demoMode ? ' (No API Key)' : '';
            
            // Default to Teacher at session start
            this.selectSpeaker('Teacher');

            // Automatically start recording
            this.startMainRecording().then(() => {
                this.showStatus(`Question ${this.sessionData.currentQuestionIndex + 1} updated! Recording started. Select speakers.${modeText}`, 'success');
            });
            
            return;
        }

        console.log('🆕 Creating new session');
        
        // Initial session setup - get all questions from inputs
        const questionTexts = this.questionInputs.map((input, index) => {
            const text = input.value.trim();
            return text || `Question ${index + 1}`; // Use placeholder if empty
        });
        
        console.log('📝 Questions:', questionTexts);

        // Initialize session with all planned questions
        this.sessionData = {
            sessionId: this.generateSessionId(),
            questions: questionTexts.map((questionText, index) => ({
                questionId: this.generateQuestionId(),
                question: questionText,
                transcription: [],
                analysis: null,
                startTime: null,
                endTime: null,
                isPlaceholder: questionText.startsWith('Question ') && questionText === `Question ${index + 1}` // Track if it's a placeholder
            })),
            currentQuestionIndex: 0,
            students: studentNames,
            startTime: new Date().toISOString(),
            state: 'active',
            autoSaveEnabled: true,
            lastSaved: null,
            metadata: {
                totalTranscriptions: 0,
                averageQuestionDuration: 0,
                mostActiveStudent: null,
                sessionQuality: 'good', // 'good' | 'partial' | 'incomplete'
                deviceInfo: navigator.userAgent.split(' ')[0],
                browserInfo: navigator.userAgent.split(' ').slice(-2).join(' '),
                totalRecordingTime: 0,
                questionsCompleted: 0,
                transcriptionAccuracy: 'high' // estimated based on response lengths
            }
        };

        console.log('📊 Session data created:', this.sessionData.sessionId);

        // Start with the first question
        const currentQuestion = this.sessionData.questions[0];
        currentQuestion.startTime = new Date().toISOString();
        
        this.students = this.sessionData.students;
        this.transcriptionData = []; // Reset for current question
        
        this.displayQuestion.textContent = currentQuestion.question;
        
        console.log('🎯 Generating student boxes...');
        // Generate student boxes
        this.generateStudentBoxes();
        
        console.log('🔄 Switching UI sections...');
        // Show interview section and hide setup
        this.setupSection.style.display = 'none';
        this.interviewSection.style.display = 'block';
        
        // Scroll to top of the page for better UX
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('📜 Scrolled to top for better interview experience');
        
        // Show session progress and update session info
        this.sessionProgressDisplay.style.display = 'block';
        this.updateSessionInfo();
        this.updateSessionStatus();
        
        console.log('💾 Auto-saving session...');
        // Auto-save session after setup
        this.autoSaveSession('session_start').then(success => {
            if (success) {
                console.log('✅ Session start saved immediately to local storage');
            }
        }).catch(error => {
            console.error('❌ Error saving session start:', error);
        });
        
        const modeText = this.demoMode ? ' (No API Key)' : '';
        const totalQuestions = this.sessionData.questions.length;
        
        console.log('🎤 Starting main recording...');
        // Default to Teacher at session start
        this.selectSpeaker('Teacher');

        // Automatically start recording
        this.startMainRecording().then(() => {
            console.log('✅ Recording started successfully');
            this.showStatus(`Session started with ${totalQuestions} question${totalQuestions !== 1 ? 's' : ''}! Recording active. Select speakers.${modeText}`, 'success');
        }).catch(error => {
            console.error('❌ Error starting recording:', error);
            this.showStatus('Error starting recording. Please check microphone permissions.', 'error');
        });
    }

    // Prompt modal helpers
    async openPromptEditor() {
        if (!this.promptModal) return;
        this.promptModal.style.display = 'flex';
        await this.loadPromptList();
    }

    closePromptEditor() {
        if (!this.promptModal) return;
        this.promptModal.style.display = 'none';
    }

    async loadPromptList() {
        try {
            if (this.promptItems) this.promptItems.innerHTML = '<li>Loading...</li>';
            const listResp = await fetch('/api/prompts');
            const listData = await listResp.json();
            const prompts = listData.prompts || [];
            if (this.promptItems) {
                this.promptItems.innerHTML = '';
                prompts.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${(p.name || '(Untitled)').replace(/</g,'&lt;')}</span><span class="choose">Use</span>`;
                    li.addEventListener('click', () => this.selectPrompt(p._id));
                    if (this.activePromptId && (this.activePromptId === p._id)) li.classList.add('active');
                    this.promptItems.appendChild(li);
                });
            }
            // If nothing selected, auto-select first
            if (!this.activePromptId && prompts.length) {
                await this.selectPrompt(prompts[0]._id);
            } else if (!prompts.length) {
                this.activePromptId = null;
                if (this.promptNameInput) this.promptNameInput.value = '';
                if (this.promptModalTextarea) this.promptModalTextarea.value = '';
            }
        } catch (e) {
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Failed to load prompts';
                this.promptModalStatus.className = 'status-message error show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 3000);
            }
        }
    }

    async selectPrompt(id) {
        try {
            const resp = await fetch(`/api/prompts/${id}`);
            const data = await resp.json();
            if (resp.ok) {
                this.activePromptId = data._id;
                if (this.promptNameInput) this.promptNameInput.value = data.name || '';
                if (this.promptModalTextarea) this.promptModalTextarea.value = data.text || '';
                if (this.sessionAnalysisPrompt) this.sessionAnalysisPrompt.value = data.text || '';
                // Refresh selection marker
                if (this.promptItems) {
                    Array.from(this.promptItems.children).forEach(li => li.classList.remove('active'));
                    const match = Array.from(this.promptItems.children).find(li => li.textContent === (data.name || '(Untitled)'));
                    if (match) match.classList.add('active');
                }
            } else {
                throw new Error(data.error || 'Load failed');
            }
        } catch (e) {
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Failed to load prompt';
                this.promptModalStatus.className = 'status-message error show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 3000);
            }
        }
    }

    async saveCurrentPrompt() {
        if (!this.promptModalTextarea) return;
        const name = (this.promptNameInput?.value || '').trim();
        if (!name) {
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Please provide a name for the prompt';
                this.promptModalStatus.className = 'status-message error show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 2500);
            }
            this.promptNameInput?.focus();
            return;
        }
        const text = this.promptModalTextarea.value || '';
        try {
            if (this.activePromptId) {
                const resp = await fetch(`/api/prompts/${this.activePromptId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, text })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Save failed');
            } else {
                const resp = await fetch('/api/prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, text })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Create failed');
                this.activePromptId = data.id;
            }
            if (this.sessionAnalysisPrompt) this.sessionAnalysisPrompt.value = text;
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Saved';
                this.promptModalStatus.className = 'status-message success show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 1500);
            }
            await this.loadPromptList();
        } catch (e) {
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Failed to save prompt';
                this.promptModalStatus.className = 'status-message error show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 3000);
            }
        }
    }

    async createNewPrompt() {
        this.activePromptId = null;
        if (this.promptNameInput) this.promptNameInput.value = '';
        if (this.promptModalTextarea) this.promptModalTextarea.value = '';
        if (this.promptItems) Array.from(this.promptItems.children).forEach(li => li.classList.remove('active'));
    }

    applyCurrentPromptToSession() {
        const text = this.promptModalTextarea?.value || '';
        if (this.sessionAnalysisPrompt) this.sessionAnalysisPrompt.value = text;
        this.closePromptEditor();
        this.showStatus('Prompt selected for this session', 'success');
    }

    async deleteCurrentPrompt() {
        if (!this.activePromptId) return;
        try {
            const resp = await fetch(`/api/prompts/${this.activePromptId}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('Delete failed');
            this.activePromptId = null;
            if (this.promptNameInput) this.promptNameInput.value = '';
            if (this.promptModalTextarea) this.promptModalTextarea.value = '';
            await this.loadPromptList();
        } catch (e) {
            if (this.promptModalStatus) {
                this.promptModalStatus.textContent = 'Failed to delete prompt';
                this.promptModalStatus.className = 'status-message error show';
                setTimeout(() => this.promptModalStatus.classList.remove('show'), 3000);
            }
        }
    }

    generateStudentBoxes() {
        this.studentBoxes.innerHTML = '';
        
        this.students.forEach((student, index) => {
            const box = document.createElement('div');
            box.className = 'student-box';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'student-name';
            nameSpan.textContent = student;
            box.appendChild(nameSpan);
            
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
            console.log(`🔄 Switching from "${previousSpeaker || 'Teacher'}" to "${speaker || 'Teacher'}"`);
            
            // Stop current recording and wait for it to finish
            await this.stopCurrentRecordingAndProcess(previousSpeaker);
        }
        
        // Update current speaker
        this.currentSpeaker = speaker;
        console.log(`🎙️ Speaker selected: ${speaker || 'Teacher'}`);
        
        // If main recording is active, start recording for new speaker
        if (this.isRecording) {
            await this.startSpeakerRecording();
            this.showStatus(`🎤 Recording for: ${speaker || 'Teacher'}`, 'info');
        }
    }

    async stopCurrentRecordingAndProcess(previousSpeaker, targetQuestionIndex = null) {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;

        // Determine which question this transcription belongs to
        const questionIndex = targetQuestionIndex !== null ? targetQuestionIndex : this.sessionData.currentQuestionIndex;

        return new Promise((resolve) => {
            // Capture the current chunks before stopping
            const chunksToProcess = [...this.currentAudioChunks];
            
            this.mediaRecorder.onstop = async () => {
                // Process the chunks we captured for the previous speaker
                if (chunksToProcess.length > 0) {
                    console.log(`📎 Processing ${chunksToProcess.length} chunks for previous speaker: ${previousSpeaker || 'Teacher'} (Question ${questionIndex + 1})`);
                    
                    try {
                        const audioBlob = new Blob(chunksToProcess, { type: this.currentAudioMimeType || 'audio/webm' });
                        
                        if (audioBlob.size > 5000) { // 5KB minimum
                            // Show transcribing indicator for the correct question
                            this.addTranscribingIndicator(previousSpeaker, questionIndex);
                            
                            // Process transcription in background - pass the question index
                            this.transcribeAudio(audioBlob, previousSpeaker, questionIndex);
                        } else {
                            console.log('⚠️ Recording too short, skipping transcription');
                        }
                    } catch (error) {
                        console.error('Error processing previous recording:', error);
                    }
                } else {
                    console.log('⚠️ No chunks to process');
                }
                
                // Clear chunks for next recording cycle AFTER processing
                this.currentAudioChunks = [];
                resolve();
            };
            
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.warn('⚠️ mediaRecorder.stop() failed or already stopped:', e);
                resolve();
            }
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
            // No speaker state is no longer used; teacher is explicit
            this.noSpeakerBtn.classList.remove('active');
        }
    }

    async processTranscriptionInBackground(forSpeaker) {
        // This function is no longer needed - moved logic to stopCurrentRecordingAndProcess
    }

    addTranscribingIndicator(speaker, questionIndex = null) {
        // Add a temporary "transcribing..." entry that will be replaced
        const timestamp = new Date().toISOString();
        const transcribingEntry = {
            speaker: speaker || 'Teacher',
            text: 'Transcribing...',
            timestamp: timestamp,
            isTranscribing: true
        };

        // Add to the correct question's data
        const targetQuestionIndex = questionIndex !== null ? questionIndex : this.sessionData.currentQuestionIndex;
        
        if (targetQuestionIndex === this.sessionData.currentQuestionIndex) {
            // Current question - add to live transcriptionData and update display
            this.transcriptionData.push(transcribingEntry);
            this.updateTranscriptionDisplay();
        } else {
            // Previous question - add to stored question data (but don't update display)
            if (this.sessionData.questions[targetQuestionIndex]) {
                if (!this.sessionData.questions[targetQuestionIndex].transcription) {
                    this.sessionData.questions[targetQuestionIndex].transcription = [];
                }
                this.sessionData.questions[targetQuestionIndex].transcription.push(transcribingEntry);
            }
        }
        
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
            
            // Add recording visual state to transcription card
            const transcriptionCard = document.querySelector('.transcription-card');
            if (transcriptionCard) {
                transcriptionCard.classList.add('recording');
            }
            
            // Update UI - hide record button, show end session button
            this.recordBtn.style.display = 'none';
            this.endSessionBtn.style.display = 'inline-flex';
            
            // Show session navigation area with next question button
            if (this.sessionNavigation) {
                this.sessionNavigation.style.display = 'block';
            }
            
            // Start timer
            this.startTimer();
            
            // Update session status
            this.updateSessionStatus();
            
            // If a speaker is already selected, start recording for them
            if (this.currentSpeaker !== null) {
                await this.startSpeakerRecording();
                console.log(`🎤 Recording started! Currently recording for: ${this.currentSpeaker || 'No Speaker'}`);
            } else {
                console.log(`🎤 Recording ready! Select a speaker to begin recording their audio.`);
            }

            const modeText = this.demoMode ? ' (No API Key)' : '';
            this.showStatus(`🎤 Recording started! Select speakers to capture their audio.${modeText}`, 'success');

            return true; // Return success

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showStatus('Error accessing microphone. Please allow microphone access.', 'error');
            return false; // Return failure
        }
    }

    async startSpeakerRecording() {
        if (!this.audioStream || !this.isRecording) {
            return;
        }

        try {
            // Determine the best supported audio format for ElevenLabs
            // Prefer WebM/Opus (widely supported and reliably playable); avoid audio/mp4
            let mimeType = 'audio/webm;codecs=opus';
            
            // Try different formats in order of reliability for STT
            const supportedTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mpeg',
                'audio/wav'
            ];
            
            for (const type of supportedTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    console.log(`🎵 Using audio format: ${mimeType}`);
                    break;
                }
            }

            // Store the detected MIME type for later use
            this.currentAudioMimeType = mimeType;

            // Create new MediaRecorder for this speaker (always fresh instance)
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: mimeType,
                audioBitsPerSecond: 128000 // Higher quality for better transcription
            });

            // Don't clear chunks here - they should already be cleared after processing

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.currentAudioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                console.log(`🛑 Recording stopped for speaker: ${this.currentSpeaker || 'Teacher'}`);
            };

            // Start recording with regular chunks
            this.mediaRecorder.start(100); // Request chunks every 100ms for better responsiveness
            console.log(`🎤 Started recording for speaker: ${this.currentSpeaker || 'Teacher'} using ${mimeType}`);

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
            // Create complete audio blob using the correct MIME type
            const mimeType = this.currentAudioMimeType || 'audio/webm';
            const audioBlob = new Blob(this.currentAudioChunks, { type: mimeType });
            console.log(`📎 Processing complete recording: ${audioBlob.size} bytes (${mimeType}) for speaker: ${this.currentSpeaker || 'Teacher'}`);

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
            console.log('⏹️ Stopping current recording and processing final transcription...');
            await this.stopCurrentRecordingAndProcess(this.currentSpeaker);
            
            // Add a small delay to ensure transcription is completed
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log('✅ Final recording stopped and processed');
        }

        // Stop main recording
        this.isRecording = false;
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
            console.log('🎤 Audio stream tracks stopped');
        }
        
        // Update UI
        this.recordBtn.style.display = 'inline-flex';
        this.endSessionBtn.style.display = 'none';
        
        // Remove recording visual state from transcription card
        const transcriptionCard = document.querySelector('.transcription-card');
        if (transcriptionCard) {
            transcriptionCard.classList.remove('recording');
        }
        
        // Stop timer
        this.stopTimer();
        
        // Save current question data to session
        if (this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...this.transcriptionData];
            this.sessionData.questions[this.sessionData.currentQuestionIndex].endTime = new Date().toISOString();
            
            const transcriptionCount = this.transcriptionData.filter(t => t.text && t.text.trim()).length;
            console.log(`💾 Saved question data with ${transcriptionCount} transcriptions`);
        }
        
        // Show next question button
        if (this.nextQuestionBtn) {
            this.nextQuestionBtn.style.display = 'inline-flex';
        }
        
        this.showStatus('🛑 Recording stopped. You can run analysis or start the next question.', 'info');
    }

    updateAnalysisPromptPlaceholders() {
        // This method is no longer needed since analysis is only done at the end
    }

    hidePostProcessingSection() {
        // This method is no longer needed since post-processing section is removed
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

    async transcribeAudio(audioBlob, speaker, targetQuestionIndex = null) {
        try {
            // Determine file extension from MIME type
            let fileExtension = 'webm';
            if (audioBlob.type.includes('wav')) fileExtension = 'wav';
            else if (audioBlob.type.includes('mp4')) fileExtension = 'mp4';
            else if (audioBlob.type.includes('mpeg')) fileExtension = 'mp3';
            else if (audioBlob.type.includes('ogg')) fileExtension = 'ogg';
            
            const formData = new FormData();
            formData.append('audio', audioBlob, `audio.${fileExtension}`);

            console.log(`🌐 Sending ${audioBlob.size} bytes (${audioBlob.type}) for transcription...`);

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success && result.text.trim()) {
                const timestamp = new Date().toISOString();
                
                // Determine which question this transcription belongs to
                const questionIndex = targetQuestionIndex !== null ? targetQuestionIndex : this.sessionData.currentQuestionIndex;
                
                // Remove any "transcribing..." entry for this speaker from the target question
                this.removeTranscribingIndicator(speaker, questionIndex);
                
                const transcriptionEntry = {
                    speaker: speaker || 'Teacher',
                    text: result.text,
                    timestamp: timestamp
                };

                // Add to the correct question's transcription data
                if (questionIndex === this.sessionData.currentQuestionIndex) {
                    // Current question - add to live transcriptionData and update display
                    this.transcriptionData.push(transcriptionEntry);
                    this.updateTranscriptionDisplay();
                    console.log(`✅ Transcribed for current question ${questionIndex + 1}: ${speaker || 'Teacher'}: "${result.text}"`);
                } else {
                    // Previous question - add directly to stored question data (don't update display)
                    if (this.sessionData.questions[questionIndex]) {
                        if (!this.sessionData.questions[questionIndex].transcription) {
                            this.sessionData.questions[questionIndex].transcription = [];
                        }
                        this.sessionData.questions[questionIndex].transcription.push(transcriptionEntry);
                        console.log(`✅ Transcribed for previous question ${questionIndex + 1}: ${speaker || 'Teacher'}: "${result.text}"`);
                    }
                }
                
                this.updateSaveButtonState(); // Update save button state after successful transcription
                
                // Show demo mode indicator if applicable
                if (result.needsApiKey) {
                    this.showDemoIndicator();
                }
                
                // Auto-save current session data
                if (this.sessionData.sessionId) {
                    this.autoSaveSession('transcription_immediate').then(success => {
                        if (success) {
                            console.log('✅ Transcription auto-saved to local storage');
                        }
                    }).catch(error => {
                        console.error('❌ Error auto-saving transcription:', error);
                    });
                }
                
            } else {
                // Remove transcribing indicator even if no text
                const questionIndex = targetQuestionIndex !== null ? targetQuestionIndex : this.sessionData.currentQuestionIndex;
                this.removeTranscribingIndicator(speaker, questionIndex);
                console.log('⚠️ No transcription text received');
            }

        } catch (error) {
            // Remove transcribing indicator on error
            const questionIndex = targetQuestionIndex !== null ? targetQuestionIndex : this.sessionData.currentQuestionIndex;
            this.removeTranscribingIndicator(speaker, questionIndex);
            console.error('Transcription error:', error);
            this.showStatus('Transcription failed. Please check your connection.', 'error');
        }
    }

    removeTranscribingIndicator(speaker, questionIndex) {
        // Remove any "transcribing..." entries for this speaker from the target question
        if (questionIndex === this.sessionData.currentQuestionIndex) {
            // Current question - remove from live transcriptionData
            this.transcriptionData = this.transcriptionData.filter(entry => 
                !(entry.isTranscribing && entry.speaker === (speaker || 'Teacher'))
            );
        } else {
            // Previous question - remove from stored question data
            if (this.sessionData.questions[questionIndex] && this.sessionData.questions[questionIndex].transcription) {
                this.sessionData.questions[questionIndex].transcription = this.sessionData.questions[questionIndex].transcription.filter(entry => 
                    !(entry.isTranscribing && entry.speaker === (speaker || 'Teacher'))
                );
            }
        }
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

        let lastSpeaker = null;
        let hasValidEntries = false;

        this.transcriptionData.forEach((entry, index) => {
            if (entry.text.trim()) {
                hasValidEntries = true;
                
                // Handle transcribing entries as centered status messages
                if (entry.isTranscribing) {
                    const transcribingDiv = document.createElement('div');
                    transcribingDiv.className = 'no-transcription transcribing-status';
                    transcribingDiv.innerHTML = `
                        <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                        ${entry.text}
                    `;
                    this.transcriptionContainer.appendChild(transcribingDiv);
                    return; // Skip regular transcript entry processing
                }
                
                // Add gap between different speakers (only for completed entries)
                if (lastSpeaker && lastSpeaker !== entry.speaker) {
                    const gapDiv = document.createElement('div');
                    gapDiv.className = 'speaker-gap';
                    gapDiv.style.height = '16px';
                    gapDiv.style.marginBottom = '8px';
                    this.transcriptionContainer.appendChild(gapDiv);
                }

                const entryDiv = document.createElement('div');
                entryDiv.className = `transcription-entry ${entry.speaker === 'Teacher' ? 'no-speaker' : ''}`;
                entryDiv.setAttribute('data-speaker', entry.speaker);
                entryDiv.style.animation = 'slideIn 0.3s ease-out';

                const speakerDiv = document.createElement('div');
                speakerDiv.className = `transcription-speaker ${entry.speaker === 'Teacher' ? 'no-speaker' : ''}`;
                speakerDiv.innerHTML = `<i class="fas fa-user"></i> ${entry.speaker}`;

                const textDiv = document.createElement('div');
                textDiv.className = 'transcription-text';
                textDiv.textContent = entry.text;

                entryDiv.appendChild(speakerDiv);
                entryDiv.appendChild(textDiv);
                this.transcriptionContainer.appendChild(entryDiv);

                lastSpeaker = entry.speaker;
            }
        });

        // Show placeholder if no valid entries
        if (!hasValidEntries) {
            this.showTranscriptionPlaceholder();
        }

        // Scroll to bottom
        this.transcriptionContainer.scrollTop = this.transcriptionContainer.scrollHeight;
    }

    showTranscriptionPlaceholder(message = 'Start recording to see transcription...') {
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'no-transcription';
        placeholderDiv.innerHTML = message;
        this.transcriptionContainer.appendChild(placeholderDiv);
    }

    showWaitingForTranscription() {
        this.transcriptionContainer.innerHTML = '';
        const waitingDiv = document.createElement('div');
        waitingDiv.className = 'no-transcription waiting-transcription';
        waitingDiv.innerHTML = `
            <div class="waiting-spinner">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="waiting-text">
                Waiting for final transcription...
            </div>
        `;
        this.transcriptionContainer.appendChild(waitingDiv);
    }

    exportToCSV() {
        if (!this.sessionData.sessionId || this.sessionData.questions.length === 0) {
            this.showStatus('No session data to export', 'error');
            return;
        }

        // Ensure current question data is saved
        if (this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...this.transcriptionData];
        }

        const headers = ['Question_Number', 'Question', 'Speaker', 'Text', 'Timestamp'];
        const csvRows = [headers.join(',')];

        this.sessionData.questions.forEach((questionData, qIndex) => {
            questionData.transcription
                .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
                .forEach(entry => {
                    csvRows.push([
                        `"${qIndex + 1}"`,
                        `"${questionData.question.replace(/"/g, '""')}"`,
                        `"${entry.speaker}"`,
                        `"${entry.text.replace(/"/g, '""')}"`,
                        `"${entry.timestamp}"`
                    ].join(','));
                });
        });

        const csvContent = csvRows.join('\n');
        this.downloadFile(csvContent, `interview-session-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
        this.showStatus('CSV file with all questions downloaded successfully!', 'success');
    }

    exportToJSON() {
        if (!this.sessionData.sessionId || this.sessionData.questions.length === 0) {
            this.showStatus('No session data to export', 'error');
            return;
        }

        // Ensure current question data is saved
        if (this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...this.transcriptionData];
            this.sessionData.questions[this.sessionData.currentQuestionIndex].analysis = this.originalAnalysisText;
        }

        const jsonData = {
            sessionId: this.sessionData.sessionId,
            sessionType: 'multi-question',
            startTime: this.sessionData.startTime,
            students: this.sessionData.students,
            totalQuestions: this.sessionData.questions.length,
            questions: this.sessionData.questions.map(q => ({
                questionId: q.questionId,
                question: q.question,
                transcription: q.transcription.filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing),
                analysis: q.analysis,
                startTime: q.startTime,
                endTime: q.endTime
            })),
            exportedAt: new Date().toISOString(),
            duration: this.calculateSessionDuration(),
            demoMode: this.demoMode
        };

        const jsonContent = JSON.stringify(jsonData, null, 2);
        this.downloadFile(jsonContent, `interview-session-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
        this.showStatus('JSON file with complete session downloaded successfully!', 'success');
    }

    async copySessionAnalysisToClipboard() {
        try {
            await navigator.clipboard.writeText(this.originalSessionAnalysisText);
            
            // Visual feedback
            const originalText = this.copySessionAnalysisBtn.innerHTML;
            this.copySessionAnalysisBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            this.copySessionAnalysisBtn.style.background = '#27ae60';
            
            setTimeout(() => {
                this.copySessionAnalysisBtn.innerHTML = originalText;
                this.copySessionAnalysisBtn.style.background = '#95a5a6';
            }, 2000);
            
            this.showStatus('Session analysis copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showStatus('Failed to copy to clipboard', 'error');
        }
    }

    downloadSessionAnalysisAsWord() {
        try {
            const analysisText = this.originalSessionAnalysisText;
            if (!analysisText) {
                this.showStatus('No session analysis content to download', 'error');
                return;
            }

            // Convert markdown to plain text for RTF
            const plainText = this.convertMarkdownToPlainText(analysisText);
            
            // Get session metadata
            const students = this.sessionData.students.join(', ');
            const date = new Date().toLocaleDateString();
            const totalQuestions = this.sessionData.questions.length;
            const duration = this.sessionDuration ? this.sessionDuration.textContent : 'N/A';
            const questions = this.sessionData.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\\par ');
            
            // Create proper RTF document with correct encoding
            const rtfContent = `{\\rtf1\\ansi\\deff0\\nouicompat{\\fonttbl{\\f0\\froman\\fprq2\\fcharset0 Times New Roman;}}
{\\*\\generator Interview Transcription App;}\\viewkind4\\uc1 
\\pard\\sa200\\sl276\\slmult1\\f0\\fs24\\lang9 
{\\b\\fs32 Complete Session Analysis Report}\\par
\\par
{\\b Session:} ${students.replace(/[{}\\]/g, '')}\\par
{\\b Date:} ${date}\\par
{\\b Total Questions:} ${totalQuestions}\\par
{\\b Session Duration:} ${duration}\\par
{\\b Questions:}\\par
${questions}\\par
\\par
{\\b Session Analysis Results:}\\par
\\par
${plainText.replace(/[{}\\]/g, '').replace(/\n/g, '\\par\n')}
\\par
\\par
{\\i Generated by Interview Transcription App}
}`;
            
            // Create filename with timestamp
            const timestamp = new Date().toISOString().split("T")[0];
            const filename = `session-analysis-${timestamp}.rtf`;
            
            // Download the file
            const blob = new Blob([rtfContent], { type: "application/rtf" });
            this.downloadFile(blob, filename, "application/rtf");
            
            // Visual feedback
            const originalText = this.downloadSessionWordBtn.innerHTML;
            this.downloadSessionWordBtn.innerHTML = '<i class="fas fa-check"></i> Downloaded!';
            this.downloadSessionWordBtn.style.background = "#27ae60";
            
            setTimeout(() => {
                this.downloadSessionWordBtn.innerHTML = originalText;
                this.downloadSessionWordBtn.style.background = "#2b579a";
            }, 2000);
            
            this.showStatus("Session analysis RTF document downloaded successfully!", "success");
        } catch (error) {
            console.error('Failed to download RTF document:', error);
            this.showStatus('Failed to download RTF document', 'error');
        }
    }

    generateSessionDOCXDocument(text) {
        // Get interview context
        const questions = this.sessionData.questions.map((q, i) => `${i + 1}. ${q.question}`).join('<br>');
        const students = this.sessionData.students.join(', ');
        const timestamp = new Date().toLocaleDateString();
        const duration = this.sessionDuration ? this.sessionDuration.textContent : 'N/A';
        
        // Convert markdown to HTML for Word
        const htmlContent = this.convertMarkdownToHtml(text);
        
        // Create DOCX-compatible HTML structure with UTF-8 encoding
        const docxHtml = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <meta name="ProgId" content="Word.Document">
    <meta name="Generator" content="Interview Transcription App">
    <meta name="Originator" content="Interview Transcription App">
    <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
        h1 { font-size: 18pt; font-weight: bold; margin-top: 24pt; margin-bottom: 12pt; }
        h2 { font-size: 16pt; font-weight: bold; margin-top: 20pt; margin-bottom: 10pt; }
        h3 { font-size: 14pt; font-weight: bold; margin-top: 16pt; margin-bottom: 8pt; }
        p { margin-bottom: 12pt; }
        ul { margin: 12pt 0; padding-left: 24pt; }
        li { margin-bottom: 6pt; }
        .header { text-align: center; border-bottom: 2pt solid black; padding-bottom: 12pt; margin-bottom: 24pt; }
        .meta-info { margin-bottom: 20pt; }
        .meta-info p { margin-bottom: 6pt; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Complete Session Analysis Report</h1>
    </div>
    
    <div class="meta-info">
        <p><strong>Date:</strong> ${timestamp}</p>
        <p><strong>Session Duration:</strong> ${duration}</p>
        <p><strong>Students:</strong> ${students}</p>
        <p><strong>Total Questions:</strong> ${this.sessionData.questions.length}</p>
        <p><strong>Questions:</strong></p>
        <p>${questions}</p>
    </div>
    
    <h2>Session Analysis Results</h2>
    <div class="analysis-content">
        ${htmlContent}
    </div>
    
    <p style="margin-top: 40pt; font-style: italic; color: #666; text-align: center;">
        Generated by Interview Transcription App
    </p>
</body>
</html>`;

        // Convert HTML to DOCX format (this creates a .docx compatible file)
        const blob = new Blob(['\ufeff', docxHtml], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        return blob;
    }

    downloadFile(content, filename, mimeType) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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

    calculateSessionDuration() {
        if (this.sessionData.startTime) {
            const startTime = new Date(this.sessionData.startTime);
            const endTime = new Date(this.sessionData.endTime || new Date());
            const durationMs = endTime - startTime;
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return '00:00';
    }

    updateSaveButtonState() {
        // Method no longer needed since Save Session button is removed
        // Auto-save handles all saving automatically
    }

    generateInterviewId() {
        return 'interview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateQuestionId() {
        return 'question_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

    saveInterviewToHistory() {
        if (!this.sessionData.sessionId || this.sessionData.questions.length === 0) {
            this.showStatus('No session data to save', 'error');
            return;
        }

        try {
            // Use the enhanced session preparation method
            const sessionRecord = this.prepareSessionForSaving();
            sessionRecord.manualSave = true;
            sessionRecord.autoSaved = false; // This is a manual save
            sessionRecord.saveTriger = 'manual_save'; // Note: keeping the typo for consistency

            const savedInterviews = this.getSavedInterviews();
            
            // Remove any existing auto-save of this session and replace with manual save
            const existingIndex = savedInterviews.findIndex(s => s.id === this.sessionData.sessionId);
            if (existingIndex !== -1) {
                savedInterviews[existingIndex] = sessionRecord;
            } else {
                savedInterviews.push(sessionRecord);
            }
            
            localStorage.setItem('interviewHistory', JSON.stringify(savedInterviews));
            
            this.sessionData.lastSaved = new Date().toISOString();
            
            this.showStatus(`Session with ${this.sessionData.questions.length} questions saved to history!`, 'success');
            console.log('✅ Session manually saved to local storage:', sessionRecord.id);

        } catch (error) {
            console.error('❌ Error saving session:', error);
            this.showStatus('Failed to save session. Storage may be full.', 'error');
        }
    }

    prepareSessionForSaving() {
        // Ensure current question data is saved to session
        if (this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...this.transcriptionData];
            if (!this.sessionData.questions[this.sessionData.currentQuestionIndex].endTime && this.sessionData.state === "ended") {
                this.sessionData.questions[this.sessionData.currentQuestionIndex].endTime = new Date().toISOString();
            }
        }

        return {
            id: this.sessionData.sessionId,
            sessionType: "multi-question",
            questions: this.sessionData.questions.map(q => q.question),
            students: this.sessionData.students,
            fullSessionData: { ...this.sessionData },
            timestamp: this.sessionData.startTime,
            savedAt: new Date().toISOString(),
            totalQuestions: this.sessionData.questions.length,
            duration: this.calculateSessionDuration(),
            state: this.sessionData.state,
            metadata: { ...this.sessionData.metadata },
            analysisAvailable: this.sessionData.state === "analyzed",
            // Support both array and legacy single analysis
            analyses: this.sessionData.analyses || [],
            latestAnalysis: this.sessionData.latestAnalysis || null,
            analysis: this.sessionData.analysis || null // Keep for backward compatibility
        };
    }

    resetInterview() {
        // Stop recording if active
        if (this.isRecording) {
            this.endSession();
        }

        // Reset all data including session data
        this.transcriptionData = [];
        this.currentSpeaker = null;
        this.students = [];
        this.currentAudioChunks = [];
        
        // Reset session data
        this.sessionData = {
            sessionId: null,
            questions: [],
            currentQuestionIndex: 0,
            students: [],
            startTime: null,
            state: 'setup'
        };

        // Reset UI sections
        this.setupSection.style.display = 'block';
        this.interviewSection.style.display = 'none';
        
        // Hide session completion section properly
        if (this.sessionCompletionSection) {
            this.sessionCompletionSection.style.display = 'none';
            this.sessionCompletionSection.classList.remove('show');
        }
        
        // Hide session-related UI elements
        if (this.sessionInfo) {
            this.sessionInfo.style.display = 'none';
        }
        if (this.sessionProgressDisplay) {
            this.sessionProgressDisplay.style.display = 'none';
        }
        if (this.sessionStatus) {
            this.sessionStatus.style.display = 'none';
        }
        if (this.sessionNavigation) {
            this.sessionNavigation.style.display = 'none';
        }
        if (this.exportCSVBtn) {
            this.exportCSVBtn.style.display = 'none';
        }
        if (this.exportJSONBtn) {
            this.exportJSONBtn.style.display = 'none';
        }
        
        // Reset to single question input
        this.questionsContainer.innerHTML = `
            <div class="question-input-group">
                <div class="question-header">
                    <span class="question-number">Question 1</span>
                    <button type="button" class="remove-question-btn" onclick="app.removeQuestionInput(0)" style="display: none;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <textarea class="question-input" placeholder="Enter your first interview question here..." rows="2"></textarea>
            </div>
        `;
        this.updateQuestionInputs();
        
        // Clear student inputs
        this.studentInputs.forEach(input => input.value = '');
        
        // Reset transcription display
        this.transcriptionContainer.innerHTML = '<p class="no-transcription">Transcription will appear here when recording starts...</p>';
        
        // Reset speaker selection UI
        document.querySelectorAll('.student-box').forEach(box => {
            box.classList.remove('active');
        });
        this.noSpeakerBtn.classList.add('active');
        
        // Reset button states
        this.recordBtn.style.display = 'inline-flex';
        this.endSessionBtn.style.display = 'none';
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
        
        // Reset session analysis results
        if (this.sessionAnalysisResults) {
            this.sessionAnalysisResults.style.display = 'none';
            this.sessionAnalysisContent.innerHTML = '';
            this.sessionAnalysisStatus.innerHTML = '';
            this.sessionAnalysisStatus.className = 'analysis-status';
        }
        
        // Clear any status messages
        this.statusMessage.classList.remove('show');
        
        this.showStatus('Session reset. Ready for new interview setup.', 'info');
        this.updateSaveButtonState();
    }

    // Auto-Save Methods
    async autoSaveSession(trigger = 'manual') {
        if (!this.sessionData.autoSaveEnabled || !this.sessionData.sessionId) {
            console.log(`⚠️ Auto-save skipped: enabled=${this.sessionData.autoSaveEnabled}, sessionId=${!!this.sessionData.sessionId}`);
            return false;
        }

        try {
            console.log(`💾 Auto-saving session (trigger: ${trigger})`);
            
            // Update metadata before saving
            this.calculateSessionMetadata();
            
            // Prepare session data for saving
            const sessionRecord = this.prepareSessionForSaving();
            sessionRecord.autoSaved = true;
            sessionRecord.saveTriger = trigger;
            sessionRecord.lastAutoSave = new Date().toISOString();
            
            // Save to localStorage (non-blocking)
            const savedInterviews = this.getSavedInterviews();
            
            // Remove any existing auto-save of this session
            const existingIndex = savedInterviews.findIndex(s => s.id === this.sessionData.sessionId);
            if (existingIndex !== -1) {
                savedInterviews[existingIndex] = sessionRecord;
                console.log(`📝 Updated existing auto-save for session ${this.sessionData.sessionId}`);
            } else {
                savedInterviews.push(sessionRecord);
                console.log(`➕ Created new auto-save for session ${this.sessionData.sessionId}`);
            }
            
            // Write to localStorage
            localStorage.setItem('interviewHistory', JSON.stringify(savedInterviews));
            
            // Verify the save
            const verifyData = JSON.parse(localStorage.getItem('interviewHistory') || '[]');
            const savedSession = verifyData.find(s => s.id === this.sessionData.sessionId);
            if (!savedSession) {
                console.error('❌ Verification failed: Session not found in localStorage after save');
                return false;
            }
            
            // Update session tracking
            this.sessionData.lastSaved = new Date().toISOString();
            
            // Show visible save indicator
            this.showAutoSaveIndicator();
            
            console.log(`✅ Session auto-saved successfully (${trigger}) - ${savedInterviews.length} total sessions in storage`);
            return true;
            
        } catch (error) {
            console.error('❌ Auto-save failed:', error);
            // Show error to user for critical auto-save failures
            if (trigger === 'session_end' || trigger === 'recording_start') {
                this.showStatus('⚠️ Auto-save failed - please manually save your session', 'error');
            }
            return false;
        }
    }

    calculateSessionMetadata() {
        if (!this.sessionData.sessionId) return;

        const metadata = this.sessionData.metadata;
        
        // Calculate total transcriptions
        metadata.totalTranscriptions = this.sessionData.questions.reduce((total, q) => {
            return total + (q.transcription ? q.transcription.filter(t => t.text && t.text.trim()).length : 0);
        }, 0);

        // Calculate average question duration
        const completedQuestions = this.sessionData.questions.filter(q => q.startTime && q.endTime);
        if (completedQuestions.length > 0) {
            const totalDuration = completedQuestions.reduce((total, q) => {
                return total + (new Date(q.endTime) - new Date(q.startTime));
            }, 0);
            metadata.averageQuestionDuration = Math.round(totalDuration / completedQuestions.length / 1000); // in seconds
        }

        // Find most active student
        const studentActivity = {};
        this.sessionData.students.forEach(student => {
            studentActivity[student] = 0;
        });

        this.sessionData.questions.forEach(q => {
            if (q.transcription) {
                q.transcription.forEach(t => {
                    if (t.speaker && t.text && studentActivity.hasOwnProperty(t.speaker)) {
                        studentActivity[t.speaker] += t.text.length;
                    }
                });
            }
        });

        const mostActiveStudent = Object.keys(studentActivity).reduce((a, b) => 
            studentActivity[a] > studentActivity[b] ? a : b
        );
        metadata.mostActiveStudent = mostActiveStudent;

        // Calculate session quality
        const questionsWithTranscription = this.sessionData.questions.filter(q => 
            q.transcription && q.transcription.length > 0
        ).length;
        
        if (questionsWithTranscription === this.sessionData.questions.length) {
            metadata.sessionQuality = 'good';
        } else if (questionsWithTranscription > this.sessionData.questions.length / 2) {
            metadata.sessionQuality = 'partial';
        } else {
            metadata.sessionQuality = 'incomplete';
        }

        // Calculate total recording time
        if (this.sessionData.startTime) {
            const endTime = this.sessionData.endTime || new Date().toISOString();
            metadata.totalRecordingTime = Math.round((new Date(endTime) - new Date(this.sessionData.startTime)) / 1000);
        }

        // Update questions completed
        metadata.questionsCompleted = this.sessionData.currentQuestionIndex + (this.sessionData.state === 'ended' ? 1 : 0);

        // Estimate transcription accuracy based on response lengths
        const avgResponseLength = metadata.totalTranscriptions > 0 ? 
            this.sessionData.questions.reduce((total, q) => {
                return total + (q.transcription ? q.transcription.reduce((qtotal, t) => qtotal + (t.text?.length || 0), 0) : 0);
            }, 0) / metadata.totalTranscriptions : 0;

        if (avgResponseLength > 50) {
            metadata.transcriptionAccuracy = 'high';
        } else if (avgResponseLength > 20) {
            metadata.transcriptionAccuracy = 'medium';
        } else {
            metadata.transcriptionAccuracy = 'low';
        }
    }

    showAutoSaveIndicator() {
        // Create or update auto-save indicator
        let indicator = document.getElementById('autoSaveIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoSaveIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: linear-gradient(135deg, #67e8f9, #7dd3fc);
                color: white;
                padding: 12px 20px;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 600;
                z-index: 1000;
                opacity: 0;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 20px rgba(125, 211, 252, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.2);
            `;
            document.body.appendChild(indicator);
        }

        const currentTime = new Date().toLocaleTimeString();
        indicator.innerHTML = `
            <i class="fas fa-cloud-upload-alt"></i> 
            Auto-saved at ${currentTime}
        `;
        indicator.style.opacity = '1';

        // Fade out after 3 seconds instead of 2
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 3000);
    }

    updateSessionInfo() {
        if (this.sessionInfo) {
            this.sessionInfo.style.display = 'block';
        }
        if (this.sessionProgressDisplay) {
            this.sessionProgressDisplay.style.display = 'block';
        }
        if (this.currentQuestionDisplay) {
            this.currentQuestionDisplay.textContent = `Question ${this.sessionData.currentQuestionIndex + 1}`;
        }
        if (this.totalQuestionsDisplay) {
            this.totalQuestionsDisplay.textContent = `of ${this.sessionData.questions.length}`;
        }
        if (this.progressFill) {
            const progress = ((this.sessionData.currentQuestionIndex + 1) / this.sessionData.questions.length) * 100;
            this.progressFill.style.width = `${progress}%`;
        }
    }

    updateSessionStatus() {
        if (!this.sessionStatus) return;
        
        this.sessionStatus.style.display = 'block';
        const indicator = this.sessionStatus.querySelector('.status-indicator');
        
        // Remove all state classes
        indicator.classList.remove('setup', 'active', 'ended', 'analyzed');
        
        switch (this.sessionData.state) {
            case 'setup':
                indicator.classList.add('setup');
                this.sessionStatusText.textContent = 'Session Setup';
                break;
            case 'active':
                indicator.classList.add('active');
                let statusText = this.isRecording ? 'Recording Active' : 'Session Active';
                if (this.sessionData.lastSaved) {
                    const savedTime = new Date(this.sessionData.lastSaved);
                    const timeDiff = Math.floor((Date.now() - savedTime.getTime()) / 1000);
                    if (timeDiff < 60) {
                        statusText += ' • Auto-saved';
                    } else if (timeDiff < 300) { // 5 minutes
                        statusText += ` • Saved ${Math.floor(timeDiff / 60)}m ago`;
                    }
                }
                this.sessionStatusText.textContent = statusText;
                break;
            case 'ended':
                indicator.classList.add('ended');
                this.sessionStatusText.textContent = 'Session Ended - Ready for Analysis';
                break;
            case 'analyzed':
                indicator.classList.add('analyzed');
                this.sessionStatusText.textContent = 'Session Analyzed';
                break;
        }
    }

    checkForIncompleteSession() {
        const savedInterviews = this.getSavedInterviews();
        const incompleteSession = savedInterviews.find(s => 
            s.autoSaved && (s.state === 'active' || s.state === 'setup') && 
            s.savedAt && (Date.now() - new Date(s.savedAt).getTime()) < 24 * 60 * 60 * 1000 // Within 24 hours
        );

        if (incompleteSession) {
            console.log('🔄 Found incomplete session from previous session');
            this.showRecoveryOption(incompleteSession);
        }
    }

    showRecoveryOption(incompleteSession) {
        const recoveryDiv = document.createElement('div');
        recoveryDiv.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: white;
            border: 2px solid #f39c12;
            border-radius: 12px;
            padding: 20px;
            max-width: 300px;
            z-index: 2000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;
        
        recoveryDiv.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #f39c12;">
                <i class="fas fa-exclamation-triangle"></i> Incomplete Session Found
            </h4>
            <p style="margin: 0 0 15px 0; font-size: 14px; color: #4a5568;">
                Found an incomplete session from ${new Date(incompleteSession.savedAt).toLocaleDateString()}. 
                Would you like to recover it?
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="recoverBtn" style="flex: 1; padding: 8px; background: #f39c12; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Recover
                </button>
                <button id="discardBtn" style="flex: 1; padding: 8px; background: #e53e3e; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Discard
                </button>
            </div>
        `;

        document.body.appendChild(recoveryDiv);

        // Add event listeners
        document.getElementById('recoverBtn').addEventListener('click', () => {
            this.recoverSession(incompleteSession);
            recoveryDiv.remove();
        });

        document.getElementById('discardBtn').addEventListener('click', () => {
            this.discardIncompleteSession(incompleteSession.id);
            recoveryDiv.remove();
        });

        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (recoveryDiv.parentNode) {
                recoveryDiv.remove();
            }
        }, 30000);
    }

    recoverSession(sessionData) {
        console.log('🔄 Recovering incomplete session:', sessionData.id);
        
        // Restore session data
        this.sessionData = { ...sessionData.fullSessionData };
        this.students = this.sessionData.students;
        
        // Update UI based on session state
        if (this.sessionData.state === 'active') {
            // Restore active session
            this.setupSection.style.display = 'none';
            this.interviewSection.style.display = 'block';
            this.sessionProgressDisplay.style.display = 'block';
            
            // Restore current question
            const currentQuestion = this.sessionData.questions[this.sessionData.currentQuestionIndex];
            if (currentQuestion) {
                this.displayQuestion.textContent = currentQuestion.question;
                this.transcriptionData = currentQuestion.transcription || [];
                this.updateTranscriptionDisplay();
            }
            
            // Restore student boxes
            this.generateStudentBoxes();
            this.updateSessionInfo();
            this.updateSessionStatus();
            
            this.showStatus('Session recovered! You can continue where you left off.', 'success');
        }
        
        // Auto-save the recovery
        setTimeout(() => this.autoSaveSession('recovery'), 1000);
    }

    discardIncompleteSession(sessionId) {
        const savedInterviews = this.getSavedInterviews();
        const updatedInterviews = savedInterviews.filter(s => s.id !== sessionId);
        localStorage.setItem('interviewHistory', JSON.stringify(updatedInterviews));
        console.log('🗑️ Discarded incomplete session:', sessionId);
    }

    async endSession() {
        if (this.sessionData.state !== 'active') {
            console.log('⚠️ Session is not active, cannot end');
            return;
        }

        let loadingOverlay = null;
        
        try {
            // Create loading overlay
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Finalizing transcriptions...</div>
                    <div class="loading-progress">
                        <div class="loading-bar"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(loadingOverlay);

            console.log('🛑 Ending session...');

            // Update UI immediately to prevent user interaction
            if (this.recordBtn) this.recordBtn.style.display = 'none';
            if (this.endSessionBtn) this.endSessionBtn.style.display = 'inline-flex';
            
            // Remove recording class from transcription card
            const transcriptionCard = document.querySelector('.transcription-card');
            if (transcriptionCard) {
                transcriptionCard.classList.remove('recording');
            }
            
            // Hide session navigation
            if (this.sessionNavigation) {
                this.sessionNavigation.style.display = 'none';
            }
            
            // Stop timer
            this.stopTimer();

            // Process final transcription if recording is active
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                loadingOverlay.querySelector('.loading-text').textContent = 'Processing final transcription...';
                loadingOverlay.querySelector('.loading-bar').style.width = '25%';
                
                // Store the initial transcription count to detect when new transcription arrives
                const initialTranscriptionCount = this.sessionData.questions[this.sessionData.currentQuestionIndex]?.transcription?.length || 0;
                const initialDisplayCount = this.transcriptionData.filter(entry => !entry.isTranscribing).length;
                
                console.log(`📊 Initial counts: stored=${initialTranscriptionCount}, display=${initialDisplayCount}`);
                
                await this.stopCurrentRecordingAndProcess(this.currentSpeaker);
                
                // Show waiting message in transcription container with spinner
                this.showWaitingForTranscription();
                
                loadingOverlay.querySelector('.loading-text').textContent = 'Waiting for final transcription...';
                loadingOverlay.querySelector('.loading-bar').style.width = '40%';
                
                // Actively wait for the final transcription to be processed and stored
                let waitTime = 0;
                const maxWaitTime = 10000; // Maximum 10 seconds
                const checkInterval = 500; // Check every 500ms
                let finalTranscriptionDetected = false;
                
                while (waitTime < maxWaitTime) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    waitTime += checkInterval;
                    
                    const currentStoredCount = this.sessionData.questions[this.sessionData.currentQuestionIndex]?.transcription?.length || 0;
                    const currentDisplayCount = this.transcriptionData.filter(entry => !entry.isTranscribing).length;
                    
                    console.log(`⏱️ Wait ${waitTime}ms: stored=${currentStoredCount}, display=${currentDisplayCount}`);
                    
                    // Check if we have new transcription data
                    if (currentStoredCount > initialTranscriptionCount || currentDisplayCount > initialDisplayCount) {
                        console.log(`✅ Final transcription detected after ${waitTime}ms`);
                        finalTranscriptionDetected = true;
                        break;
                    }
                    
                    // Update progress bar
                    const progress = 40 + (waitTime / maxWaitTime) * 10; // 40-50%
                    loadingOverlay.querySelector('.loading-bar').style.width = `${progress}%`;
                }
                
                // If we didn't detect new transcription, wait a bit longer just in case
                if (!finalTranscriptionDetected) {
                    console.log('⚠️ No new transcription detected, waiting additional 2 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                loadingOverlay.querySelector('.loading-text').textContent = 'Finalizing transcription data...';
                loadingOverlay.querySelector('.loading-bar').style.width = '50%';
                
                // IMPORTANT: Sync final transcriptions back to current display
                if (this.sessionData.questions[this.sessionData.currentQuestionIndex] && 
                    this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription) {
                    
                    // Get the stored transcription data (includes background processed final transcription)
                    const storedTranscription = this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription;
                    const finalTranscriptions = storedTranscription.filter(entry => !entry.isTranscribing);
                    
                    // Update the current display transcription data to include all stored transcriptions
                    this.transcriptionData = [...finalTranscriptions];
                    
                    // Also update the stored question data to ensure consistency
                    this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...finalTranscriptions];
                    
                    console.log(`🔄 Synced ${this.transcriptionData.length} transcriptions to current display for completion screen`);
                    console.log(`📝 Final transcriptions:`, this.transcriptionData.map(t => `${t.speaker}: ${t.text.substring(0, 50)}...`));
                    
                    // Force update the transcription display
                    this.updateTranscriptionDisplay();
                } else {
                    console.log(`⚠️ No stored transcription data found for current question`);
                }
            }

            // Update session state
            this.sessionData.state = 'ended';
            this.sessionData.endTime = new Date().toISOString();

            loadingOverlay.querySelector('.loading-text').textContent = 'Saving to local storage...';
            loadingOverlay.querySelector('.loading-bar').style.width = '90%';

            // Auto-save session
            await this.autoSaveSession('session_end');

            loadingOverlay.querySelector('.loading-text').textContent = 'Setting up completion screen...';
            loadingOverlay.querySelector('.loading-bar').style.width = '100%';

            // Setup completion screen
            await this.setupSessionCompletion();
            
            // Hide interview section and show completion section
            if (this.interviewSection) {
                this.interviewSection.style.display = 'none';
            }
            
            if (this.sessionCompletionSection) {
                this.sessionCompletionSection.style.display = 'block';
                this.sessionCompletionSection.classList.add('show');
                
                // Scroll to completion section
                setTimeout(() => {
                    this.sessionCompletionSection.scrollIntoView({ behavior: 'smooth' });
                }, 100);

                // Load transcript editor with full transcript text
                this.loadTranscriptEditor();
                // Load any previously saved current transcript
                const id = this.sessionData?.sessionId;
                if (id && this.transcriptEditor) {
                    const currentKey = `transcript_current_${id}`;
                    const draftKey = `transcript_draft_${id}`;
                    const saved = localStorage.getItem(currentKey);
                    const draft = localStorage.getItem(draftKey);
                    if (saved) this.transcriptEditor.value = saved;
                    else if (draft) this.transcriptEditor.value = draft;
                }
            }

            // Show export buttons
            if (this.exportCSVBtn) this.exportCSVBtn.style.display = 'inline-flex';
            if (this.exportJSONBtn) this.exportJSONBtn.style.display = 'inline-flex';

            console.log('✅ Session ended successfully');
            
        } catch (error) {
            console.error('❌ Error ending session:', error);
            this.showStatus('Error ending session. Please try again.', 'error');
            
            // Restore UI state on error
            if (this.recordBtn) this.recordBtn.style.display = 'inline-flex';
            if (this.endSessionBtn) this.endSessionBtn.style.display = 'none';
            
            // Stop any remaining audio tracks
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }
            
        } finally {
            // Remove loading overlay
            if (loadingOverlay && loadingOverlay.parentNode) {
                document.body.removeChild(loadingOverlay);
            }
        }
    }

    async startNextQuestion() {
        if (this.sessionData.state !== 'active') {
            console.log('⚠️ Session is not active, cannot start next question');
            return;
        }

        console.log('➡️ Starting next question...');

        // Process final transcription for current question and WAIT to avoid race conditions
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            console.log('🔄 Processing final transcription before moving to next question...');
            const previousQuestionIndex = this.sessionData.currentQuestionIndex;
            await this.stopCurrentRecordingAndProcess(this.currentSpeaker, previousQuestionIndex);
            console.log(`✅ Transcription completed for previous question ${previousQuestionIndex + 1}`);
        }

        // Save current question data immediately (filter out any pending transcriptions)
        if (this.sessionData.questions[this.sessionData.currentQuestionIndex]) {
            // Save current state - background transcription will be added when it completes
            const currentTranscription = this.transcriptionData.filter(entry => !entry.isTranscribing);
            this.sessionData.questions[this.sessionData.currentQuestionIndex].transcription = [...currentTranscription];
            this.sessionData.questions[this.sessionData.currentQuestionIndex].endTime = new Date().toISOString();
            
            console.log(`💾 Question ${this.sessionData.currentQuestionIndex + 1} data saved with ${currentTranscription.length} transcriptions`);
        }

        // Move to next question
        this.sessionData.currentQuestionIndex++;
        
        // Check if we've reached the maximum of 6 questions
        if (this.sessionData.currentQuestionIndex >= 6) {
            console.log('📝 Maximum of 6 questions reached, must end session...');
            this.showStatus('Maximum of 6 questions reached. Please end the session.', 'info');
            await this.endSession();
            return;
        }

        // Check if we need to create a new question (flexible questioning)
        if (this.sessionData.currentQuestionIndex >= this.sessionData.questions.length) {
            console.log(`🆕 Creating new flexible question ${this.sessionData.currentQuestionIndex + 1}`);
            
            // Create a new flexible question
            const newQuestion = {
                id: this.generateQuestionId(),
                question: `Question ${this.sessionData.currentQuestionIndex + 1}`,
                transcription: [],
                startTime: new Date().toISOString(),
                endTime: null,
                isFlexible: true // Mark as flexible/unplanned
            };
            
            this.sessionData.questions.push(newQuestion);
            console.log(`✅ Added flexible question ${this.sessionData.currentQuestionIndex + 1}`);
        }

        // Get current question and update UI immediately
        const currentQuestion = this.sessionData.questions[this.sessionData.currentQuestionIndex];
        if (!currentQuestion.startTime) {
            currentQuestion.startTime = new Date().toISOString();
        }

        // IMPORTANT: Clear transcription display for new question - this prevents carryover
        this.transcriptionData = [];
        console.log('🧹 Cleared transcriptionData for new question to prevent carryover');
        
        // Clear any remaining audio chunks to prevent carryover
        this.currentAudioChunks = [];
        console.log('🧹 Cleared currentAudioChunks for new question to prevent audio carryover');
        
        // Update UI instantly - show placeholder for flexible questions
        if (currentQuestion.isFlexible) {
            this.displayQuestion.innerHTML = `
                <span class="flexible-question-indicator">
                    <i class="fas fa-edit"></i> Question ${this.sessionData.currentQuestionIndex + 1} 
                    <small>(Click to edit question)</small>
                </span>
            `;
            this.displayQuestion.style.cursor = 'pointer';
            this.displayQuestion.onclick = () => this.editFlexibleQuestion();
        } else {
            this.displayQuestion.textContent = currentQuestion.question;
            this.displayQuestion.style.cursor = 'default';
            this.displayQuestion.onclick = null;
        }
        
        // Update transcription display to show empty state
        this.updateTranscriptionDisplay();
        this.updateSessionInfo();

        // Reset speaker selection
        this.currentSpeaker = null;
        this.updateSpeakerUI(null);
        
        // Scroll to top to keep focus on interview controls
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('📜 Scrolled to top for next question focus');

        // Auto-save progress in background (don't wait)
        this.autoSaveSession('question_transition').then(success => {
            if (success) {
                console.log('✅ Session auto-saved after question transition');
            }
        });

        console.log(`➡️ Moved to question ${this.sessionData.currentQuestionIndex + 1}`);

        // Immediately switch back to Teacher and resume recording for the new question
        try {
            if (this.isRecording) {
                // Main stream is active; just start a new recorder for Teacher
                await this.selectSpeaker('Teacher');
            } else {
                // Main stream stopped; start it and auto-record for Teacher
                this.currentSpeaker = 'Teacher';
                this.updateSpeakerUI('Teacher');
                await this.startMainRecording();
            }
            console.log('🎙️ Recording ready for next question as Teacher');
        } catch (err) {
            console.error('❌ Failed to start recording for next question:', err);
        }
    }

    async saveCurrentQuestionToServer() { /* no-op: using localStorage only */ }

    editFlexibleQuestion() {
        const currentQuestion = this.sessionData.questions[this.sessionData.currentQuestionIndex];
        if (!currentQuestion.isFlexible) return;

        const newQuestion = prompt(`Enter Question ${this.sessionData.currentQuestionIndex + 1}:`, currentQuestion.question);
        if (newQuestion && newQuestion.trim()) {
            currentQuestion.question = newQuestion.trim();
            currentQuestion.isFlexible = false; // No longer flexible once edited
            
            // Update display
            this.displayQuestion.textContent = currentQuestion.question;
            this.displayQuestion.style.cursor = 'default';
            this.displayQuestion.onclick = null;
            
            // Auto-save the change
            this.autoSaveSession('question_edit');
            
            console.log(`✅ Updated question ${this.sessionData.currentQuestionIndex + 1}: ${currentQuestion.question}`);
        }
    }

    async setupSessionCompletion() {
        console.log('🎯 Setting up session completion...');
        
        this.calculateSessionMetadata();
        
        // Update session summary
        const totalQuestions = this.sessionData.questions.length;
        const totalStudents = this.sessionData.students.length;
        const metadata = this.sessionData.metadata;
        const completedQuestions = this.sessionData.questions.filter(q => q.transcription && q.transcription.length > 0).length;
        
        let summaryText = `${completedQuestions} of ${totalQuestions} question${totalQuestions !== 1 ? 's' : ''} completed`;
        summaryText += ` with ${totalStudents} student${totalStudents !== 1 ? 's' : ''}`;
        
        if (metadata.totalTranscriptions > 0) {
            summaryText += ` • ${metadata.totalTranscriptions} total responses`;
        }
        if (metadata.mostActiveStudent) {
            summaryText += ` • Most active: ${metadata.mostActiveStudent}`;
        }
        if (metadata.averageQuestionDuration) {
            const avgMins = Math.floor(metadata.averageQuestionDuration / 60);
            const avgSecs = metadata.averageQuestionDuration % 60;
            summaryText += ` • Avg. time: ${avgMins}:${avgSecs.toString().padStart(2, '0')}`;
        }
        
        if (this.sessionSummaryText) {
            this.sessionSummaryText.textContent = summaryText;
        }

        // Update session duration
        if (this.sessionDuration) {
            const duration = this.calculateSessionDuration();
            this.sessionDuration.textContent = duration;
        }

        // Setup questions review
        await this.setupQuestionsReview();
        
        // Setup analysis prompt
        await this.setupSessionAnalysisPrompt();
        
        console.log('✅ Session completion setup complete');
    }

    setupQuestionsReview() {
        console.log('📋 Setting up questions review...');
        
        if (!this.questionsReview) {
            console.error('❌ Questions review element not found');
            return;
        }

        // Filter out any isTranscribing entries from all questions
        this.sessionData.questions.forEach((question, index) => {
            if (question.transcription) {
                question.transcription = question.transcription.filter(entry => !entry.isTranscribing);
            }
            
            // For the current question, ensure we have the most up-to-date transcription data
            if (index === this.sessionData.currentQuestionIndex && this.transcriptionData.length > 0) {
                const currentTranscription = this.transcriptionData.filter(entry => !entry.isTranscribing);
                // Always use the longer transcription list to ensure we have all entries
                if (currentTranscription.length >= (question.transcription?.length || 0)) {
                    question.transcription = [...currentTranscription];
                    console.log(`🔄 Updated current question transcription with ${currentTranscription.length} entries`);
                } else if (question.transcription && question.transcription.length > currentTranscription.length) {
                    // If stored transcription is longer, update display data
                    this.transcriptionData = [...question.transcription];
                    console.log(`🔄 Updated display with ${question.transcription.length} entries from storage`);
                }
            }
        });

        // Create question cards matching the history page layout
        this.questionsReview.innerHTML = `
            <div class="question-transcripts">
                ${this.sessionData.questions.map((question, index) => `
                    <div class="question-transcript-card">
                        <div class="question-transcript-header">
                            <div class="question-info">
                                <h4><i class="fas fa-question-circle"></i> Question ${index + 1}</h4>
                                <div class="question-text-display" id="questionTextDisplay-session-${index}">
                                    ${question.question || `Question ${index + 1}`}
                                </div>
                                <textarea 
                                    class="question-text-edit" 
                                    id="questionTextEdit-session-${index}"
                                    style="display: none;"
                                    rows="2"
                                    placeholder="Enter question text..."
                                >${question.question || `Question ${index + 1}`}</textarea>
                            </div>
                            <div class="question-header-buttons">
                                <button class="btn btn-outline btn-sm" onclick="app.toggleQuestionEdit(${index})">
                                    <i class="fas fa-pen"></i> Edit Question
                                </button>
                                <button class="btn btn-outline btn-sm" onclick="app.toggleQuestionTranscriptEdit(${index})">
                                    <i class="fas fa-pen"></i> Edit Transcript
                                </button>
                            </div>
                        </div>
                        
                        <div class="question-transcript-display" id="questionTranscriptDisplay-session-${index}">
                            ${this.formatQuestionTranscription(question.transcription || [])}
                        </div>
                        
                        <textarea 
                            id="questionTranscriptEditor-session-${index}" 
                            class="question-transcript-textarea"
                            rows="8" 
                            placeholder="Edit transcript for Question ${index + 1}..." 
                            style="display:none;"
                        >${this.buildQuestionTranscriptText(question)}</textarea>
                        
                        <div class="question-transcript-actions" id="questionTranscriptActions-session-${index}" style="display:none;">
                            <button class="btn btn-primary" onclick="app.saveQuestionTranscript(${index})">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <button class="btn btn-outline" onclick="app.cancelQuestionTranscriptEdit(${index})">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // No event listeners needed since we use onclick for edit buttons

        // Force update the transcription display to ensure latest data is shown
        this.updateTranscriptionDisplay();

        console.log('✅ Questions review setup complete');
    }

    editQuestion(questionIndex) {
        const question = this.sessionData.questions[questionIndex];
        if (!question) return;

        const newQuestionText = prompt(`Edit Question ${questionIndex + 1}:`, question.question || `Question ${questionIndex + 1}`);
        if (newQuestionText && newQuestionText.trim()) {
            question.question = newQuestionText.trim();
            console.log(`✅ Updated question ${questionIndex + 1}: ${newQuestionText}`);
            
            // Auto-save the change
            this.autoSaveSession('question_edit');
            
            // Refresh the questions review display
            this.setupQuestionsReview();
        }
    }

    formatQuestionTranscription(transcription) {
        if (!transcription || transcription.length === 0) {
            return '<p class="no-data">No transcription data available for this question.</p>';
        }
        
        const filteredTranscription = transcription.filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing);
        let lastSpeaker = null;
        
        return filteredTranscription
            .map((entry, index) => {
                let html = '';
                
                // Add gap between different speakers
                if (lastSpeaker && lastSpeaker !== entry.speaker) {
                    html += '<div class="speaker-gap" style="height: 16px; margin-bottom: 8px;"></div>';
                }
                
                html += `
                    <div class="transcript-entry" data-speaker="${entry.speaker}">
                        <div class="transcript-speaker">
                            <i class="fas fa-user"></i> ${entry.speaker}
                        </div>
                        <div class="transcript-text">${entry.text}</div>
                    </div>
                `;
                
                lastSpeaker = entry.speaker;
                return html;
            }).join('');
    }

    buildQuestionTranscriptText(question) {
        if (!question.transcription || question.transcription.length === 0) {
            return '';
        }
        
        const filteredTranscription = question.transcription.filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing);
        return filteredTranscription
            .map(entry => `${entry.speaker}: ${entry.text}`)
            .join('\n\n');
    }

    toggleQuestionEdit(questionIndex) {
        const displayDiv = document.getElementById(`questionTextDisplay-session-${questionIndex}`);
        const editTextarea = document.getElementById(`questionTextEdit-session-${questionIndex}`);
        
        // Find the edit button by looking for the button that contains "Edit Question"
        const editButtons = document.querySelectorAll(`[onclick="app.toggleQuestionEdit(${questionIndex})"]`);
        const editButton = editButtons[0];
        
        if (displayDiv && editTextarea) {
            if (displayDiv.style.display === 'none') {
                // Currently editing, switch to display
                displayDiv.style.display = 'block';
                editTextarea.style.display = 'none';
                if (editButton) {
                    editButton.innerHTML = '<i class="fas fa-pen"></i> Edit Question';
                }
            } else {
                // Currently displaying, switch to edit
                displayDiv.style.display = 'none';
                editTextarea.style.display = 'block';
                editTextarea.focus();
                if (editButton) {
                    editButton.innerHTML = '<i class="fas fa-save"></i> Save Question';
                }
            }
        }
    }

    toggleQuestionTranscriptEdit(questionIndex) {
        const displayDiv = document.getElementById(`questionTranscriptDisplay-session-${questionIndex}`);
        const editTextarea = document.getElementById(`questionTranscriptEditor-session-${questionIndex}`);
        const actionsDiv = document.getElementById(`questionTranscriptActions-session-${questionIndex}`);
        
        // Find the edit transcript button
        const editButtons = document.querySelectorAll(`[onclick="app.toggleQuestionTranscriptEdit(${questionIndex})"]`);
        const editButton = editButtons[0];
        
        if (displayDiv && editTextarea && actionsDiv) {
            if (displayDiv.style.display === 'none') {
                // Currently editing, save and switch to display
                this.saveQuestionTranscript(questionIndex);
                if (editButton) {
                    editButton.innerHTML = '<i class="fas fa-pen"></i> Edit Transcript';
                }
            } else {
                // Currently displaying, switch to edit
                displayDiv.style.display = 'none';
                editTextarea.style.display = 'block';
                actionsDiv.style.display = 'block';
                editTextarea.focus();
                if (editButton) {
                    editButton.innerHTML = '<i class="fas fa-eye"></i> View Transcript';
                }
            }
        }
    }

    saveQuestionTranscript(questionIndex) {
        const editTextarea = document.getElementById(`questionTranscriptEditor-session-${questionIndex}`);
        const displayDiv = document.getElementById(`questionTranscriptDisplay-session-${questionIndex}`);
        const actionsDiv = document.getElementById(`questionTranscriptActions-session-${questionIndex}`);
        
        // Find the edit transcript button to reset its text
        const editButtons = document.querySelectorAll(`[onclick="app.toggleQuestionTranscriptEdit(${questionIndex})"]`);
        const editButton = editButtons[0];
        
        if (editTextarea && displayDiv && actionsDiv) {
            const newTranscriptText = editTextarea.value;
            
            // Parse the transcript text back into entries
            const entries = newTranscriptText.split('\n\n').filter(line => line.trim()).map(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const speaker = line.substring(0, colonIndex).trim();
                    const text = line.substring(colonIndex + 1).trim();
                    return {
                        speaker: speaker,
                        text: text,
                        timestamp: new Date().toISOString()
                    };
                }
                return null;
            }).filter(entry => entry !== null);
            
            // Update the question's transcription
            if (this.sessionData.questions[questionIndex]) {
                this.sessionData.questions[questionIndex].transcription = entries;
                
                // Update display
                displayDiv.innerHTML = this.formatQuestionTranscription(entries);
                
                // Switch back to display mode
                displayDiv.style.display = 'block';
                editTextarea.style.display = 'none';
                actionsDiv.style.display = 'none';
                
                // Reset button text
                if (editButton) {
                    editButton.innerHTML = '<i class="fas fa-pen"></i> Edit Transcript';
                }
                
                // Auto-save
                this.autoSaveSession('transcript_edit');
                
                console.log(`✅ Updated transcript for question ${questionIndex + 1}`);
            }
        }
    }

    cancelQuestionTranscriptEdit(questionIndex) {
        const displayDiv = document.getElementById(`questionTranscriptDisplay-session-${questionIndex}`);
        const editTextarea = document.getElementById(`questionTranscriptEditor-session-${questionIndex}`);
        const actionsDiv = document.getElementById(`questionTranscriptActions-session-${questionIndex}`);
        
        // Find the edit transcript button to reset its text
        const editButtons = document.querySelectorAll(`[onclick="app.toggleQuestionTranscriptEdit(${questionIndex})"]`);
        const editButton = editButtons[0];
        
        if (displayDiv && editTextarea && actionsDiv) {
            // Restore original text
            const question = this.sessionData.questions[questionIndex];
            if (question) {
                editTextarea.value = this.buildQuestionTranscriptText(question);
            }
            
            // Switch back to display mode
            displayDiv.style.display = 'block';
            editTextarea.style.display = 'none';
            actionsDiv.style.display = 'none';
            
            // Reset button text
            if (editButton) {
                editButton.innerHTML = '<i class="fas fa-pen"></i> Edit Transcript';
            }
        }
    }

    toggleQuestionResponses(questionIndex) {
        const responsesDiv = document.getElementById(`question-responses-${questionIndex}`);
        const toggleBtn = responsesDiv.previousElementSibling.querySelector('.toggle-responses-btn');
        
        if (responsesDiv.style.display === 'none') {
            responsesDiv.style.display = 'block';
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i> Hide Responses';
        } else {
            responsesDiv.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Show Responses';
        }
    }

    setupSessionAnalysisPrompt() {
        console.log('🧠 Setting up session analysis prompt...');
        
        if (!this.sessionAnalysisPrompt) {
            console.log('⚠️ Session analysis prompt element not found');
            return;
        }
        
        // Prompt is ready - user will use "Load Saved Prompt" button to select prompts
        console.log('✅ Session analysis prompt ready - user will select prompts manually');
    }

    async runSessionAnalysis() {
        console.log('🧠 Running question-by-question session analysis...');
        
        if (!this.sessionAnalysisPrompt || !this.sessionAnalysisPrompt.value.trim()) {
            this.showStatus('Please enter an analysis prompt', 'error');
            return;
        }

        try {
            // Show loading state
            this.sessionAnalysisStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing questions...';
            this.sessionAnalysisStatus.className = 'analysis-status processing';
            this.runSessionAnalysisBtn.disabled = true;

            // Get questions with transcriptions
            const questionsWithData = this.sessionData.questions.filter(q => 
                q.transcription && q.transcription.some(t => !t.isTranscribing && t.text && t.text.trim())
            );
            
            if (questionsWithData.length === 0) {
                this.showStatus('No transcription data available for analysis', 'error');
                this.sessionAnalysisStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No data to analyze';
                this.sessionAnalysisStatus.className = 'analysis-status error';
                this.runSessionAnalysisBtn.disabled = false;
                return;
            }

            console.log(`📤 Analyzing ${questionsWithData.length} questions separately...`);

            // Analyze each question separately
            const analysisResults = [];
            const totalQuestions = questionsWithData.length;
            
            for (let i = 0; i < questionsWithData.length; i++) {
                const questionData = questionsWithData[i];
                const questionIndex = this.sessionData.questions.indexOf(questionData) + 1;
                
                // Update progress
                const progress = ((i + 1) / totalQuestions * 100).toFixed(0);
                this.sessionAnalysisStatus.innerHTML = `
                    <i class="fas fa-spinner fa-spin"></i> 
                    Analyzing Question ${questionIndex} (${progress}%)...
                `;

                try {
                    const questionAnalysis = await this.analyzeIndividualQuestion(questionData, questionIndex);
                    analysisResults.push({
                        questionIndex,
                        question: questionData.question,
                        analysis: questionAnalysis,
                        success: true
                    });
                    
                    // Save individual analysis to question data
                    questionData.analysis = questionAnalysis;
                    
                    console.log(`✅ Question ${questionIndex} analyzed successfully`);
                    
                } catch (error) {
                    console.error(`❌ Error analyzing question ${questionIndex}:`, error);
                    analysisResults.push({
                        questionIndex,
                        question: questionData.question,
                        analysis: `Analysis failed: ${error.message}`,
                        success: false
                    });
                }
                
                // Small delay between requests to avoid rate limiting
                if (i < questionsWithData.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Compile final analysis
            const finalAnalysis = this.compileQuestionAnalyses(analysisResults);
            
            // Store and display results
            this.originalSessionAnalysisText = finalAnalysis;
            const htmlContent = this.convertMarkdownToHtml(finalAnalysis);
            this.sessionAnalysisContent.innerHTML = htmlContent;
            
            // Show results
            this.sessionAnalysisResults.style.display = 'block';
            
            const successCount = analysisResults.filter(r => r.success).length;
            const failCount = analysisResults.length - successCount;
            
            if (failCount === 0) {
                this.sessionAnalysisStatus.innerHTML = '<i class="fas fa-check-circle"></i> All questions analyzed successfully!';
                this.sessionAnalysisStatus.className = 'analysis-status success';
                this.showStatus(`Analysis complete! ${successCount} questions analyzed.`, 'success');
            } else {
                this.sessionAnalysisStatus.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${successCount} questions analyzed, ${failCount} failed`;
                this.sessionAnalysisStatus.className = 'analysis-status error';
                this.showStatus(`Partial analysis complete. ${failCount} question(s) failed.`, 'error');
            }
            
            // Update session state
            this.sessionData.state = 'analyzed';
            
            // Initialize analyses array if it doesn't exist
            if (!this.sessionData.analyses) {
                this.sessionData.analyses = [];
            }
            
            // Add new analysis to the array with indexing
            const analysisIndex = this.sessionData.analyses.length + 1;
            const newAnalysis = {
                id: Date.now().toString(),
                index: analysisIndex,
                result: finalAnalysis,
                prompt: this.sessionAnalysisPrompt.value,
                timestamp: new Date().toISOString()
            };
            
            this.sessionData.analyses.push(newAnalysis);
            this.sessionData.latestAnalysis = newAnalysis;
            
            // Keep legacy field for compatibility
            this.sessionData.analysis = finalAnalysis;
            
            console.log(`✅ Analysis #${analysisIndex} saved to session data`);
            
            // Auto-save with analysis
            await this.autoSaveSession('analysis_complete');
            
        } catch (error) {
            console.error('❌ Session analysis error:', error);
            this.sessionAnalysisStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Analysis failed';
            this.sessionAnalysisStatus.className = 'analysis-status error';
            this.showStatus('Analysis failed. Please check your connection and try again.', 'error');
            
        } finally {
            this.runSessionAnalysisBtn.disabled = false;
        }
    }

    async analyzeIndividualQuestion(questionData, questionIndex) {
        console.log(`🔍 Analyzing Question ${questionIndex}: "${questionData.question}"`);
        
        // Prepare question-specific transcript
        const validTranscriptions = questionData.transcription.filter(entry => 
            !entry.isTranscribing && entry.text && entry.text.trim()
        );
        
        let questionTranscript = '';
        validTranscriptions.forEach(entry => {
            questionTranscript += `[${entry.speaker}]: ${entry.text}\n\n`;
        });
        
        // Get the base prompt from the textarea
        const basePrompt = this.sessionAnalysisPrompt.value.trim();
        
        // Add only essential context
        const studentNames = this.sessionData.students.join(', ');
        const essentialContext = `

**QUESTION BEING ANALYZED:**
"${questionData.question}"

**Important Context:**
- This transcript comes from speech-to-text, so names/words may be imperfectly transcribed
- Student names: ${studentNames}
- Use the provided names to correct any misidentified speakers or name references
- Focus specifically on this question - don't reference other questions in the session`;

        const finalPrompt = basePrompt + essentialContext;

        // Make API call only for analysis (server will not persist session data)
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversation: questionTranscript,
                prompt: finalPrompt,
                question: questionData.question,
                studentNames: this.sessionData.students,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Analysis failed');
        }

        return result.analysis;
    }

    compileQuestionAnalyses(analysisResults) {
        console.log('📝 Compiling question-by-question analyses...');
        
        const sessionOverview = `# Complete Session Analysis Report

## 📊 Session Overview
- **Students**: ${this.sessionData.students.join(', ')}
- **Total Questions**: ${this.sessionData.questions.length}
- **Questions Analyzed**: ${analysisResults.filter(r => r.success).length}
- **Session Duration**: ${this.sessionDuration ? this.sessionDuration.textContent : 'N/A'}
- **Analysis Date**: ${new Date().toLocaleDateString()}

---

`;

        let compiledAnalysis = sessionOverview;
        
        // Add individual question analyses
        analysisResults.forEach((result, index) => {
            compiledAnalysis += `## 🔍 Question ${result.questionIndex} Analysis\n\n`;
            compiledAnalysis += `**Question**: "${result.question}"\n\n`;
            
            if (result.success) {
                compiledAnalysis += result.analysis;
            } else {
                compiledAnalysis += `⚠️ **Analysis Error**: ${result.analysis}`;
            }
            
            compiledAnalysis += '\n\n---\n\n';
        });
        
        // Add overall session summary
        const successfulAnalyses = analysisResults.filter(r => r.success);
        if (successfulAnalyses.length > 1) {
            compiledAnalysis += `## 🌟 Overall Session Insights\n\n`;
            compiledAnalysis += `This session covered ${successfulAnalyses.length} questions with comprehensive student participation. Each question received focused analysis to provide targeted feedback for improvement.\n\n`;
            compiledAnalysis += `**Key Strengths Across Questions:**\n`;
            compiledAnalysis += `- Students engaged with multiple topics and question types\n`;
            compiledAnalysis += `- Opportunity to demonstrate different aspects of collaborative discussion\n`;
            compiledAnalysis += `- Rich data for individual and group development\n\n`;
            compiledAnalysis += `**Recommendations for Future Sessions:**\n`;
            compiledAnalysis += `- Review individual question feedback for targeted improvement\n`;
            compiledAnalysis += `- Consider how insights from one question can inform responses to others\n`;
            compiledAnalysis += `- Use question-specific feedback to develop stronger discussion strategies\n\n`;
        }
        
        compiledAnalysis += `---\n\n*Generated by Interview Transcription App - Question-by-Question Analysis*`;
        
        return compiledAnalysis;
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type} show`;
        
        setTimeout(() => {
            this.statusMessage.classList.remove('show');
        }, 4000);
    }

    convertMarkdownToHtml(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // Convert horizontal rules
        html = html.replace(/^---+$/gm, '<hr>');
        
        // Convert headers (with proper spacing)
        html = html.replace(/^### (.*$)/gim, '<h3 class="analysis-h3">$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2 class="analysis-h2">$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1 class="analysis-h1">$1</h1>');
        
        // Convert bold and italic text
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert bullet lists (handle multiple patterns)
        html = html.replace(/^- (.*$)/gim, '<li class="analysis-bullet">$1</li>');
        html = html.replace(/^\* (.*$)/gim, '<li class="analysis-bullet">$1</li>');
        html = html.replace(/^• (.*$)/gim, '<li class="analysis-bullet">$1</li>');
        
        // Convert numbered lists
        html = html.replace(/^\d+\. (.*$)/gim, '<li class="analysis-numbered">$1</li>');
        
        // Wrap consecutive list items in proper ul/ol tags
        html = html.replace(/(<li class="analysis-bullet">.*?<\/li>)(\s*<li class="analysis-bullet">.*?<\/li>)*/gs, (match) => {
            return '<ul class="analysis-list">' + match + '</ul>';
        });
        html = html.replace(/(<li class="analysis-numbered">.*?<\/li>)(\s*<li class="analysis-numbered">.*?<\/li>)*/gs, (match) => {
            return '<ol class="analysis-list">' + match + '</ol>';
        });
        
        // Convert code blocks and inline code
        html = html.replace(/```(.*?)```/gs, '<pre class="analysis-code">$1</pre>');
        html = html.replace(/`(.*?)`/g, '<code class="analysis-inline-code">$1</code>');
        
        // Convert blockquotes
        html = html.replace(/^> (.*$)/gim, '<blockquote class="analysis-quote">$1</blockquote>');
        
        // Handle double line breaks as paragraph breaks
        html = html.replace(/\n\n/g, '</p><p class="analysis-paragraph">');
        
        // Handle single line breaks as <br> within paragraphs
        html = html.replace(/\n/g, '<br>');
        
        // Wrap in paragraphs
        html = '<p class="analysis-paragraph">' + html + '</p>';
        
        // Clean up empty paragraphs and fix formatting
        html = html.replace(/<p class="analysis-paragraph"><\/p>/g, '');
        html = html.replace(/<p class="analysis-paragraph"><br><\/p>/g, '');
        html = html.replace(/<p class="analysis-paragraph">(<h[1-6])/g, '$1');
        html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
        html = html.replace(/<p class="analysis-paragraph">(<ul|<ol|<hr|<blockquote)/g, '$1');
        html = html.replace(/(<\/ul>|<\/ol>|<hr>|<\/blockquote>)<\/p>/g, '$1');
        
        // Fix nested formatting issues
        html = html.replace(/<br><\/p><p class="analysis-paragraph">/g, '</p><p class="analysis-paragraph">');
        
        return html;
    }

    convertMarkdownToPlainText(markdown) {
        if (!markdown) return '';
        
        let text = markdown;
        
        // Remove markdown formatting
        text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
        text = text.replace(/\*(.*?)\*/g, '$1'); // Italic
        text = text.replace(/^#{1,6}\s+/gm, ''); // Headers
        text = text.replace(/^[•*-]\s+/gm, '• '); // Bullet points
        text = text.replace(/^\d+\.\s+/gm, ''); // Numbered lists
        
        // Handle tables - convert to simple format
        text = text.replace(/\|(.+)\|/g, (match, content) => {
            const cells = content.split('|').map(cell => cell.trim());
            return cells.join(' | ');
        });
        
        return text;
    }
}

// Global function for toggling post-processing section (called from HTML onclick)
function togglePostProcessing() {
    // This function is no longer needed since post-processing section is removed
}

// Initialize the app when DOM is loaded
let app; // Global reference for HTML onclick handlers
document.addEventListener('DOMContentLoaded', () => {
    app = new InterviewTranscriptionApp();
}); 