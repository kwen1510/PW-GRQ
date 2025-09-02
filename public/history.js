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
            this.currentAnalysisId = null;
            this.prompts = [];
            this.selectedPrompt = null;
            this.activePromptId = null;
            
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
        card.setAttribute('data-interview-id', interview.id);
        
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
                    <i class="fas fa-file-csv"></i> Export CSV
                </button>
                <button class="btn btn-success action-btn" onclick="historyManager.openPromptModal('${interview.id}')">
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
                        <i class="fas fa-check-circle"></i> Analysis Available
                    </div>
                    <p class="status-description">
                        You can run additional analyses with different prompts and approaches.
                    </p>
                ` : `
                    <div class="status-badge not-analyzed">
                        <i class="fas fa-brain"></i> Ready for Analysis
                    </div>
                    <p class="status-description">This session is ready for analysis. All analyses will be automatically saved.</p>
                `}
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


                
                <div class="question-transcripts">
                    ${questionsData.map((questionData, qIndex) => `
                        <div class="question-transcript-card">
                            <div class="question-transcript-header">
                                <div class="question-info">
                                    <h4><i class="fas fa-question-circle"></i> Question ${qIndex + 1}</h4>
                                    <div class="question-text-display" id="questionTextDisplay-${interview.id}-${qIndex}">
                                        ${questionData.question || `Question ${qIndex + 1}`}
                                </div>
                                <textarea 
                                        class="question-text-edit" 
                                        id="questionTextEdit-${interview.id}-${qIndex}"
                                        style="display: none;"
                                    rows="2"
                                    placeholder="Enter question text..."
                                >${questionData.question || `Question ${qIndex + 1}`}</textarea>
                                </div>
                                <div class="question-header-buttons">
                                    <button class="btn btn-outline btn-sm" onclick="historyManager.toggleQuestionEdit('${interview.id}', ${qIndex})">
                                        <i class="fas fa-pen"></i> Edit Question
                                    </button>
                                    <button class="btn btn-outline btn-sm" onclick="historyManager.toggleQuestionTranscriptEdit('${interview.id}', ${qIndex})">
                                        <i class="fas fa-pen"></i> Edit Transcript
                                    </button>
                                </div>
                            </div>
                            
                            <div class="question-transcript-display" id="questionTranscriptDisplay-${interview.id}-${qIndex}">
                                ${this.formatQuestionTranscription(questionData.transcription)}
                            </div>
                            
                            <textarea 
                                id="questionTranscriptEditor-${interview.id}-${qIndex}" 
                                class="question-transcript-textarea"
                                rows="8" 
                                placeholder="Edit transcript for Question ${qIndex + 1}..." 
                                style="display:none;"
                            >${this.buildQuestionTranscriptText(questionData)}</textarea>
                            
                            <div class="question-transcript-actions" id="questionTranscriptActions-${interview.id}-${qIndex}" style="display:none;">
                                <button class="btn btn-primary" onclick="historyManager.saveQuestionTranscript('${interview.id}', ${qIndex})">
                                    <i class="fas fa-save"></i> Save
                                </button>
                                <button class="btn btn-outline" onclick="historyManager.cancelQuestionTranscriptEdit('${interview.id}', ${qIndex})">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${this.renderAnalysisSection(interview)}
                    </div>
        `;
        
        return card;
    }

    hasAnalysis(interview) {
        return (interview.analyses && interview.analyses.length > 0) || 
               interview.analysis || 
               (interview.fullSessionData && interview.fullSessionData.analysis);
    }

    getAnalysisCount(interview) {
        if (interview.analyses && Array.isArray(interview.analyses)) {
            return interview.analyses.length;
        }
        if (interview.analysis || (interview.fullSessionData && interview.fullSessionData.analysis)) {
            return 1;
        }
        return 0;
    }

    getLatestAnalysisDate(interview) {
        let latestTimestamp = null;
        
        if (interview.analyses && interview.analyses.length > 0) {
            // Find the most recent analysis
            const sortedAnalyses = interview.analyses.sort((a, b) => 
                new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
            );
            latestTimestamp = sortedAnalyses[0].timestamp;
        } else if (interview.analysis && typeof interview.analysis === 'object' && interview.analysis.timestamp) {
            latestTimestamp = interview.analysis.timestamp;
        } else if (interview.latestAnalysis && interview.latestAnalysis.timestamp) {
            latestTimestamp = interview.latestAnalysis.timestamp;
        }
        
        if (latestTimestamp) {
            return this.formatDate(latestTimestamp);
        }
        
        return 'N/A';
    }

        renderAnalysisSection(interview) {
        // Check for analyses array (new format) or legacy single analysis
        let analyses = [];
        
        if (interview.analyses && Array.isArray(interview.analyses)) {
            analyses = interview.analyses;
            console.log('✅ Found analyses array with', analyses.length, 'analyses');
        } else if (interview.analysis) {
            // Legacy single analysis - convert to array format
            if (typeof interview.analysis === 'object' && interview.analysis.result) {
                analyses = [{
                    ...interview.analysis,
                    index: interview.analysis.index || 1
                }];
            } else if (typeof interview.analysis === 'string') {
                analyses = [{
                    id: 'legacy',
                    index: 1,
                    result: interview.analysis,
                    prompt: null,
                    timestamp: null
                }];
            }
            console.log('✅ Converted legacy analysis to array format');
        }

        if (analyses.length === 0) {
            console.log('❌ No analysis data found for interview:', interview.id);
            return '';
        }
        
        console.log('✅ Rendering', analyses.length, 'analyses for interview:', interview.id);

        // Sort analyses by timestamp (newest first)
        const sortedAnalyses = analyses.sort((a, b) => 
            new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
        );

        return `
            <div class="analyses-section" id="analyses-${interview.id}">
                <div class="analyses-header">
                    <h4><i class="fas fa-chart-line"></i> Analysis Results (${analyses.length})</h4>
                    ${analyses.length > 1 ? `
                        <button class="btn btn-sm btn-outline" onclick="historyManager.toggleAllAnalyses('${interview.id}')">
                            <i class="fas fa-list"></i> Show All Analyses
                        </button>
                    ` : ''}
                </div>
                
                ${sortedAnalyses.map((analysis, index) => `
                    <div class="analysis-result ${index > 0 ? 'analysis-hidden' : ''}" id="analysis-result-${interview.id}-${analysis.id}">
                        <div class="analysis-header">
                            <h5><i class="fas fa-chart-line"></i> Analysis ${index === 0 ? `#${analysis.index || (analyses.length - index)} (Latest)` : `#${analysis.index || (analyses.length - index)}`}</h5>
                            <div class="analysis-controls">
                                ${analysis.prompt ? `
                                    <button class="btn btn-sm btn-outline toggle-prompt-btn" onclick="historyManager.togglePromptDisplay('${interview.id}', '${analysis.id}')">
                                        <i class="fas fa-eye"></i> Show Prompt
                                    </button>
                                ` : ''}

                            </div>
                        </div>
                        ${analysis.prompt ? `
                            <div class="analysis-prompt" id="analysis-prompt-${interview.id}-${analysis.id}" style="display: none;">
                                <h6><i class="fas fa-robot"></i> Prompt Used</h6>
                                <div class="prompt-content">${this.escapeHtml(analysis.prompt)}</div>
                            </div>
                        ` : ''}
                        <div class="analysis-content">${this.convertMarkdownToHtml(analysis.result)}</div>
                        ${analysis.timestamp ? `
                            <div class="analysis-meta">
                                <small><i class="fas fa-clock"></i> Generated ${this.formatDate(analysis.timestamp)}</small>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    formatTranscription(transcription) {
        if (!transcription || transcription.length === 0) {
            return '<p class="no-data">No transcription data available</p>';
        }
        
        const filteredTranscription = transcription.filter(entry => entry.text && entry.text.trim());
        let lastSpeaker = null;
        
        return filteredTranscription
            .map((entry, index) => {
                let html = '';
                
                // Add gap between different speakers
                if (lastSpeaker && lastSpeaker !== entry.speaker) {
                    html += '<div class="speaker-gap" style="height: 16px; margin-bottom: 8px;"></div>';
                }
                
                html += `
                <div class="transcript-entry">
                    <div class="transcript-speaker">
                        <i class="fas fa-user"></i> ${entry.speaker}
                    </div>
                    <div class="transcript-text">${entry.text}</div>
                    <div class="transcript-time">${this.formatTime(entry.timestamp)}</div>
                </div>
                `;
                
                lastSpeaker = entry.speaker;
                return html;
            }).join('');
    }

    formatQuestionTranscription(transcription) {
        if (!transcription || transcription.length === 0) {
            return '<p class="no-data">No transcription data available for this question.</p>';
        }
        
        const filteredTranscription = transcription.filter(entry => entry.text && entry.text.trim());
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

    toggleTranscription(id) {
        const transcriptionDiv = document.getElementById(`transcription-${id}`);
        const viewBtn = document.querySelector(`[onclick="historyManager.toggleTranscription('${id}')"]`);
        
        if (transcriptionDiv.style.display === 'none') {
            transcriptionDiv.style.display = 'block';
            viewBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Details';
            // Load transcript editor contents when opening
            this.loadTranscriptEditor(id);
        } else {
            transcriptionDiv.style.display = 'none';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i> View Details';
        }
    }

    // ===== Transcript Editor (History) =====
    buildFullTranscriptFromInterview(interview) {
        const sessionData = interview.fullSessionData || interview;
        if (!sessionData || !Array.isArray(sessionData.questions)) return '';
        const parts = [];
        sessionData.questions.forEach((q, i) => {
            parts.push(`Question ${i + 1}: ${q.question || ''}`);
            if (Array.isArray(q.transcription)) {
                q.transcription
                    .filter(e => e && e.text && e.text.trim() && !e.isTranscribing)
                    .forEach(e => parts.push(`${e.speaker || 'Speaker'}: ${e.text}`));
            }
            parts.push('');
        });
        return parts.join('\n');
    }

    getTranscriptKeys(id) {
        return {
            currentKey: `transcript_current_${id}`,
            draftKey: `transcript_draft_${id}`,
            archiveKey: `transcript_archive_${id}`,
        };
    }

    loadTranscriptEditor(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        if (!interview) return;

        const textarea = document.getElementById(`transcriptEditor-${id}`);
        const displayDiv = document.getElementById(`transcriptDisplay-${id}`);
        if (!textarea) return;

        const { currentKey, draftKey } = this.getTranscriptKeys(interview.fullSessionData?.sessionId || id);
        const saved = localStorage.getItem(currentKey);
        const draft = localStorage.getItem(draftKey);
        const base = this.buildFullTranscriptFromInterview(interview);
        const value = saved || draft || base;
        textarea.value = value;
        if (displayDiv) displayDiv.innerHTML = this.renderTranscriptHtml(value);
    }

    autosaveTranscriptDraft(id) {
        const textarea = document.getElementById(`transcriptEditor-${id}`);
        if (!textarea) return;
        const keyId = this.getKeyIdFromInterview(id);
        const { draftKey } = this.getTranscriptKeys(keyId);
        localStorage.setItem(draftKey, textarea.value);
        this.showStatus('Draft autosaved', 'success');
    }

    saveEditedTranscript(id) {
        const textarea = document.getElementById(`transcriptEditor-${id}`);
        if (!textarea) return;
        const keyId = this.getKeyIdFromInterview(id);
        const { currentKey, draftKey, archiveKey } = this.getTranscriptKeys(keyId);
        const previous = localStorage.getItem(currentKey) || '';
        const archive = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        archive.push({ timestamp: new Date().toISOString(), text: previous });
        while (archive.length > 20) archive.shift();
        localStorage.setItem(archiveKey, JSON.stringify(archive));
        localStorage.setItem(currentKey, textarea.value);
        localStorage.removeItem(draftKey);
        // Reflect in display and hide editor
        const displayDiv = document.getElementById(`transcriptDisplay-${id}`);
        if (displayDiv) displayDiv.innerHTML = this.renderTranscriptHtml(textarea.value);
        this.hideTranscriptEditor(id);
        this.showStatus('Transcript saved with version history', 'success');
    }

    revertLastTranscriptVersion(id) {
        const textarea = document.getElementById(`transcriptEditor-${id}`);
        if (!textarea) return;
        const keyId = this.getKeyIdFromInterview(id);
        const { currentKey, archiveKey } = this.getTranscriptKeys(keyId);
        const archive = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        if (archive.length === 0) { this.showStatus('No previous versions', 'error'); return; }
        const last = archive.pop();
        const current = localStorage.getItem(currentKey) || '';
        archive.push({ timestamp: new Date().toISOString(), text: current });
        localStorage.setItem(archiveKey, JSON.stringify(archive));
        localStorage.setItem(currentKey, last.text || '');
        textarea.value = last.text || '';
        this.showStatus('Reverted to previous version', 'success');
    }

    getKeyIdFromInterview(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        return interview?.fullSessionData?.sessionId || id;
    }

    renderTranscriptHtml(text) {
        const lines = (text || '').split(/\n+/).filter(Boolean);
        return lines.map((line, idx) => {
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
        }).join('') || '<div class="td-empty">Transcript will appear here...</div>';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    showTranscriptEditor(id) {
        const textarea = document.getElementById(`transcriptEditor-${id}`);
        const actions = document.getElementById(`transcriptActions-${id}`);
        const displayDiv = document.getElementById(`transcriptDisplay-${id}`);
        if (textarea && actions && displayDiv) {
            textarea.style.display = 'block';
            actions.style.display = 'flex';
            displayDiv.style.display = 'none';
        }
    }

    hideTranscriptEditor(id) {
        const textarea = document.getElementById(`transcriptEditor-${id}`);
        const actions = document.getElementById(`transcriptActions-${id}`);
        const displayDiv = document.getElementById(`transcriptDisplay-${id}`);
        if (textarea && actions && displayDiv) {
            textarea.style.display = 'none';
            actions.style.display = 'none';
            displayDiv.style.display = 'block';
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
            
            return `You are an AI feedback assistant reviewing a group oral response transcript. Your task is to provide individualised feedback for each speaker, plus a group-level summary.

**CRITICAL INSTRUCTION: ONLY USE ACTUAL QUOTES FROM THE TRANSCRIPT**
- You must ONLY reference and quote content that actually appears in the provided transcript
- DO NOT create, imagine, or paraphrase responses that weren't actually said
- If you reference a student's response, use their EXACT words in quotes
- If students didn't address certain aspects, state this clearly rather than inventing content

**SESSION OVERVIEW:**
- Students: ${studentNames}
- Total Questions: ${questions.length}
- Questions Covered:
${questionsList}

For each speaker:
- Evaluate their collaborative communication and argumentation (PEEL)
- Provide specific, student-friendly feedback
- Offer a model improved snippet to illustrate a stronger version of part of their response

For the final speaker:
- Additionally assess how well they summarised group points and/or rounded off the response

✅ Evaluation Criteria:

🟢 Collaborative Communication
• Used collaborative signposting? Quote actual phrases used
• Referred to teammates' ideas? Reference specific instances
• Promoted shared ownership? Show real examples

🔵 Quality of Argument (PEEL) - Using Actual Content
• Point – Clear and relevant? Quote actual points made
• Explanation – Reasoning developed? Show actual examples
• Evidence/Example – Support provided? Quote specific evidence
• Link – Tied back to the big idea? Show how they connected

✔ Acceptable content includes:
• Problem severity/significance/trends
• Target group needs
• Causes: perception / motivation / engagement
• Gaps in current measures
• Proposed solution (who, what, where, why)
• Evaluation: strengths, limitations
• Personal experiences

🟣 Final Speaker – Summary/Closure (Extra Criteria)
• Did they accurately summarise key ideas raised by teammates? (quote)
• Did they emphasise the most important/salient points? (reference)
• Did they link back to the original question effectively? (show how)
• Was the language clear, concise, and purpose-driven? (examples)

Example Output Format:

🔹 Speaker A Feedback
"Building on B's point about [quote their point], you explained [quote their explanation]. Your personal example [quote example] added authenticity. However, you could improve the link back to [specific aspect]."

✏️ Suggested Improvement:
"Building on B's point about low awareness, I believe many youths lack motivation due to a disconnect with their everyday needs. For example, when I mentored peers, they often said these topics felt too abstract. This gap highlights why our project must be grounded in daily relevance."

🔹 Speaker B Feedback
"Your point about [quote point] was insightful. However, you missed the chance to show collaboration by referencing A's point. You explained [quote explanation] well but could deepen your argument with research-based evidence."

✏️ Suggested Improvement:
"To extend A's point, while awareness is low, one key reason is that existing talks in schools don't match students' interests. A 2023 survey from REACH shows that only 1 in 3 students found school programmes meaningful. This gap in relevance is what we're addressing."

🔹 Final Speaker Feedback – Summary & Closure
"You summarized by noting [quote their summary]. While you captured [quote successful parts], you missed [note specific missed points]. Your conclusion [quote conclusion] could more effectively link to the question."

✏️ Suggested Improvement:
"To summarise, A highlighted [key point], B discussed [key point], and C proposed [key point]. Bringing these together, our group believes that [clear conclusion linking to question]."

🟢 Group Summary: Collaborative Skills
[Reference actual collaborative phrases used and transitions made]

🔵 Group Summary: Quality of Argument
[Note strongest PEEL elements with examples and areas for improvement]

🟣 Final Speaker Summary Check
[Evaluate summary effectiveness with specific quotes]

Remember: Always use actual quotes from the transcript to support your feedback.`;
        } else {
            // Single question session prompt
            const question = questions[0]?.question || 'Interview Question';
            
            return `You are an AI feedback assistant reviewing a group oral response transcript. Your task is to provide individualised feedback for each speaker, plus a group-level summary.

**CRITICAL INSTRUCTION: ONLY USE ACTUAL QUOTES FROM THE TRANSCRIPT**
- You must ONLY reference and quote content that actually appears in the provided transcript
- DO NOT create, imagine, or paraphrase responses that weren't actually said
- If you reference a student's response, use their EXACT words in quotes
- If students didn't address certain aspects, state this clearly rather than inventing content

**SESSION OVERVIEW:**
- Students: ${studentNames}
- Question: "${question}"

For each speaker:
- Evaluate their collaborative communication and argumentation (PEEL)
- Provide specific, student-friendly feedback
- Offer a model improved snippet to illustrate a stronger version of part of their response

For the final speaker:
- Additionally assess how well they summarised group points and/or rounded off the response

✅ Evaluation Criteria:

🟢 Collaborative Communication
• Used collaborative signposting? Quote actual phrases used
• Referred to teammates' ideas? Reference specific instances
• Promoted shared ownership? Show real examples

🔵 Quality of Argument (PEEL) - Using Actual Content
• Point – Clear and relevant? Quote actual points made
• Explanation – Reasoning developed? Show actual examples
• Evidence/Example – Support provided? Quote specific evidence
• Link – Tied back to the big idea? Show how they connected

✔ Acceptable content includes:
• Problem severity/significance/trends
• Target group needs
• Causes: perception / motivation / engagement
• Gaps in current measures
• Proposed solution (who, what, where, why)
• Evaluation: strengths, limitations
• Personal experiences

🟣 Final Speaker – Summary/Closure (Extra Criteria)
• Did they accurately summarise key ideas raised by teammates? (quote)
• Did they emphasise the most important/salient points? (reference)
• Did they link back to the original question effectively? (show how)
• Was the language clear, concise, and purpose-driven? (examples)

Example Output Format:

🔹 Speaker A Feedback
"Building on B's point about [quote their point], you explained [quote their explanation]. Your personal example [quote example] added authenticity. However, you could improve the link back to [specific aspect]."

✏️ Suggested Improvement:
"Building on B's point about low awareness, I believe many youths lack motivation due to a disconnect with their everyday needs. For example, when I mentored peers, they often said these topics felt too abstract. This gap highlights why our project must be grounded in daily relevance."

🔹 Speaker B Feedback
"Your point about [quote point] was insightful. However, you missed the chance to show collaboration by referencing A's point. You explained [quote explanation] well but could deepen your argument with research-based evidence."

✏️ Suggested Improvement:
"To extend A's point, while awareness is low, one key reason is that existing talks in schools don't match students' interests. A 2023 survey from REACH shows that only 1 in 3 students found school programmes meaningful. This gap in relevance is what we're addressing."

🔹 Final Speaker Feedback – Summary & Closure
"You summarized by noting [quote their summary]. While you captured [quote successful parts], you missed [note specific missed points]. Your conclusion [quote conclusion] could more effectively link to the question."

✏️ Suggested Improvement:
"To summarise, A highlighted [key point], B discussed [key point], and C proposed [key point]. Bringing these together, our group believes that [clear conclusion linking to question]."

🟢 Group Summary: Collaborative Skills
[Reference actual collaborative phrases used and transitions made]

🔵 Group Summary: Quality of Argument
[Note strongest PEEL elements with examples and areas for improvement]

🟣 Final Speaker Summary Check
[Evaluate summary effectiveness with specific quotes]

Remember: Always use actual quotes from the transcript to support your feedback.`;
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

    openPromptModal(id) {
        this.currentAnalysisId = id;
        const modal = document.getElementById('promptModal');
        modal.style.display = 'block';
        
        // Add event listeners for modal interactions
        this.setupPromptModalEventListeners();
        
        // Load saved prompts (simplified version)
        this.loadSavedPrompts();
        
        console.log('Opening prompt modal for interview:', id);
    }

    setupPromptModalEventListeners() {
        // Close modal when clicking backdrop
        const modal = document.getElementById('promptModal');
        const backdrop = modal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.onclick = () => this.closePromptModal();
        }

        // Close button
        const closeBtn = document.getElementById('closePromptBtn');
        if (closeBtn) {
            closeBtn.onclick = () => this.closePromptModal();
        }

        // Run Analysis button
        const chooseBtn = document.getElementById('choosePromptBtn');
        if (chooseBtn) {
            chooseBtn.onclick = () => this.runAnalysisWithPrompt();
        }

        // Other buttons with full functionality
        const reloadBtn = document.getElementById('reloadPromptBtn');
        if (reloadBtn) {
            reloadBtn.onclick = () => this.loadSavedPrompts();
        }

        const saveBtn = document.getElementById('savePromptBtn');
        if (saveBtn) {
            saveBtn.onclick = () => this.savePrompt();
        }

        const deleteBtn = document.getElementById('deletePromptBtn');
        if (deleteBtn) {
            deleteBtn.onclick = () => this.deletePrompt();
        }

        const newBtn = document.getElementById('newPromptBtn');
        if (newBtn) {
            newBtn.onclick = () => {
                this.activePromptId = null;
                this.selectedPrompt = null;
                document.getElementById('promptNameInput').value = '';
                document.getElementById('promptModalTextarea').value = '';
                this.updatePromptsList();
            };
        }
    }

    closePromptModal() {
        const modal = document.getElementById('promptModal');
        modal.style.display = 'none';
        this.currentAnalysisId = null;
    }

    async runAnalysisWithPrompt() {
        const promptText = document.getElementById('promptModalTextarea').value;
        const chooseBtn = document.getElementById('choosePromptBtn');
        
        if (!promptText.trim()) {
            this.showPromptStatus('Please select or enter a prompt', 'error');
            return;
        }

        if (!this.currentAnalysisId) {
            this.showPromptStatus('No interview selected for analysis', 'error');
            return;
        }

        try {
            // Show spinner on button
            const originalText = chooseBtn.innerHTML;
            chooseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running Analysis...';
            chooseBtn.disabled = true;

            // Get the interview data
            const interviews = this.getSavedInterviews();
            const interview = interviews.find(i => i.id === this.currentAnalysisId);
            
            if (!interview) {
                throw new Error('Interview not found');
            }

            // Prepare transcript data for analysis
            const transcriptText = this.prepareTranscriptForAnalysis(interview);
            
            // Call analysis API (you'll need to implement this endpoint)
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: promptText,
                    transcript: transcriptText,
                    interviewId: this.currentAnalysisId
                })
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const result = await response.json();
            
            // Save the analysis result (this will auto-refresh the display)
            this.saveAnalysisResult(result.analysis, promptText);
            
            // Close modal
            this.closePromptModal();
            this.showStatus('Analysis completed successfully', 'success');

        } catch (error) {
            console.error('Error running analysis:', error);
            this.showPromptStatus('Failed to run analysis', 'error');
        } finally {
            // Reset button
            chooseBtn.innerHTML = '<i class="fas fa-check"></i> Run Analysis';
            chooseBtn.disabled = false;
        }
    }

    prepareTranscriptForAnalysis(interview) {
        let transcriptText = '';
        
        // Handle different interview formats
        if (interview.sessionType === 'multi-question' || interview.fullSessionData) {
            const sessionData = interview.fullSessionData || interview;
            if (sessionData.questions) {
                sessionData.questions.forEach((question, index) => {
                    transcriptText += `\n\nQuestion ${index + 1}: ${question.question}\n`;
                    if (question.transcription) {
                        question.transcription.forEach(entry => {
                            transcriptText += `${entry.speaker}: ${entry.text}\n`;
                        });
                    }
                });
            }
        } else {
            // Legacy format
            if (interview.transcription) {
                interview.transcription.forEach(entry => {
                    transcriptText += `${entry.speaker}: ${entry.text}\n`;
                });
            }
        }
        
        return transcriptText.trim();
    }

    // displayAnalysisResult removed - now handled by saveAnalysisResult + refreshInterviewCard

    togglePromptDisplay(interviewId) {
        const promptDiv = document.getElementById(`analysis-prompt-${interviewId}`);
        const toggleBtn = document.querySelector(`[onclick="historyManager.togglePromptDisplay('${interviewId}')"]`);
        
        if (promptDiv && toggleBtn) {
            if (promptDiv.style.display === 'none') {
                promptDiv.style.display = 'block';
                toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Prompt Used';
            } else {
                promptDiv.style.display = 'none';
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i> Show Prompt Used';
            }
        }
    }

    saveAnalysisResult(analysisText, promptUsed) {
        const interviews = this.getSavedInterviews();
        const interviewIndex = interviews.findIndex(i => i.id === this.currentAnalysisId);
        
        if (interviewIndex !== -1) {
            // Initialize analyses array if it doesn't exist
            if (!interviews[interviewIndex].analyses) {
                interviews[interviewIndex].analyses = [];
            }
            
            // Add new analysis to the array (don't replace, append)
            const analysisIndex = interviews[interviewIndex].analyses.length + 1;
            const newAnalysis = {
                id: Date.now().toString(), // Unique ID for this analysis
                index: analysisIndex,
                result: analysisText,
                prompt: promptUsed,
                timestamp: new Date().toISOString()
            };
            
            console.log(`📊 Creating Analysis #${analysisIndex} for interview ${this.currentAnalysisId}`);
            
            interviews[interviewIndex].analyses.push(newAnalysis);
            
            // Update latest analysis reference
            interviews[interviewIndex].latestAnalysis = newAnalysis;
            
            this.saveInterviewsToStorage(interviews);
            console.log('✅ Analysis saved to localStorage:', {
                interviewId: this.currentAnalysisId,
                analysisCount: interviews[interviewIndex].analyses.length,
                analysisLength: analysisText.length,
                promptLength: promptUsed.length
            });
            
            // Auto-expand details and refresh the display
            this.expandInterviewDetails(this.currentAnalysisId);
            this.refreshInterviewCard(this.currentAnalysisId);
            
            // Scroll to the new analysis after a brief delay to allow DOM update
            setTimeout(() => {
                this.scrollToLatestAnalysis(this.currentAnalysisId);
            }, 100);
        } else {
            console.error('❌ Interview not found for saving analysis:', this.currentAnalysisId);
        }
    }

    expandInterviewDetails(interviewId) {
        // Find and expand the interview details
        const transcriptionDiv = document.getElementById(`transcription-${interviewId}`);
        const toggleBtn = document.querySelector(`[onclick="historyManager.toggleTranscription('${interviewId}')"]`);
        
        if (transcriptionDiv && toggleBtn) {
            transcriptionDiv.style.display = 'block';
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Details';
            // Load transcript editor contents when opening
            this.loadTranscriptEditor(interviewId);
        }
    }

    refreshInterviewCard(interviewId) {
        // Find the interview and refresh its card
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === interviewId);
        
        if (interview) {
            const existingCard = document.querySelector(`[data-interview-id="${interviewId}"]`);
            if (existingCard) {
                // Check if details were expanded before refresh
                const transcriptionDiv = existingCard.querySelector(`#transcription-${interviewId}`);
                const wasExpanded = transcriptionDiv && transcriptionDiv.style.display !== 'none';
                
                // Create and replace the card
                const newCard = this.createInterviewCard(interview);
                existingCard.replaceWith(newCard);
                
                // If details were expanded, re-expand them
                if (wasExpanded) {
                    const newTranscriptionDiv = document.getElementById(`transcription-${interviewId}`);
                    const newToggleBtn = document.querySelector(`[onclick="historyManager.toggleTranscription('${interviewId}')"]`);
                    
                    if (newTranscriptionDiv && newToggleBtn) {
                        newTranscriptionDiv.style.display = 'block';
                        newToggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Details';
                        // Load transcript editor contents when opening
                        this.loadTranscriptEditor(interviewId);
                    }
                }
                
                console.log('✅ Interview card refreshed with new analysis');
            }
        }
    }

    scrollToLatestAnalysis(interviewId) {
        // Find the analyses section for this interview
        const analysesSection = document.getElementById(`analyses-${interviewId}`);
        if (analysesSection) {
            // Scroll to the analyses section with smooth animation
            analysesSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
            
            // Add a subtle highlight animation to draw attention
            analysesSection.style.transition = 'box-shadow 0.3s ease';
            analysesSection.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.3)';
            
            // Remove highlight after 2 seconds
            setTimeout(() => {
                analysesSection.style.boxShadow = '';
            }, 2000);
            
            console.log('📍 Scrolled to latest analysis');
        }
    }

    toggleAllAnalyses(interviewId) {
        const hiddenAnalyses = document.querySelectorAll(`#analyses-${interviewId} .analysis-hidden`);
        const toggleBtn = document.querySelector(`[onclick="historyManager.toggleAllAnalyses('${interviewId}')"]`);
        
        if (hiddenAnalyses.length > 0) {
            // Show all hidden analyses
            hiddenAnalyses.forEach(analysis => {
                analysis.classList.remove('analysis-hidden');
                analysis.style.display = 'block';
            });
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Old Analyses';
        } else {
            // Hide all except the latest
            const allAnalyses = document.querySelectorAll(`#analyses-${interviewId} .analysis-result`);
            allAnalyses.forEach((analysis, index) => {
                if (index > 0) {
                    analysis.classList.add('analysis-hidden');
                    analysis.style.display = 'none';
                }
            });
            toggleBtn.innerHTML = '<i class="fas fa-list"></i> Show All Analyses';
        }
    }



    togglePromptDisplay(interviewId, analysisId) {
        const promptDiv = document.getElementById(`analysis-prompt-${interviewId}-${analysisId || ''}`);
        const toggleBtn = document.querySelector(`[onclick="historyManager.togglePromptDisplay('${interviewId}', '${analysisId || ''}')"]`);
        
        if (promptDiv && toggleBtn) {
            if (promptDiv.style.display === 'none') {
                promptDiv.style.display = 'block';
                toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Prompt';
            } else {
                promptDiv.style.display = 'none';
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i> Show Prompt';
            }
        }
    }

    async loadSavedPrompts() {
        const promptItems = document.getElementById('promptItems');
        const promptTextarea = document.getElementById('promptModalTextarea');
        const promptNameInput = document.getElementById('promptNameInput');
        
        try {
            // Show loading state
            if (promptItems) {
                promptItems.innerHTML = '<li style="padding: 0.5rem; color: hsl(var(--muted-foreground));">Loading prompts...</li>';
            }
            
            // Fetch prompts from the same API as the main app
            const response = await fetch('/api/prompts');
            
            if (!response.ok) {
                throw new Error('Failed to fetch prompts');
            }
            
            const data = await response.json();
            // Store prompts using the same structure as main app
            this.prompts = data.prompts || [];
            
            // Update the prompts list
            this.updatePromptsList();
            
            // Load the first prompt if available
            if (this.prompts.length > 0) {
                await this.selectPrompt(this.prompts[0]._id);
            } else {
                // No saved prompts - clear everything
                this.activePromptId = null;
                if (promptTextarea) {
                    promptTextarea.value = '';
                }
                if (promptNameInput) {
                    promptNameInput.value = '';
                }
            }
            
        } catch (error) {
            console.error('Error loading prompts:', error);
            this.showPromptStatus('Failed to load prompts from database', 'error');
            if (promptItems) {
                promptItems.innerHTML = '<li style="padding: 0.5rem; color: hsl(var(--destructive));">Error loading prompts from database.</li>';
            }
        }
    }

    updatePromptsList() {
        const promptItems = document.getElementById('promptItems');
        if (!promptItems) return;
        
        if (this.prompts.length === 0) {
            promptItems.innerHTML = '<li style="padding: 0.5rem; color: hsl(var(--muted-foreground));">No saved prompts found</li>';
            return;
        }
        
        promptItems.innerHTML = this.prompts.map(prompt => `
            <li class="prompt-item ${this.activePromptId && this.activePromptId === prompt._id ? 'selected' : ''}" 
                onclick="historyManager.selectPrompt('${prompt._id}')">
                <div class="prompt-item-name">${this.escapeHtml(prompt.name || 'Unnamed Prompt')}</div>
                <div class="prompt-item-preview">${this.escapeHtml((prompt.text || '').substring(0, 100))}${prompt.text && prompt.text.length > 100 ? '...' : ''}</div>
            </li>
        `).join('');
    }

    async selectPrompt(id) {
        try {
            const response = await fetch(`/api/prompts/${id}`);
            const data = await response.json();
            
            if (response.ok) {
                this.activePromptId = data._id;
                this.selectedPrompt = data;
                
                const promptNameInput = document.getElementById('promptNameInput');
                const promptModalTextarea = document.getElementById('promptModalTextarea');
                
                if (promptNameInput) {
                    promptNameInput.value = data.name || '';
                }
                
                if (promptModalTextarea) {
                    promptModalTextarea.value = data.text || '';
                }
                
                // Update the visual selection
                this.updatePromptsList();
            } else {
                throw new Error(data.error || 'Failed to load prompt');
            }
        } catch (error) {
            console.error('Error selecting prompt:', error);
            this.showPromptStatus('Failed to load prompt', 'error');
        }
    }

    async savePrompt() {
        const promptNameInput = document.getElementById('promptNameInput');
        const promptTextarea = document.getElementById('promptModalTextarea');
        
        if (!promptNameInput || !promptTextarea) return;
        
        const name = promptNameInput.value.trim();
        const content = promptTextarea.value.trim();
        
        if (!name || !content) {
            this.showPromptStatus('Please enter both name and content', 'error');
            return;
        }
        
        try {
            if (this.activePromptId) {
                // Update existing prompt
                const response = await fetch(`/api/prompts/${this.activePromptId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, text: content })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Save failed');
            } else {
                // Create new prompt
                const response = await fetch('/api/prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, text: content })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Create failed');
                this.activePromptId = data.id;
            }
            
            this.showPromptStatus('Saved', 'success');
            await this.loadSavedPrompts();
            
        } catch (error) {
            console.error('Error saving prompt:', error);
            this.showPromptStatus('Error saving prompt', 'error');
        }
    }

    async deletePrompt() {
        if (!this.activePromptId) {
            this.showPromptStatus('No prompt selected', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete this prompt?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/prompts/${this.activePromptId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            
            this.activePromptId = null;
            this.selectedPrompt = null;
            
            // Clear the inputs
            const promptNameInput = document.getElementById('promptNameInput');
            const promptTextarea = document.getElementById('promptModalTextarea');
            if (promptNameInput) promptNameInput.value = '';
            if (promptTextarea) promptTextarea.value = '';
            
            this.showPromptStatus('Prompt deleted', 'success');
            await this.loadSavedPrompts();
            
        } catch (error) {
            console.error('Error deleting prompt:', error);
            this.showPromptStatus('Failed to delete prompt', 'error');
        }
    }

    showPromptStatus(message, type) {
        const statusDiv = document.getElementById('promptModalStatus');
        if (!statusDiv) return;
        
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    buildQuestionTranscriptText(questionData) {
        if (!questionData.transcription || questionData.transcription.length === 0) {
            return '';
        }
        
        return questionData.transcription
            .filter(entry => entry.text && entry.text.trim() && !entry.isTranscribing)
            .map(entry => `${entry.speaker}: ${entry.text}`)
            .join('\n');
    }

    toggleQuestionTranscriptEdit(interviewId, questionIndex) {
        const displayDiv = document.getElementById(`questionTranscriptDisplay-${interviewId}-${questionIndex}`);
        const editorTextarea = document.getElementById(`questionTranscriptEditor-${interviewId}-${questionIndex}`);
        const actionsDiv = document.getElementById(`questionTranscriptActions-${interviewId}-${questionIndex}`);
        const editBtn = document.querySelector(`[onclick="historyManager.toggleQuestionTranscriptEdit('${interviewId}', ${questionIndex})"]`);
        
        if (displayDiv.style.display === 'none') {
            // Currently editing, save and switch back to display
            this.saveQuestionTranscript(interviewId, questionIndex);
        } else {
            // Currently displaying, switch to edit
            displayDiv.style.display = 'none';
            editorTextarea.style.display = 'block';
            actionsDiv.style.display = 'flex';
            editBtn.innerHTML = '<i class="fas fa-save"></i> Save Transcript';
            editorTextarea.focus();
        }
    }

    saveQuestionTranscript(interviewId, questionIndex) {
        const editorTextarea = document.getElementById(`questionTranscriptEditor-${interviewId}-${questionIndex}`);
        const displayDiv = document.getElementById(`questionTranscriptDisplay-${interviewId}-${questionIndex}`);
        const newTranscriptText = editorTextarea.value.trim();
        
        if (!newTranscriptText) {
            this.showStatus('Transcript cannot be empty', 'error');
            return;
        }

        // Parse the edited text back into transcript format
        const lines = newTranscriptText.split('\n').filter(line => line.trim());
        const newTranscription = lines.map((line, index) => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const speaker = line.substring(0, colonIndex).trim();
                const text = line.substring(colonIndex + 1).trim();
                return {
                    speaker: speaker,
                    text: text,
                    timestamp: new Date().toISOString()
                };
            } else {
                return {
                    speaker: 'Unknown',
                    text: line.trim(),
                    timestamp: new Date().toISOString()
                };
            }
        });

        // Update the interview data
        const interviews = this.getSavedInterviews();
        const interviewIndex = interviews.findIndex(i => i.id === interviewId);

        if (interviewIndex !== -1) {
            const interview = interviews[interviewIndex];
            const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
            
            if (isNewFormat) {
                const sessionData = interview.fullSessionData || interview;
                if (sessionData.questions && sessionData.questions[questionIndex]) {
                    sessionData.questions[questionIndex].transcription = newTranscription;
                    
                    // Update display
                    displayDiv.innerHTML = this.formatQuestionTranscription(newTranscription);
                    
                    // Switch back to display mode
                    const editorTextarea = document.getElementById(`questionTranscriptEditor-${interviewId}-${questionIndex}`);
                    const actionsDiv = document.getElementById(`questionTranscriptActions-${interviewId}-${questionIndex}`);
                    const editBtn = document.querySelector(`[onclick="historyManager.toggleQuestionTranscriptEdit('${interviewId}', ${questionIndex})"]`);
                    
                    displayDiv.style.display = 'block';
                    editorTextarea.style.display = 'none';
                    actionsDiv.style.display = 'none';
                    editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit Transcript';
                    
                    // Save to localStorage
                    this.saveInterviewsToStorage(interviews);
                    this.showStatus('Question transcript saved successfully', 'success');
                }
            }
        }
    }

    cancelQuestionTranscriptEdit(interviewId, questionIndex) {
        // Just switch back to display mode without saving
        this.toggleQuestionTranscriptEdit(interviewId, questionIndex);
    }

    toggleQuestionEdit(interviewId, questionIndex) {
        const displayDiv = document.getElementById(`questionTextDisplay-${interviewId}-${questionIndex}`);
        const editTextarea = document.getElementById(`questionTextEdit-${interviewId}-${questionIndex}`);
        const editBtn = document.querySelector(`[onclick="historyManager.toggleQuestionEdit('${interviewId}', ${questionIndex})"]`);
        
        if (displayDiv.style.display === 'none') {
            // Currently editing, switch back to display and save
            this.saveQuestionText(interviewId, questionIndex);
            displayDiv.style.display = 'block';
            editTextarea.style.display = 'none';
            editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit Question';
        } else {
            // Currently displaying, switch to edit
            displayDiv.style.display = 'none';
            editTextarea.style.display = 'block';
            editBtn.innerHTML = '<i class="fas fa-check"></i> Save Question';
            editTextarea.focus();
        }
    }

    saveQuestionText(interviewId, questionIndex) {
        const editTextarea = document.getElementById(`questionTextEdit-${interviewId}-${questionIndex}`);
        const displayDiv = document.getElementById(`questionTextDisplay-${interviewId}-${questionIndex}`);
        const newQuestionText = editTextarea.value.trim();
        
        if (!newQuestionText) {
            this.showStatus('Question cannot be empty', 'error');
            return;
        }

        // Update the interview data
        const interviews = this.getSavedInterviews();
        const interviewIndex = interviews.findIndex(i => i.id === interviewId);

        if (interviewIndex !== -1) {
            const interview = interviews[interviewIndex];
            const isNewFormat = interview.sessionType === 'multi-question' || interview.fullSessionData;
            
            if (isNewFormat) {
                const sessionData = interview.fullSessionData || interview;
                if (sessionData.questions && sessionData.questions[questionIndex]) {
                    sessionData.questions[questionIndex].question = newQuestionText;
                    
                    // Update display
                    displayDiv.textContent = newQuestionText;
                    
                    // Save to localStorage
                    this.saveInterviewsToStorage(interviews);
                    this.showStatus('Question updated successfully', 'success');
                }
            }
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

    formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

// Initialize the history manager when DOM is loaded
let historyManager;
document.addEventListener('DOMContentLoaded', () => {
    historyManager = new InterviewHistoryManager();
}); 