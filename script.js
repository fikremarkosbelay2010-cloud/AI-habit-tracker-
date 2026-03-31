const API_URL = 'http://localhost:3000/api';

// Load habits on page load
async function loadHabits() {
    try {
        const response = await fetch(`${API_URL}/habits`);
        const habits = await response.json();
        
        const habitsList = document.getElementById('habitsList');
        habitsList.innerHTML = '';
        
        let completedCount = 0;
        let totalCount = habits.length;
        
        for (const habit of habits) {
            // Get streak
            const streakRes = await fetch(`${API_URL}/streak/${habit.id}`);
            const streakData = await streakRes.json();
            
            // Get today's completion status
            const completionsRes = await fetch(`${API_URL}/completions`);
            const completions = await completionsRes.json();
            const todayCompletion = completions.find(c => c.id === habit.id);
            const isCompleted = todayCompletion?.completed === 1;
            
            if (isCompleted) completedCount++;
            
            const habitDiv = document.createElement('div');
            habitDiv.className = 'habit-item';
            habitDiv.innerHTML = `
                <div class="habit-info">
                    <div class="habit-name">${escapeHtml(habit.name)}</div>
                    <div class="habit-frequency">${habit.frequency}</div>
                    ${streakData.streak > 0 ? `<div class="streak">🔥 ${streakData.streak} day streak</div>` : ''}
                </div>
                <div class="habit-actions">
                    <button class="complete-btn ${isCompleted ? 'completed' : ''}" data-id="${habit.id}">
                        ${isCompleted ? '✓ Completed' : '✓ Complete'}
                    </button>
                    <button class="delete-btn" data-id="${habit.id}">🗑️</button>
                </div>
            `;
            
            habitsList.appendChild(habitDiv);
        }
        
        // Update progress
        document.getElementById('todayProgress').textContent = `${completedCount}/${totalCount} completed`;
        
        // Attach event listeners
        document.querySelectorAll('.complete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const habitId = btn.dataset.id;
                await fetch(`${API_URL}/toggle/${habitId}`, { method: 'POST' });
                loadHabits(); // Reload to update UI
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Delete this habit?')) {
                    const habitId = btn.dataset.id;
                    await fetch(`${API_URL}/habits/${habitId}`, { method: 'DELETE' });
                    loadHabits();
                }
            });
        });
        
    } catch (error) {
        console.error('Error loading habits:', error);
    }
}

// Add new habit
document.getElementById('addHabitBtn').addEventListener('click', async () => {
    const name = document.getElementById('habitName').value.trim();
    const frequency = document.getElementById('habitFrequency').value;
    
    if (!name) {
        alert('Please enter a habit name');
        return;
    }
    
    try {
        await fetch(`${API_URL}/habits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, frequency })
        });
        
        document.getElementById('habitName').value = '';
        loadHabits();
        addChatMessage('system', `✨ Great! Added "${name}" as a ${frequency} habit. Stay consistent!`);
    } catch (error) {
        console.error('Error adding habit:', error);
    }
});

// Chat functionality
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addChatMessage('user', message);
    input.value = '';
    
    // Show typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        removeTypingIndicator(typingIndicator);
        addChatMessage('assistant', data.reply);
    } catch (error) {
        removeTypingIndicator(typingIndicator);
        addChatMessage('assistant', "⚠️ Sorry, I'm having trouble connecting. Please make sure the server is running.");
        console.error('Chat error:', error);
    }
}

function addChatMessage(role, content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.textContent = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.textContent = '🤔 Thinking...';
    indicator.id = 'typing-indicator';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return indicator;
}

function removeTypingIndicator(indicator) {
    if (indicator && indicator.remove) {
        indicator.remove();
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Event listeners
document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Load chat history on startup
async function loadChatHistory() {
    try {
        const response = await fetch(`${API_URL}/chat/history`);
        const history = await response.json();
        
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = ''; // Clear default message
        
        if (history.length === 0) {
            addChatMessage('assistant', '👋 Hi! I\'m your AI habit coach. Ask me anything about building habits, staying motivated, or breaking bad patterns!');
        } else {
            history.forEach(msg => {
                addChatMessage(msg.role, msg.content);
            });
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Initialize
loadHabits();
loadChatHistory();
