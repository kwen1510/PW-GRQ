class InterviewHistoryManager {
    constructor() {
        this.historyContainer = document.getElementById('historyContainer');
        this.emptyState = document.getElementById('emptyState');
        this.interviewCount = document.getElementById('interviewCount');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.statusMessage = document.getElementById('statusMessage');
        this.deleteModal = document.getElementById('deleteModal');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        
        this.currentDeleteId = null;
        
        this.setupEventListeners();
        this.loadHistory();
        this.updateCount();
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
        const card = document.createElement('div');
        card.className = 'card interview-card';
        card.innerHTML = `
            <div class="interview-header">
                <div class="interview-info">
                    <h3><i class="fas fa-comment-dots"></i> ${this.truncateText(interview.question, 80)}</h3>
                    <div class="interview-meta">
                        <span class="interview-date">
                            <i class="fas fa-calendar"></i> ${this.formatDate(interview.timestamp)}
                        </span>
                        <span class="interview-duration">
                            <i class="fas fa-clock"></i> ${interview.duration || 'N/A'}
                        </span>
                        <span class="interview-participants">
                            <i class="fas fa-users"></i> ${interview.students.length} students
                        </span>
                    </div>
                </div>
                <div class="interview-actions">
                    <button class="btn btn-secondary view-btn" onclick="historyManager.toggleTranscription('${interview.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-secondary export-csv-btn" onclick="historyManager.exportInterviewCSV('${interview.id}')">
                        <i class="fas fa-file-csv"></i> CSV
                    </button>
                    <button class="btn btn-secondary export-json-btn" onclick="historyManager.exportInterviewJSON('${interview.id}')">
                        <i class="fas fa-file-code"></i> JSON
                    </button>
                    <button class="btn btn-danger delete-btn" onclick="historyManager.showDeleteConfirmation('${interview.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="interview-students">
                <strong>Students:</strong> ${interview.students.join(', ')}
            </div>
            
            <div class="interview-transcription" id="transcription-${interview.id}" style="display: none;">
                <h4><i class="fas fa-file-alt"></i> Transcription</h4>
                <div class="transcription-content">
                    ${this.formatTranscription(interview.transcription)}
                </div>
                ${interview.analysis ? `
                    <div class="analysis-content">
                        <h4><i class="fas fa-brain"></i> GPT Analysis</h4>
                        <div class="analysis-text">${interview.analysis}</div>
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

    toggleTranscription(id) {
        const transcriptionDiv = document.getElementById(`transcription-${id}`);
        const viewBtn = document.querySelector(`[onclick="historyManager.toggleTranscription('${id}')"]`);
        
        if (transcriptionDiv.style.display === 'none') {
            transcriptionDiv.style.display = 'block';
            viewBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide';
        } else {
            transcriptionDiv.style.display = 'none';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i> View';
        }
    }

    exportInterviewCSV(id) {
        const interviews = this.getSavedInterviews();
        const interview = interviews.find(i => i.id === id);
        
        if (!interview) {
            this.showStatus('Interview not found', 'error');
            return;
        }

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
        this.interviewCount.textContent = `${count} interview${count !== 1 ? 's' : ''} saved`;
        
        // Show/hide clear all button
        this.clearAllBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    showEmptyState() {
        this.historyContainer.style.display = 'none';
        this.emptyState.style.display = 'block';
    }

    hideEmptyState() {
        this.historyContainer.style.display = 'block';
        this.emptyState.style.display = 'none';
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
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type} show`;
        
        setTimeout(() => {
            this.statusMessage.classList.remove('show');
        }, 4000);
    }
}

// Initialize the history manager when DOM is loaded
let historyManager;
document.addEventListener('DOMContentLoaded', () => {
    historyManager = new InterviewHistoryManager();
}); 