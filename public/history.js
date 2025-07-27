class InterviewHistoryManager {
    constructor() {
        try {
            this.historyContainer = document.getElementById('historyContainer');
            this.emptyState = document.getElementById('emptyState');
            this.interviewCount = document.getElementById('interviewCount');
            this.clearAllBtn = document.getElementById('clearAllBtn');
            this.statusMessage = document.getElementById('statusMessage');
            this.deleteModal = document.getElementById('deleteModal');
            this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
            this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
            
            // Check if required elements exist
            if (!this.historyContainer) {
                console.error('❌ Required element historyContainer not found');
                return;
            }
            
            this.currentDeleteId = null;
            
            this.setupEventListeners();
            this.loadHistory();
            this.updateCount();
        } catch (error) {
            console.error('❌ Error initializing InterviewHistoryManager:', error);
        }
    }

    setupEventListeners() {
        this.clearAllBtn.addEventListener('click', () => this.showClearAllConfirmation());
        this.confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());
        this.cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
        
        // Close modal when clicking backdrop
        this.deleteModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                this.hideDeleteModal();
            }
        });
    }

    loadHistory() {
        try {
            const savedInterviews = this.getSavedInterviews();
            
            if (savedInterviews.length === 0) {
                this.showEmptyState();
                return;
            }

            this.hideEmptyState();
            this.displayInterviews(savedInterviews);
        } catch (error) {
            console.error('Error loading history:', error);
            this.showStatus('Error loading interview history', 'error');
        }
    }

    getSavedInterviews() {
        const saved = localStorage.getItem('interviewHistory');
        return saved ? JSON.parse(saved) : [];
    }

    saveInterviewsToStorage(interviews) {
        localStorage.setItem('interviewHistory', JSON.stringify(interviews));
    }

    displayInterviews(interviews) {
        this.historyContainer.innerHTML = '';
        
        // Sort by date (most recent first)
        const sortedInterviews = interviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        sortedInterviews.forEach(interview => {
            const interviewCard = this.createInterviewCard(interview);
            this.historyContainer.appendChild(interviewCard);
        });
    }

    createInterviewCard(interview) {
        console.log('🏗️ Creating interview card for:', interview);
        
        // Handle both old single-question format and new multi-question session format
        const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
        
        let displayTitle, questionsData, studentsData, totalResponses;
        
        if (isNewFormat) {
            // New multi-question session format
            const sessionData = interview.fullSessionData || interview;
            questionsData = sessionData.questions || [];
            studentsData = sessionData.students || interview.students || [];
            
            // Create title from first question or session info
            if (questionsData.length > 0) {
                const firstQuestion = questionsData[0].question || 'Untitled Question';
                displayTitle = questionsData.length > 1 
                    ? `${firstQuestion} (+ ${questionsData.length - 1} more questions)`
                    : firstQuestion;
            } else {
                displayTitle = `Session with ${studentsData.length} students`;
            }
            
            // Calculate total responses across all questions
            totalResponses = questionsData.reduce((total, q) => {
                return total + (q.transcription ? q.transcription.filter(t => t.text && t.text.trim()).length : 0);
            }, 0);
            
        } else {
            // Legacy single-question format
            questionsData = [{ question: interview.question, transcription: interview.transcription || [] }];
            studentsData = interview.students || [];
            displayTitle = interview.question || 'Untitled Interview';
            totalResponses = interview.transcription ? interview.transcription.filter(t => t.text && t.text.trim()).length : 0;
        }

        const card = document.createElement('div');
        card.className = `card history-item ${interview.autoSaved ? 'auto-saved' : ''}`;
        
        card.innerHTML = `
            <div class="interview-header">
                <h3 class="interview-title">${this.truncateText(displayTitle, 80)}</h3>
                <div class="interview-date">${this.formatDate(interview.timestamp || interview.savedAt)}</div>
            </div>
            
            <div class="interview-meta">
                <div class="meta-item">
                    <span class="meta-label">Questions:</span>
                    <span class="meta-value">${questionsData.length}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Students:</span>
                    <span class="meta-value">${studentsData.length}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Responses:</span>
                    <span class="meta-value">${totalResponses}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Duration:</span>
                    <span class="meta-value">${interview.duration || 'N/A'}</span>
                </div>
            </div>

            <div class="interview-questions">
                <div class="questions-preview">
                    ${questionsData.map((q, index) => `
                        <div class="question-preview ${index === 0 ? 'first' : ''}">
                            Q${index + 1}: ${this.truncateText(q.question || `Question ${index + 1}`, 100)}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="interview-actions">
                <button class="btn btn-primary action-btn" onclick="historyManager.toggleTranscription('${interview.id}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="btn btn-secondary action-btn" onclick="historyManager.exportInterviewCSV('${interview.id}')">
                    <i class="fas fa-file-csv"></i> CSV
                </button>
                <button class="btn btn-secondary action-btn" onclick="historyManager.exportInterviewJSON('${interview.id}')">
                    <i class="fas fa-file-code"></i> JSON
                </button>
                <button class="btn btn-success action-btn" onclick="historyManager.toggleCustomAnalysis('${interview.id}')">
                    <i class="fas fa-brain"></i> Run Analysis
                </button>
                <button class="btn btn-danger action-btn" onclick="historyManager.showDeleteConfirmation('${interview.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            
            <!-- Analysis Status Indicator -->
            <div class="analysis-status-indicator">
                ${this.hasAnalysis(interview) ? `
                    <div class="status-badge analyzed">
                        <i class="fas fa-check-circle"></i> ${this.getAnalysisCount(interview)} Analysis${this.getAnalysisCount(interview) > 1 ? 'es' : ''} Completed
                    </div>
                    <p class="status-description">
                        <strong>Latest Analysis:</strong> ${this.getLatestAnalysisDate(interview)}<br>
                        You can run additional analyses with different prompts and approaches.
                    </p>
                ` : `
                    <div class="status-badge not-analyzed">
                        <i class="fas fa-brain"></i> Ready for Analysis
                    </div>
                    <p class="status-description">This session is ready for analysis. All analyses will be automatically saved.</p>
                `}
            </div>
            
            <!-- Custom Analysis Section -->
            <div class="custom-analysis-section" id="custom-analysis-${interview.id}" style="display: none;">
                <div class="analysis-section-header">
                    <h4><i class="fas fa-magic"></i> Analysis Configuration</h4>
                    <button class="btn btn-sm btn-outline collapse-btn" onclick="historyManager.toggleCustomAnalysis('${interview.id}')">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
                
                <div class="custom-analysis-content">
                    <div class="quick-prompts-section">
                        <button class="section-toggle" onclick="historyManager.toggleSection('quick-prompts-${interview.id}')">
                            <i class="fas fa-chevron-right"></i> Quick Analysis Options
                        </button>
                        <div id="quick-prompts-${interview.id}" class="collapsible-content" style="display: none;">
                            <div class="quick-prompt-buttons">
                                <button class="btn btn-sm btn-secondary" onclick="historyManager.loadQuickPrompt('${interview.id}', 'collaboration')">
                                    🤝 Collaboration Focus
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="historyManager.loadQuickPrompt('${interview.id}', 'individual')">
                                    👤 Individual Assessment
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="historyManager.loadQuickPrompt('${interview.id}', 'improvement')">
                                    📈 Areas for Improvement
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="historyManager.loadQuickPrompt('${interview.id}', 'strengths')">
                                    ⭐ Highlight Strengths
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="custom-prompt-section">
                        <button class="section-toggle active" onclick="historyManager.toggleSection('custom-prompt-${interview.id}')">
                            <i class="fas fa-chevron-down"></i> Custom Analysis Prompt
                        </button>
                        <div id="custom-prompt-${interview.id}" class="collapsible-content" style="display: block;">
                            <textarea id="customPrompt-${interview.id}" class="custom-prompt-textarea" rows="8" placeholder="Enter your analysis prompt here...">${this.getDefaultAnalysisPrompt(isNewFormat ? interview.fullSessionData : interview)}</textarea>
                            <div class="custom-analysis-controls">
                                <button class="btn btn-primary" onclick="historyManager.runCustomAnalysis('${interview.id}')">
                                    <i class="fas fa-brain"></i> Run Analysis
                                </button>
                                <button class="btn btn-secondary" onclick="historyManager.clearPrompt('${interview.id}')">
                                    <i class="fas fa-eraser"></i> Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    ${this.hasAnalysis(interview) ? `
                        <div class="analysis-history-section">
                            <h4><i class="fas fa-brain"></i> Analysis History (${this.getAnalysisCount(interview)})</h4>
                            <p class="analysis-description">All analyses performed on this session with their prompts and results.</p>
                            
                            <div class="analysis-history-detailed">
                                ${this.generateAnalysisHistoryItems(interview)}
                            </div>
                        </div>
                    ` : `
                        <div class="no-analysis-section">
                            <h4><i class="fas fa-brain"></i> No Analysis Yet</h4>
                            <p>Click "Run Analysis" above to analyze this session.</p>
                        </div>
                    `}
                    
                    <div id="customAnalysisResults-${interview.id}" class="custom-analysis-results" style="display: none;"></div>
                </div>
            </div>
            
            <div class="interview-transcription" id="transcription-${interview.id}" style="display: none;">
                <h4><i class="fas fa-file-alt"></i> Complete Session Details</h4>
                
                <div class="session-overview">
                    <div class="overview-item">
                        <strong>Students:</strong> ${studentsData.join(', ') || 'Not specified'}
                    </div>
                    <div class="overview-item">
                        <strong>Questions:</strong> ${questionsData.length}
                    </div>
                    <div class="overview-item">
                        <strong>Total Responses:</strong> ${totalResponses}
                    </div>
                    ${interview.fullSessionData && interview.fullSessionData.metadata ? `
                        <div class="overview-item">
                            <strong>Most Active:</strong> ${interview.fullSessionData.metadata.mostActiveStudent || 'N/A'}
                        </div>
                        <div class="overview-item">
                            <strong>Session Quality:</strong> 
                            <span class="quality-badge ${interview.fullSessionData.metadata.sessionQuality || 'good'}">${interview.fullSessionData.metadata.sessionQuality || 'good'}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="questions-and-transcripts">
                    ${questionsData.map((questionData, qIndex) => `
                        <div class="question-section">
                            <div class="question-header-editable">
                                <div class="question-label">
                                    <i class="fas fa-question-circle"></i> Question ${qIndex + 1}:
                                </div>
                                <textarea 
                                    class="question-edit-textarea" 
                                    id="question-${interview.id}-${qIndex}"
                                    data-interview-id="${interview.id}"
                                    data-question-index="${qIndex}"
                                    rows="2"
                                    placeholder="Enter question text..."
                                    onblur="historyManager.saveQuestionEdit('${interview.id}', ${qIndex})"
                                    onkeydown="historyManager.handleQuestionKeydown(event, '${interview.id}', ${qIndex})"
                                >${questionData.question || `Question ${qIndex + 1}`}</textarea>
                                <div class="question-edit-status" id="edit-status-${interview.id}-${qIndex}" style="display: none;">
                                    <i class="fas fa-check-circle"></i> Saved
                                </div>
                            </div>
                            <div class="question-transcription">
                                ${this.formatQuestionTranscription(questionData.transcription || [])}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${interview.analysis || (interview.fullSessionData && interview.fullSessionData.analysis) ? `
                    <div class="analysis-content">
                        <h4><i class="fas fa-brain"></i> GPT Analysis</h4>
                        <div class="analysis-text">${this.convertMarkdownToHtml(interview.analysis || interview.fullSessionData.analysis)}</div>
                    </div>
                ` : ''}
            </div>
        `;
        
        return card;
    }

    formatTranscription(transcription) {
        if (!transcription || transcription.length === 0) {
            return '<p class="no-data">No transcription data available</p>';
        }
        
        return transcription
            .filter(entry => entry.text && entry.text.trim())
            .map(entry => `
                <div class="transcript-entry">
                    <div class="transcript-speaker">
                        <i class="fas fa-user"></i> ${entry.speaker}
                    </div>
                    <div class="transcript-text">${entry.text}</div>
                    <div class="transcript-time">${this.formatTime(entry.timestamp)}</div>
                </div>
            `).join('');
    }

    formatQuestionTranscription(transcription) {
        if (!transcription || transcription.length === 0) {
            return '<p class="no-data">No transcription data available for this question.</p>';
        }
        
        return transcription
            .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
            .map(entry => `
                <div class="transcript-entry">
                    <div class="transcript-speaker">
                        <i class="fas fa-user"></i> ${entry.speaker}
                    </div>
                    <div class="transcript-text">${entry.text}</div>
                    <div class="transcript-time">${this.formatTime(entry.timestamp)}</div>
                </div>
            `).join('');
    }

    toggleTranscription(id) {
        const transcriptionDiv = document.getElementById(`transcription-${id}`);
        const viewBtn = document.querySelector(`[onclick="historyManager.toggleTranscription('${id}')"]`);
        
        if (transcriptionDiv.style.display === 'none') {
            transcriptionDiv.style.display = 'block';
            viewBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Details';
        } else {
            transcriptionDiv.style.display = 'none';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i> View Details';
        }
    }

    exportInterviewCSV(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        // Handle both old and new formats
        const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
        
        if (isNewFormat) {
            // New multi-question session format
            const sessionData = interview.fullSessionData || interview;
            const headers = ['Question_Number', 'Question', 'Speaker', 'Text', 'Timestamp'];
            const csvRows = [headers.join(',')];

            sessionData.questions.forEach((questionData, qIndex) => {
                if (questionData.transcription) {
                    questionData.transcription
                        .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
                        .forEach(entry => {
                            csvRows.push([
                                `"${qIndex + 1}"`,
                                `"${(questionData.question || `Question ${qIndex + 1}`).replace(/"/g, '""')}"`,
                                `"${entry.speaker}"`,
                                `"${entry.text.replace(/"/g, '""')}"`,
                                `"${entry.timestamp}"`
                            ].join(','));
                        });
                }
            });

            const csvContent = csvRows.join('\n');
            this.downloadFile(csvContent, `session-${this.formatFileDate(interview.timestamp || interview.savedAt)}.csv`, 'text/csv');
            
        } else {
            // Legacy single-question format
            const headers = ['Speaker', 'Text', 'Timestamp'];
            const csvContent = [
                headers.join(','),
                ...interview.transcription
                    .filter(entry => entry.text && entry.text.trim())
                    .map(entry => [
                        `"${entry.speaker}"`,
                        `"${entry.text.replace(/"/g, '""')}"`,
                        `"${entry.timestamp}"`
                    ].join(','))
            ].join('\n');

            this.downloadFile(csvContent, `interview-${this.formatFileDate(interview.timestamp)}.csv`, 'text/csv');
        }
        
        this.showStatus('CSV exported successfully!', 'success');
    }

    exportInterviewJSON(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        const jsonContent = JSON.stringify(interview, null, 2);
        this.downloadFile(jsonContent, `interview-${this.formatFileDate(interview.timestamp)}.json`, 'application/json');
        this.showStatus('JSON exported successfully!', 'success');
    }

    runDeferredAnalysis(id) {
        console.log('🧠 Running deferred analysis for session:', id);
        
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        if (!interview.fullSessionData) {
            this.showStatus('Session data not available for analysis', 'error');
            return;
        }

        const sessionData = interview.fullSessionData;
        
        // Create the analysis window
        const analysisWindow = window.open('', '_blank', 'width=1000,height=800,scrollbars=yes');
        
        // Prepare the complete session transcript
        let fullConversation = '';
        sessionData.questions.forEach((questionData, qIndex) => {
            fullConversation += `\n\n=== QUESTION ${qIndex + 1}: ${questionData.question} ===\n\n`;
            
            if (questionData.transcription) {
                questionData.transcription
                    .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
                    .forEach(entry => {
                        fullConversation += `${entry.speaker}: ${entry.text}\n\n`;
                    });
            }
        });

        analysisWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Session Analysis - ${sessionData.students.join(', ')}</title>
                <link rel="stylesheet" href="/styles.css">
                <style>
                    body { 
                        padding: 0;
                        margin: 0;
                        font-family: 'Inter', sans-serif; 
                        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                        min-height: 100vh;
                    }
                    .analysis-container { 
                        max-width: 1000px; 
                        margin: 0 auto; 
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.12);
                        padding: 40px;
                        margin: 20px;
                        min-height: calc(100vh - 40px);
                    }
                    .header-section {
                        text-align: center;
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #f1f5f9;
                    }
                    .header-section h1 {
                        color: #1e293b;
                        font-size: 2.2rem;
                        font-weight: 700;
                        margin: 0 0 10px 0;
                        background: linear-gradient(135deg, #0f172a, #334155);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    }
                    .session-info { 
                        background: linear-gradient(135deg, #1e40af, #3b82f6);
                        color: white;
                        padding: 25px; 
                        border-radius: 16px; 
                        margin: 25px 0;
                        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
                    }
                    .session-info h3 {
                        margin: 0 0 15px 0;
                        color: white;
                        font-size: 1.3rem;
                        font-weight: 600;
                    }
                    .session-info p {
                        margin: 8px 0;
                        color: rgba(255, 255, 255, 0.95);
                        font-weight: 500;
                    }
                    .prompt-section {
                        margin: 30px 0;
                    }
                    .prompt-section label {
                        display: block;
                        font-weight: 600;
                        color: #1e293b;
                        margin-bottom: 10px;
                        font-size: 1.1rem;
                    }
                    .prompt-tabs {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 15px;
                        border-bottom: 2px solid #f1f5f9;
                        padding-bottom: 10px;
                    }
                    .prompt-tab {
                        padding: 10px 20px;
                        border: none;
                        background: #f8fafc;
                        color: #64748b;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.2s ease;
                    }
                    .prompt-tab.active {
                        background: linear-gradient(135deg, #1e40af, #3b82f6);
                        color: white;
                        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
                    }
                    .prompt-tab:hover:not(.active) {
                        background: #e2e8f0;
                        color: #475569;
                    }
                    .analysis-prompt { 
                        width: 100%; 
                        min-height: 250px; 
                        padding: 20px; 
                        border: 2px solid #e2e8f0; 
                        border-radius: 12px; 
                        font-family: 'Inter', sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                        resize: vertical;
                        background: #fafbfc;
                        color: #334155;
                        transition: all 0.2s ease;
                    }
                    .analysis-prompt:focus {
                        outline: none;
                        border-color: #3b82f6;
                        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                        background: white;
                    }
                    .btn { 
                        padding: 14px 28px; 
                        border: none; 
                        border-radius: 10px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        margin: 8px;
                        transition: all 0.3s ease;
                        font-size: 15px;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .btn-primary { 
                        background: linear-gradient(135deg, #1e40af, #3b82f6);
                        color: white; 
                        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
                    }
                    .btn-primary:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
                    }
                    .btn-secondary { 
                        background: #f1f5f9; 
                        color: #475569;
                        border: 2px solid #e2e8f0;
                    }
                    .btn-secondary:hover {
                        background: #e2e8f0;
                        color: #334155;
                        transform: translateY(-1px);
                    }
                    .btn-success {
                        background: linear-gradient(135deg, #059669, #10b981);
                        color: white;
                        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                    }
                    .btn-success:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
                    }
                    .analysis-results { 
                        margin-top: 30px; 
                        padding: 30px; 
                        background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                        border-radius: 16px;
                        border: 1px solid #e2e8f0;
                        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .analysis-results h3 {
                        color: #1e293b;
                        margin-top: 0;
                        font-size: 1.4rem;
                        font-weight: 700;
                    }
                    .loading { 
                        text-align: center; 
                        padding: 60px;
                        color: #64748b;
                        font-size: 16px;
                    }
                    .loading-spinner {
                        width: 40px;
                        height: 40px;
                        border: 4px solid #e2e8f0;
                        border-top: 4px solid #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 20px;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .analysis-content {
                        line-height: 1.7;
                        color: #1e293b;
                        font-size: 15px;
                    }
                    .analysis-content h1, .analysis-content h2, .analysis-content h3 {
                        color: #0f172a;
                        margin-top: 28px;
                        margin-bottom: 16px;
                        font-weight: 700;
                    }
                    .analysis-content h1 { 
                        font-size: 1.9em; 
                        border-bottom: 3px solid #3b82f6;
                        padding-bottom: 10px;
                    }
                    .analysis-content h2 { 
                        font-size: 1.5em;
                        color: #1e40af;
                    }
                    .analysis-content h3 { 
                        font-size: 1.3em;
                        color: #1e40af;
                    }
                    .analysis-content p {
                        margin-bottom: 16px;
                        line-height: 1.7;
                    }
                    .analysis-content ul, .analysis-content ol {
                        margin: 16px 0;
                        padding-left: 28px;
                    }
                    .analysis-content li {
                        margin-bottom: 8px;
                        line-height: 1.6;
                    }
                    .analysis-content strong {
                        color: #0f172a;
                        font-weight: 700;
                    }
                    .analysis-content em {
                        font-style: italic;
                        color: #475569;
                    }
                    .controls-section {
                        text-align: center;
                        margin: 30px 0;
                        padding: 20px;
                        background: rgba(248, 250, 252, 0.8);
                        border-radius: 12px;
                        border: 1px solid #e2e8f0;
                    }
                    .custom-prompt-section {
                        margin-top: 25px;
                        padding: 25px;
                        background: rgba(255, 255, 255, 0.8);
                        border-radius: 12px;
                        border: 2px dashed #cbd5e1;
                    }
                    .custom-prompt-section h4 {
                        color: #1e293b;
                        margin-top: 0;
                        font-size: 1.2rem;
                        font-weight: 600;
                    }
                    .error-message {
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        color: white;
                        padding: 15px 20px;
                        border-radius: 10px;
                        margin: 15px 0;
                        font-weight: 500;
                    }
                    .success-message {
                        background: linear-gradient(135deg, #10b981, #059669);
                        color: white;
                        padding: 15px 20px;
                        border-radius: 10px;
                        margin: 15px 0;
                        font-weight: 500;
                    }
                </style>
            </head>
            <body>
                <div class="analysis-container">
                    <div class="header-section">
                        <h1>📊 Advanced Session Analysis</h1>
                        <p style="color: #64748b; font-size: 16px; margin: 0;">Comprehensive AI-powered feedback and insights</p>
                    </div>
                    
                    <div class="session-info">
                        <h3>📋 Session Overview</h3>
                        <p><strong>Students:</strong> ${sessionData.students.join(', ')}</p>
                        <p><strong>Questions:</strong> ${sessionData.questions.length}</p>
                        <p><strong>Date:</strong> ${this.formatDate(interview.timestamp || interview.savedAt)}</p>
                        <p><strong>Duration:</strong> ${interview.duration || 'N/A'}</p>
                    </div>

                    <div class="prompt-section">
                        <label for="analysisPrompt">🎯 Analysis Configuration</label>
                        <div class="prompt-tabs">
                            <button class="prompt-tab active" onclick="switchPromptTab('default')">
                                📊 Default Analysis
                            </button>
                            <button class="prompt-tab" onclick="switchPromptTab('custom')">
                                ✏️ Custom Prompt
                            </button>
                        </div>
                        <textarea id="analysisPrompt" class="analysis-prompt" placeholder="Enter your analysis prompt here...">${this.getDefaultAnalysisPrompt(sessionData)}</textarea>
                    </div>

                    <div class="controls-section">
                        <button class="btn btn-primary" onclick="runAnalysis()">
                            🧠 Run GPT Analysis
                        </button>
                        <button class="btn btn-success" onclick="saveAnalysisToHistory()">
                            💾 Save Analysis
                        </button>
                        <button class="btn btn-secondary" onclick="window.close()">
                            ✕ Close Window
                        </button>
                    </div>

                    <div class="custom-prompt-section">
                        <h4>💡 Quick Analysis Options</h4>
                        <button class="btn btn-secondary" onclick="loadQuickPrompt('collaboration')">
                            🤝 Focus on Collaboration
                        </button>
                        <button class="btn btn-secondary" onclick="loadQuickPrompt('individual')">
                            👤 Individual Assessment
                        </button>
                        <button class="btn btn-secondary" onclick="loadQuickPrompt('improvement')">
                            📈 Areas for Improvement
                        </button>
                        <button class="btn btn-secondary" onclick="loadQuickPrompt('strengths')">
                            ⭐ Highlight Strengths
                        </button>
                    </div>

                    <div id="analysisResults" class="analysis-results" style="display: none;"></div>
                </div>

                <script>
                    const sessionData = ${JSON.stringify(sessionData)};
                    const fullConversation = ${JSON.stringify(fullConversation)};
                    const interviewId = '${interview.id}';
                    
                    let currentAnalysisResult = null;
                    
                    function switchPromptTab(tab) {
                        const tabs = document.querySelectorAll('.prompt-tab');
                        const promptTextarea = document.getElementById('analysisPrompt');
                        
                        tabs.forEach(t => t.classList.remove('active'));
                        event.target.classList.add('active');
                        
                        if (tab === 'default') {
                            promptTextarea.value = ${JSON.stringify(this.getDefaultAnalysisPrompt(sessionData))};
                        } else if (tab === 'custom') {
                            promptTextarea.value = '';
                            promptTextarea.placeholder = 'Enter your custom analysis prompt here...\\n\\nExample:\\n- Focus on specific learning objectives\\n- Analyze particular discussion patterns\\n- Evaluate specific skills or competencies\\n- Compare against rubrics or standards';
                        }
                    }
                    
                    function loadQuickPrompt(type) {
                        const promptTextarea = document.getElementById('analysisPrompt');
                        const studentNames = sessionData.students.join(', ');
                        const questionsList = sessionData.questions.map((q, i) => \`\${i + 1}. \${q.question}\`).join('\\\\n');
                        
                        let prompt = '';
                        
                        switch(type) {
                            case 'collaboration':
                                prompt = \`Analyze the collaborative dynamics in this group interview session.\\n\\n**Focus Areas:**\\n- How students build on each other's ideas\\n- Turn-taking and inclusive participation\\n- Conflict resolution and consensus building\\n- Supportive vs. competitive behaviors\\n- Group cohesion and collective problem-solving\\n\\n**Students:** \${studentNames}\\n**Questions:** \\n\${questionsList}\\n\\nProvide specific examples and actionable recommendations for improving group collaboration.\`;
                                break;
                            case 'individual':
                                prompt = \`Provide individual assessments for each student in this group interview.\\n\\n**Assessment Criteria:**\\n- Communication clarity and confidence\\n- Critical thinking and reasoning\\n- Contribution quality and frequency\\n- Leadership and initiative\\n- Listening and responsiveness to others\\n\\n**Students:** \${studentNames}\\n**Questions:** \\n\${questionsList}\\n\\nGive each student specific feedback with strengths, areas for growth, and personalized recommendations.\`;
                                break;
                            case 'improvement':
                                prompt = \`Identify key areas for improvement in this group interview session.\\n\\n**Analysis Focus:**\\n- Gaps in understanding or knowledge\\n- Missed opportunities for deeper discussion\\n- Communication barriers or inefficiencies\\n- Underdeveloped arguments or reasoning\\n- Areas where students could challenge each other more\\n\\n**Students:** \${studentNames}\\n**Questions:** \\n\${questionsList}\\n\\nProvide concrete strategies and activities to address these improvement areas.\`;
                                break;
                            case 'strengths':
                                prompt = \`Highlight the strengths and positive aspects of this group interview session.\\n\\n**Strength Categories:**\\n- Excellent examples of collaboration\\n- Strong individual contributions\\n- Creative or insightful responses\\n- Effective communication strategies\\n- Positive group dynamics\\n- Evidence of learning and growth\\n\\n**Students:** \${studentNames}\\n**Questions:** \\n\${questionsList}\\n\\nCelebrate what worked well and provide encouragement for continued development.\`;
                                break;
                        }
                        
                        promptTextarea.value = prompt;
                        
                        // Switch to custom tab
                        document.querySelectorAll('.prompt-tab').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.prompt-tab')[1].classList.add('active');
                    }
                    
                    function convertMarkdownToHtml(markdown) {
                        let html = markdown;
                        
                        // Convert headers
                        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
                        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
                        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
                        
                        // Convert bold and italic
                        html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
                        html = html.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
                        
                        // Convert bullet points
                        html = html.replace(/^[•\\*\\-] (.*$)/gim, '<li>$1</li>');
                        html = html.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
                        
                        // Convert numbered lists
                        html = html.replace(/^\\d+\\. (.*$)/gim, '<li>$1</li>');
                        
                        // Convert line breaks and paragraphs
                        html = html.replace(/\\n\\n/g, '</p><p>');
                        html = html.replace(/\\n/g, '<br>');
                        
                        // Wrap in paragraphs
                        html = '<p>' + html + '</p>';
                        
                        // Clean up empty paragraphs
                        html = html.replace(/<p><\\/p>/g, '');
                        html = html.replace(/<p><br><\\/p>/g, '');
                        
                        // Fix nested lists
                        html = html.replace(/<\\/ul>\\s*<ul>/g, '');
                        html = html.replace(/<\\/ol>\\s*<ol>/g, '');
                        
                        return html;
                    }
                    
                    async function runAnalysis() {
                        const prompt = document.getElementById('analysisPrompt').value;
                        const resultsDiv = document.getElementById('analysisResults');
                        
                        if (!prompt.trim()) {
                            resultsDiv.style.display = 'block';
                            resultsDiv.innerHTML = '<div class="error-message">⚠️ Please enter an analysis prompt</div>';
                            return;
                        }

                        resultsDiv.style.display = 'block';
                        resultsDiv.innerHTML = '<div class="loading"><div class="loading-spinner"></div>🔄 Analyzing session...</div>';

                        try {
                            const response = await fetch('/api/analyze', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    prompt: prompt,
                                    conversation: fullConversation,
                                    question: sessionData.questions.map(q => q.question).join(' | '),
                                    studentNames: sessionData.students,
                                    timestamp: new Date().toISOString(),
                                    sessionId: sessionData.sessionId || interviewId,
                                    totalQuestions: sessionData.questions.length
                                })
                            });

                            const result = await response.json();

                            if (result.success) {
                                currentAnalysisResult = result.analysis;
                                const htmlContent = convertMarkdownToHtml(result.analysis);
                                resultsDiv.innerHTML = '<h3>📋 Analysis Results</h3><div class="analysis-content">' + htmlContent + '</div>';
                            } else {
                                resultsDiv.innerHTML = '<div class="error-message">❌ Analysis failed: ' + (result.error || 'Unknown error') + '</div>';
                            }
                        } catch (error) {
                            resultsDiv.innerHTML = '<div class="error-message">❌ Network Error: ' + error.message + '</div>';
                        }
                    }
                    
                    async function saveAnalysisToHistory() {
                        if (!currentAnalysisResult) {
                            document.getElementById('analysisResults').innerHTML = '<div class="error-message">⚠️ Please run an analysis first before saving</div>';
                            return;
                        }
                        
                        try {
                            // Get current interviews from localStorage
                            const savedInterviews = JSON.parse(localStorage.getItem('interviewHistory') || '[]');
                            const interviewIndex = savedInterviews.findIndex(i => i.id === interviewId);
                            
                            if (interviewIndex !== -1) {
                                // Update the interview with the new analysis
                                if (savedInterviews[interviewIndex].fullSessionData) {
                                    savedInterviews[interviewIndex].fullSessionData.analysis = currentAnalysisResult;
                                    savedInterviews[interviewIndex].fullSessionData.state = 'analyzed';
                                } else {
                                    savedInterviews[interviewIndex].analysis = currentAnalysisResult;
                                }
                                
                                // Save back to localStorage
                                localStorage.setItem('interviewHistory', JSON.stringify(savedInterviews));
                                
                                document.getElementById('analysisResults').innerHTML += '<div class="success-message">✅ Analysis saved successfully to interview history!</div>';
                            } else {
                                document.getElementById('analysisResults').innerHTML += '<div class="error-message">❌ Could not find interview in history to save analysis</div>';
                            }
                        } catch (error) {
                            document.getElementById('analysisResults').innerHTML += '<div class="error-message">❌ Error saving analysis: ' + error.message + '</div>';
                        }
                    }
                </script>
            </body>
            </html>
        `);
        
        this.showStatus('Analysis window opened', 'success');
    }

    getDefaultAnalysisPrompt(sessionData) {
        if (!sessionData) {
            return 'Please provide a detailed analysis of this interview session.';
        }

        // Handle both old and new formats
        const students = sessionData.students || [];
        const questions = sessionData.questions || [];
        
        const studentNames = students.join(', ') || 'Students';
        const isMultiQuestion = questions.length > 1;
        
        if (isMultiQuestion) {
            // Multi-question session prompt
            const questionsList = questions.map((q, i) => `${i + 1}. ${q.question || `Question ${i + 1}`}`).join('\\n');
            
            return `You are an AI feedback assistant reviewing a complete multi-question group interview session.

**SESSION OVERVIEW:**
- Students: ${studentNames}
- Total Questions: ${questions.length}
- Questions Covered:
${questionsList}

**COMPREHENSIVE ANALYSIS FOCUS:**
Provide detailed feedback on the complete session, including:

🔹 **Individual Student Analysis:**
For each student across all questions:
- Overall communication clarity and confidence throughout the session
- Quality of their argument structure (PEEL: Point, Explanation, Evidence, Link)
- Use of collaborative communication (building on others' ideas)
- Consistency and growth across different questions
- Leadership moments and initiative-taking
- Listening skills and responsiveness to others

🔹 **Group Dynamics Analysis:**
- How well the group worked together across all questions
- Quality of collaboration and idea-building throughout the session
- Turn-taking patterns and inclusive participation
- How ideas developed and connected across different topics
- Conflict resolution and consensus building moments
- Overall group cohesion and collective problem-solving

🔹 **Question-by-Question Assessment:**
- How well the group addressed each specific question
- Whether responses were appropriate to each question's complexity
- Topics that generated the most engagement vs. those that didn't
- How the group's understanding evolved from question to question
- Missed opportunities for deeper discussion on specific topics

🔹 **Session Quality & Learning Outcomes:**
- Evidence of critical thinking and reasoning development
- Examples of students challenging each other constructively
- Moments of genuine learning and insight
- Areas where the discussion was particularly strong
- Overall learning progression and engagement patterns

**EVALUATION CRITERIA:**

🟢 **Collaborative Communication**
• Used collaborative signposting phrases across questions?
• Consistently referred to and built upon teammates' ideas?
• Promoted shared ownership of discussions?
• Maintained respectful and inclusive dialogue throughout?

🔵 **Argument Quality (PEEL Structure)**
• Points were clear, relevant, and directly addressed questions?
• Explanations were well-developed and logical?
• Evidence/examples were appropriate for each question type?
• Links tied back to questions and broader discussion themes?

🟣 **Session Engagement & Growth**
• Students demonstrated sustained engagement across all questions?
• Evidence of learning and perspective development?
• Appropriate depth for each question's complexity?
• Meaningful connections made between different questions?

**OUTPUT FORMAT:**
Provide comprehensive, student-friendly feedback with specific examples from across the session and actionable recommendations for future group discussions.

**IMPORTANT CONTEXT:**
- This transcript comes from speech-to-text, so names/words may be imperfectly transcribed
- Use the provided student names to correct any misidentified speakers
- Consider the complete session arc when evaluating individual and group performance
- Focus on both individual growth and collective learning outcomes`;
        } else {
            // Single question session prompt
            const question = questions[0]?.question || 'Interview Question';
            
            return `You are an AI feedback assistant reviewing a single-question group interview session.

**SESSION OVERVIEW:**
- Students: ${studentNames}
- Question: "${question}"

**ANALYSIS FOCUS:**
Provide focused feedback on how well the group addressed this specific question, including:

🔹 **Individual Student Responses:**
For each student who responded to this question:
- How well they addressed the specific question asked
- Quality of their argument structure (PEEL: Point, Explanation, Evidence, Link)
- Use of collaborative communication (building on others' ideas)
- Relevance and depth of their response to this particular question
- Specific suggestions for improvement with example improved responses

🔹 **Group Dynamics for This Question:**
- How well the group collectively addressed the question
- Quality of collaboration and idea-building for this specific topic
- Whether the discussion stayed on-topic and relevant
- How ideas developed and connected throughout responses to this question

🔹 **Question-Specific Assessment:**
- Did the group fully address what was asked?
- Were responses appropriate to the question's complexity and scope?
- What aspects of the question were well-covered vs. missed?
- How could the group better approach this type of question in future?

**EVALUATION CRITERIA:**

🟢 Collaborative Communication
• Used collaborative signposting phrases?
• Referred to and built upon teammates' ideas?
• Promoted shared ownership of the discussion?
• Maintained respectful and inclusive dialogue?

🔵 Quality of Argument (PEEL)
• Point – Clear, relevant, and directly addresses the question?
• Explanation – Reasoning well-developed and logical?
• Evidence/Example – Appropriate support provided for the specific question?
• Link – Tied back to the question and broader discussion themes?

🟣 Question Responsiveness
• Directly addressed what was asked in each question?
• Demonstrated understanding of the question's intent?
• Provided depth appropriate to the question's complexity?
• Connected responses meaningfully across different questions?

**OUTPUT FORMAT:**
Provide clear, student-friendly feedback with specific examples and actionable suggestions for improvement.

**IMPORTANT CONTEXT:**
- This transcript comes from speech-to-text, so names/words may be imperfectly transcribed
- Use the provided student names (${studentNames}) to correct any misidentified speakers`;
        }
    }

    toggleSection(sectionId) {
        const section = document.getElementById(sectionId);
        const toggleBtn = document.querySelector(`[onclick="historyManager.toggleSection('${sectionId}')"]`);
        const icon = toggleBtn.querySelector('i');
        
        if (section.style.display === 'none') {
            section.style.display = 'block';
            icon.className = 'fas fa-chevron-down';
            toggleBtn.classList.add('active');
        } else {
            section.style.display = 'none';
            icon.className = 'fas fa-chevron-right';
            toggleBtn.classList.remove('active');
        }
    }

    clearPrompt(id) {
        const promptTextarea = document.getElementById(`customPrompt-${id}`);
        promptTextarea.value = '';
        promptTextarea.focus();
    }

    toggleCustomAnalysis(id) {
        const customAnalysisSection = document.getElementById(`custom-analysis-${id}`);
        const toggleBtn = document.querySelector(`[onclick="historyManager.toggleCustomAnalysis('${id}')"]`);
        
        if (customAnalysisSection.style.display === 'none') {
            customAnalysisSection.style.display = 'block';
            toggleBtn.innerHTML = `<i class="fas fa-times"></i> Hide Analysis`;
            toggleBtn.classList.remove('btn-success');
            toggleBtn.classList.add('btn-outline');
        } else {
            customAnalysisSection.style.display = 'none';
            toggleBtn.innerHTML = `<i class="fas fa-brain"></i> Run Analysis`;
            toggleBtn.classList.remove('btn-outline');
            toggleBtn.classList.add('btn-success');
        }
    }

    loadQuickPrompt(id, type) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview || !interview.fullSessionData) return;
        
        const sessionData = interview.fullSessionData;
        const promptTextarea = document.getElementById(`customPrompt-${id}`);
        const studentNames = sessionData.students.join(', ');
        const questionsList = sessionData.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\\n');
        
        let prompt = '';
        
        switch(type) {
            case 'collaboration':
                prompt = `Analyze the collaborative dynamics in this group interview session.

**Focus Areas:**
- How students build on each other's ideas
- Turn-taking and inclusive participation
- Conflict resolution and consensus building
- Supportive vs. competitive behaviors
- Group cohesion and collective problem-solving

**Students:** ${studentNames}
**Questions:** 
${questionsList}

Provide specific examples and actionable recommendations for improving group collaboration.`;
                break;
            case 'individual':
                prompt = `Provide individual assessments for each student in this group interview.

**Assessment Criteria:**
- Communication clarity and confidence
- Critical thinking and reasoning
- Contribution quality and frequency
- Leadership and initiative
- Listening and responsiveness to others

**Students:** ${studentNames}
**Questions:** 
${questionsList}

Give each student specific feedback with strengths, areas for growth, and personalized recommendations.`;
                break;
            case 'improvement':
                prompt = `Identify key areas for improvement in this group interview session.

**Analysis Focus:**
- Gaps in understanding or knowledge
- Missed opportunities for deeper discussion
- Communication barriers or inefficiencies
- Underdeveloped arguments or reasoning
- Areas where students could challenge each other more

**Students:** ${studentNames}
**Questions:** 
${questionsList}

Provide concrete strategies and activities to address these improvement areas.`;
                break;
            case 'strengths':
                prompt = `Highlight the strengths and positive aspects of this group interview session.

**Strength Categories:**
- Excellent examples of collaboration
- Strong individual contributions
- Creative or insightful responses
- Effective communication strategies
- Positive group dynamics
- Evidence of learning and growth

**Students:** ${studentNames}
**Questions:** 
${questionsList}

Celebrate what worked well and provide encouragement for continued development.`;
                break;
        }
        
        promptTextarea.value = prompt;
    }

    async runCustomAnalysis(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        // Handle both old single-question format and new multi-question session format
        const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
        let sessionData, fullConversation;
        
        if (isNewFormat) {
            // New multi-question session format
            sessionData = interview.fullSessionData || interview;
            
            // Prepare session transcript
            fullConversation = '';
            if (sessionData.questions) {
                sessionData.questions.forEach((questionData, qIndex) => {
                    fullConversation += `\n\n=== QUESTION ${qIndex + 1}: ${questionData.question} ===\n\n`;
                    
                    if (questionData.transcription) {
                        questionData.transcription
                            .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
                            .forEach(entry => {
                                fullConversation += `${entry.speaker}: ${entry.text}\n\n`;
                            });
                    }
                });
            }
        } else {
            // Legacy single-question format
            sessionData = {
                students: interview.students || [],
                questions: [{
                    question: interview.question || 'Interview Question',
                    transcription: interview.transcription || []
                }]
            };
            
            // Prepare legacy transcript
            fullConversation = `=== QUESTION: ${sessionData.questions[0].question} ===\n\n`;
            if (sessionData.questions[0].transcription) {
                sessionData.questions[0].transcription
                    .filter(entry => entry.text && entry.text.trim())
                    .forEach(entry => {
                        fullConversation += `${entry.speaker}: ${entry.text}\n\n`;
                    });
            }
        }

        const promptTextarea = document.getElementById(`customPrompt-${id}`);
        const resultsDiv = document.getElementById(`customAnalysisResults-${id}`);
        const prompt = promptTextarea.value.trim();
        
        if (!prompt) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div class="error-message">⚠️ Please enter an analysis prompt</div>';
            return;
        }

        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Analyzing session...</div>';

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    conversation: fullConversation,
                    question: isNewFormat ? sessionData.questions.map(q => q.question).join(' | ') : sessionData.questions[0].question,
                    studentNames: sessionData.students,
                    timestamp: new Date().toISOString(),
                    sessionId: sessionData.sessionId || id,
                    totalQuestions: sessionData.questions.length
                })
            });

            const result = await response.json();

            if (result.success) {
                // Auto-save the analysis
                const savedInterviews = this.getSavedInterviews();
                const interviewIndex = savedInterviews.findIndex(i => i.id === id);
                
                if (interviewIndex !== -1) {
                    const interview = savedInterviews[interviewIndex];
                    
                    // Initialize analysis history if it doesn't exist
                    if (!interview.analysisHistory) {
                        interview.analysisHistory = [];
                    }
                    
                    // Create new analysis entry
                    const newAnalysis = {
                        id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        analysis: result.analysis,
                        prompt: prompt,
                        timestamp: new Date().toISOString(),
                        questions: sessionData.questions ? sessionData.questions.map(q => q.question) : [sessionData.question || 'Interview Question']
                    };
                    
                    // Add to analysis history
                    interview.analysisHistory.push(newAnalysis);
                    
                    // Update with latest analysis (for backward compatibility)
                    if (interview.fullSessionData) {
                        interview.fullSessionData.analysis = result.analysis;
                        interview.fullSessionData.analysisTimestamp = new Date().toISOString();
                        interview.fullSessionData.analysisPrompt = prompt;
                        interview.fullSessionData.state = 'analyzed';
                        interview.fullSessionData.totalAnalyses = interview.analysisHistory.length;
                    } else {
                        // For legacy format, add analysis directly
                        interview.analysis = result.analysis;
                        interview.analysisTimestamp = new Date().toISOString();
                        interview.analysisPrompt = prompt;
                        interview.totalAnalyses = interview.analysisHistory.length;
                    }
                    
                    // Save to localStorage
                    this.saveInterviewsToStorage(savedInterviews);
                    
                    console.log(`✅ Analysis #${interview.analysisHistory.length} saved for session ${id}`);
                }

                const htmlContent = this.convertMarkdownToHtml(result.analysis);
                const timestamp = new Date().toLocaleString();
                
                resultsDiv.innerHTML = `
                    <div class="analysis-header">
                        <div class="analysis-title">
                            <h5><i class="fas fa-lightbulb"></i> New Analysis Results</h5>
                            <div class="analysis-meta">
                                <span class="analysis-timestamp"><i class="fas fa-clock"></i> ${timestamp}</span>
                                <span class="auto-saved-indicator"><i class="fas fa-check-circle"></i> Auto-saved</span>
                            </div>
                        </div>
                        <div class="analysis-export-actions">
                            <button class="btn btn-sm btn-primary" onclick="historyManager.exportCurrentAnalysisAsWord('${id}', '${result.analysis.replace(/'/g, "\\'")}')">
                                <i class="fas fa-file-word"></i> Export RTF
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="historyManager.copyCurrentAnalysisToClipboard('${result.analysis.replace(/'/g, "\\'")}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="analysis-content">${htmlContent}</div>
                `;
                
                // Refresh the page to show updated status
                setTimeout(() => {
                    this.loadHistory();
                }, 1000);
                
            } else {
                resultsDiv.innerHTML = '<div class="error-message">❌ Analysis failed: ' + (result.error || 'Unknown error') + '</div>';
            }
        } catch (error) {
            resultsDiv.innerHTML = '<div class="error-message">❌ Network Error: ' + error.message + '</div>';
        }
    }

    saveCustomAnalysisToHistory(id, analysisText) {
        try {
            const savedInterviews = this.getSavedInterviews();
            const interviewIndex = savedInterviews.findIndex(i => i.id === id);
            
            if (interviewIndex !== -1) {
                // Update the interview with the new analysis
                if (savedInterviews[interviewIndex].fullSessionData) {
                    savedInterviews[interviewIndex].fullSessionData.analysis = analysisText;
                    savedInterviews[interviewIndex].fullSessionData.state = 'analyzed';
                } else {
                    savedInterviews[interviewIndex].analysis = analysisText;
                }
                
                // Save back to localStorage
                this.saveInterviewsToStorage(savedInterviews);
                
                // Update the display
                this.loadHistory();
                
                this.showStatus('✅ Custom analysis saved successfully to interview history!', 'success');
            } else {
                this.showStatus('❌ Could not find interview in history to save analysis', 'error');
            }
        } catch (error) {
            console.error('Error saving custom analysis:', error);
            this.showStatus('❌ Error saving analysis: ' + error.message, 'error');
        }
    }

    showDeleteConfirmation(id) {
        this.currentDeleteId = id;
        this.deleteModal.style.display = 'flex';
    }

    hideDeleteModal() {
        this.deleteModal.style.display = 'none';
        this.currentDeleteId = null;
    }

    confirmDelete() {
        if (!this.currentDeleteId) return;
        
        const interviews = this.getSavedInterviews();
        const filteredInterviews = interviews.filter(i => i.id !== this.currentDeleteId);
        
        this.saveInterviewsToStorage(filteredInterviews);
        this.loadHistory();
        this.updateCount();
        this.hideDeleteModal();
        
        this.showStatus('Interview deleted successfully', 'success');
    }

    showClearAllConfirmation() {
        if (confirm('Are you sure you want to delete ALL saved interviews? This action cannot be undone.')) {
            localStorage.removeItem('interviewHistory');
            this.loadHistory();
            this.updateCount();
            this.showStatus('All interview history cleared', 'success');
        }
    }

    updateCount() {
        const interviews = this.getSavedInterviews();
        const count = interviews.length;
        
        if (this.interviewCount) {
            this.interviewCount.textContent = `${count} interview${count !== 1 ? 's' : ''} saved`;
        }
        
        // Show/hide clear all button
        if (this.clearAllBtn) {
            this.clearAllBtn.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    }

    showEmptyState() {
        if (this.historyContainer) {
            this.historyContainer.style.display = 'none';
        }
        if (this.emptyState) {
            this.emptyState.style.display = 'block';
        }
    }

    hideEmptyState() {
        if (this.historyContainer) {
            this.historyContainer.style.display = 'block';
        }
        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }
    }

    // Utility methods
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatFileDate(timestamp) {
        const date = new Date(timestamp);
        return date.toISOString().split('T')[0] + '_' + date.toTimeString().split(' ')[0].replace(/:/g, '-');
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

    showStatus(message, type) {
        if (this.statusMessage) {
            this.statusMessage.textContent = message;
            this.statusMessage.className = `status-message ${type} show`;
            
            setTimeout(() => {
                if (this.statusMessage) {
                    this.statusMessage.classList.remove('show');
                }
            }, 4000);
        }
    }

    convertMarkdownToHtml(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // Convert tables first (before other conversions)
        html = html.replace(/\|(.+)\|/g, (match, content) => {
            // This is a table row
            const cells = content.split('|').map(cell => cell.trim());
            return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
        });
        
        // Wrap table rows in table tags
        html = html.replace(/(<tr>.*<\/tr>)/s, '<table class="analysis-table">$1</table>');
        
        // Fix multiple consecutive table rows
        html = html.replace(/<\/table>\s*<table class="analysis-table">/g, '');
        
        // Convert headers
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // Convert bold and italic
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert bullet points
        html = html.replace(/^[•*-] (.*$)/gim, '<li>$1</li>');
        
        // Convert numbered lists
        html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
        
        // Wrap consecutive list items in ul/ol tags
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Convert line breaks and paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        
        // Wrap in paragraphs
        html = '<p>' + html + '</p>';
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p><br><\/p>/g, '');
        
        // Fix nested lists
        html = html.replace(/<\/ul>\\s*<ul>/g, '');
        html = html.replace(/<\/ol>\\s*<ol>/g, '');
        
        // Clean up table formatting
        html = html.replace(/<p><table/g, '<table');
        html = html.replace(/<\/table><\/p>/g, '</table>');
        
        return html;
    }

    hasAnalysis(interview) {
        return (interview.analysisHistory && interview.analysisHistory.length > 0) || 
               interview.analysis || 
               (interview.fullSessionData && interview.fullSessionData.analysis);
    }

    getAnalysisCount(interview) {
        if (interview.analysisHistory && interview.analysisHistory.length > 0) {
            return interview.analysisHistory.length;
        }
        // Fallback for backward compatibility
        if (interview.analysis || (interview.fullSessionData && interview.fullSessionData.analysis)) {
            return 1;
        }
        return 0;
    }

    getLatestAnalysisDate(interview) {
        if (interview.analysisHistory && interview.analysisHistory.length > 0) {
            const latestAnalysis = interview.analysisHistory[interview.analysisHistory.length - 1];
            return this.formatDate(latestAnalysis.timestamp);
        }
        // Fallback for backward compatibility
        if (interview.fullSessionData && interview.fullSessionData.analysisTimestamp) {
            return this.formatDate(interview.fullSessionData.analysisTimestamp);
        }
        if (interview.analysisTimestamp) {
            return this.formatDate(interview.analysisTimestamp);
        }
        return 'N/A';
    }

    toggleAnalysisExpansion(id, analysisType) {
        const fullAnalysisContent = document.getElementById(`full-analysis-${id}-${analysisType}`);
        const previewContent = document.querySelector(`.analysis-content-preview[onclick="historyManager.toggleAnalysisExpansion('${id}', '${analysisType}')"]`);
        const expandBtn = previewContent.querySelector('.expand-btn');

        if (fullAnalysisContent.style.display === 'none') {
            fullAnalysisContent.style.display = 'block';
            expandBtn.innerHTML = '<i class="fas fa-compress"></i> Show Less';
        } else {
            fullAnalysisContent.style.display = 'none';
            expandBtn.innerHTML = '<i class="fas fa-expand"></i> Show Full';
        }
    }

    exportAnalysisAsWord(id, analysisType) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview || !interview.fullSessionData) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        const analysisText = analysisType === 'latest' ? interview.analysis || interview.fullSessionData.analysis : interview.fullSessionData.analysis;
        
        if (!analysisText) {
            this.showStatus('No analysis text available to export', 'error');
            return;
        }

        const htmlContent = this.convertMarkdownToHtml(analysisText);
        
        const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analysis-${this.formatFileDate(interview.timestamp || interview.savedAt)}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showStatus('Analysis exported as Word document!', 'success');
    }

    copyAnalysisToClipboard(id, analysisType) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview || !interview.fullSessionData) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        const analysisText = analysisType === 'latest' ? interview.analysis || interview.fullSessionData.analysis : interview.fullSessionData.analysis;
        
        if (!analysisText) {
            this.showStatus('No analysis text available to copy', 'error');
            return;
        }

        navigator.clipboard.writeText(analysisText).then(() => {
            this.showStatus('Analysis copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy analysis to clipboard:', err);
            this.showStatus('Failed to copy analysis to clipboard.', 'error');
        });
    }

    exportCurrentAnalysisAsWord(id, analysisText) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

        // Convert markdown to plain text for RTF
        const plainText = this.convertMarkdownToPlainText(analysisText);
        
        // Create RTF document
        const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
{\\b\\fs28 Interview Analysis Report}\\par
\\par
{\\b Session:} ${interview.fullSessionData ? interview.fullSessionData.students.join(', ') : 'N/A'}\\par
{\\b Date:} ${this.formatDate(interview.timestamp || interview.savedAt)}\\par
{\\b Analysis Date:} ${new Date().toLocaleString()}\\par
\\par
{\\line}\\par
\\par
${plainText.replace(/\n/g, '\\par\n')}
}`;
        
        const blob = new Blob([rtfContent], { type: 'application/rtf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analysis-${this.formatFileDate(interview.timestamp || interview.savedAt)}.rtf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showStatus('Analysis exported as RTF document!', 'success');
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

    copyCurrentAnalysisToClipboard(analysisText) {
        navigator.clipboard.writeText(analysisText).then(() => {
            this.showStatus('Analysis copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy analysis to clipboard:', err);
            this.showStatus('Failed to copy analysis to clipboard.', 'error');
        });
    }

    generateAnalysisHistoryItems(interview) {
        const analyses = [];
        
        // Get analyses from the new analysisHistory array
        if (interview.analysisHistory && interview.analysisHistory.length > 0) {
            interview.analysisHistory.forEach((analysisItem, index) => {
                analyses.push({
                    analysis: analysisItem.analysis,
                    timestamp: analysisItem.timestamp,
                    prompt: analysisItem.prompt,
                    questions: analysisItem.questions || [],
                    type: `history-${index}`,
                    id: analysisItem.id
                });
            });
        } else {
            // Fallback for backward compatibility - get the main analysis
            const mainAnalysis = interview.analysis || (interview.fullSessionData && interview.fullSessionData.analysis);
            const mainTimestamp = interview.analysisTimestamp || (interview.fullSessionData && interview.fullSessionData.analysisTimestamp);
            const mainPrompt = interview.analysisPrompt || (interview.fullSessionData && interview.fullSessionData.analysisPrompt);
            
            if (mainAnalysis) {
                // Get questions for context
                let questions = [];
                if (interview.fullSessionData && interview.fullSessionData.questions) {
                    questions = interview.fullSessionData.questions.map(q => q.question);
                } else if (interview.question) {
                    questions = [interview.question];
                }
                
                analyses.push({
                    analysis: mainAnalysis,
                    timestamp: mainTimestamp || interview.timestamp,
                    prompt: mainPrompt || 'Default analysis prompt',
                    questions: questions,
                    type: 'main',
                    id: 'main-analysis'
                });
            }
        }
        
        if (analyses.length === 0) {
            return '<div class="no-analyses">No previous analyses found.</div>';
        }
        
        // Sort analyses by timestamp (newest first)
        analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return analyses.map((analysisItem, index) => `
            <div class="analysis-item">
                <div class="analysis-item-header">
                    <h6><i class="fas fa-brain"></i> Analysis ${analyses.length - index} - ${this.formatDate(analysisItem.timestamp)}</h6>
                    <div class="analysis-actions">
                        <button class="btn btn-sm btn-outline" onclick="historyManager.togglePromptReveal('${interview.id}', '${analysisItem.type}')">
                            <i class="fas fa-eye"></i> Show Prompt
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="historyManager.toggleQuestionsReveal('${interview.id}', '${analysisItem.type}')">
                            <i class="fas fa-question-circle"></i> Show Questions
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="historyManager.exportAnalysisAsWord('${interview.id}', '${analysisItem.type}')">
                            <i class="fas fa-file-word"></i> Export RTF
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="historyManager.copyAnalysisToClipboard('${interview.id}', '${analysisItem.type}')">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
                
                <!-- Prompt Revelation Section -->
                <div id="prompt-reveal-${interview.id}-${analysisItem.type}" class="prompt-reveal" style="display: none;">
                    <div class="prompt-content">
                        <h7><i class="fas fa-question-circle"></i> Analysis Prompt Used:</h7>
                        <div class="prompt-text">${this.escapeHtml(analysisItem.prompt)}</div>
                    </div>
                </div>
                
                <!-- Questions Revelation Section -->
                <div id="questions-reveal-${interview.id}-${analysisItem.type}" class="prompt-reveal" style="display: none;">
                    <div class="prompt-content">
                        <h7><i class="fas fa-list"></i> Questions Analyzed:</h7>
                        <div class="questions-list">
                            ${analysisItem.questions.map((q, qIndex) => `
                                <div class="question-item">
                                    <strong>Q${qIndex + 1}:</strong> ${this.escapeHtml(q)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="full-analysis-content" style="display: block;">
                    ${analysisItem.hasPrompt ? `
                        <div class="analysis-prompt-section">
                            <h4><i class="fas fa-question-circle"></i> Analysis Prompt Used:</h4>
                            <div class="analysis-prompt-text">${this.escapeHtml(analysisItem.prompt)}</div>
                        </div>
                        <div class="analysis-divider"></div>
                    ` : ""}
                    <div class="analysis-response-section">
                        <h4><i class="fas fa-brain"></i> AI Analysis Response:</h4>
                        <div class="analysis-response-text">${this.convertMarkdownToHtml(analysisItem.analysis)}</div>
                    </div>
                </div>                    ${this.convertMarkdownToHtml(analysisItem.analysis)}
                </div>
            </div>
        `).join('');
    }

    togglePromptReveal(id, analysisType) {
        const promptDiv = document.getElementById(`prompt-reveal-${id}-${analysisType}`);
        const button = event.target.closest('button');
        
        if (promptDiv.style.display === 'none') {
            promptDiv.style.display = 'block';
            button.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Prompt';
        } else {
            promptDiv.style.display = 'none';
            button.innerHTML = '<i class="fas fa-eye"></i> Show Prompt';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleQuestionsReveal(id, analysisType) {
        const questionsDiv = document.getElementById(`questions-reveal-${id}-${analysisType}`);
        const button = event.target.closest('button');
        
        if (questionsDiv.style.display === 'none') {
            questionsDiv.style.display = 'block';
            button.innerHTML = '<i class="fas fa-question-circle"></i> Hide Questions';
        } else {
            questionsDiv.style.display = 'none';
            button.innerHTML = '<i class="fas fa-question-circle"></i> Show Questions';
        }
    }

    saveQuestionEdit(interviewId, questionIndex) {
        const questionTextarea = document.getElementById(`question-${interviewId}-${questionIndex}`);
        const newQuestionText = questionTextarea.value.trim();
        
        if (!newQuestionText) {
            this.showStatus('Question cannot be empty', 'error');
            return;
        }

        const interviews = this.getSavedInterviews();
        const interviewIndex = interviews.findIndex(i => i.id === interviewId);

        if (interviewIndex !== -1) {
            const interview = interviews[interviewIndex];
            const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
            
            let questionUpdated = false;
            
            if (isNewFormat) {
                // New multi-question session format
                const sessionData = interview.fullSessionData;
                if (sessionData && sessionData.questions && sessionData.questions[questionIndex]) {
                    sessionData.questions[questionIndex].question = newQuestionText;
                    sessionData.questions[questionIndex].lastEdited = new Date().toISOString();
                    questionUpdated = true;
                }
            } else {
                // Legacy single-question format
                if (questionIndex === 0) {
                    interview.question = newQuestionText;
                    interview.lastEdited = new Date().toISOString();
                    questionUpdated = true;
                }
            }
            
            if (questionUpdated) {
                // Mark interview as edited
                interview.autoSaved = true;
                interview.lastModified = new Date().toISOString();
                
                // Save to localStorage
                this.saveInterviewsToStorage(interviews);
                
                // Show success feedback
                this.showStatus(`Question updated successfully`, 'success');
                const statusDiv = document.getElementById(`edit-status-${interviewId}-${questionIndex}`);
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 2000);
                }
                
                console.log(`✅ Question ${questionIndex + 1} updated for interview ${interviewId}: "${newQuestionText}"`);
            } else {
                this.showStatus('Error: Question data not found', 'error');
            }
        } else {
            this.showStatus('Error: Interview not found', 'error');
        }
    }

    handleQuestionKeydown(event, interviewId, questionIndex) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent default newline
            this.saveQuestionEdit(interviewId, questionIndex);
        }
    }
}

// Initialize the history manager when DOM is loaded
let historyManager;
document.addEventListener('DOMContentLoaded', () => {
    historyManager = new InterviewHistoryManager();
}); 