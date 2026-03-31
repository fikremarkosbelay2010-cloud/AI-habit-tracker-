require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Database setup
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      frequency TEXT DEFAULT 'daily',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER,
      date DATE,
      completed BOOLEAN DEFAULT 0,
      FOREIGN KEY(habit_id) REFERENCES habits(id),
      UNIQUE(habit_id, date)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API Routes

// Get all habits
app.get('/api/habits', (req, res) => {
  db.all('SELECT * FROM habits ORDER BY created_at DESC', (err, habits) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(habits);
  });
});

// Add new habit
app.post('/api/habits', (req, res) => {
  const { name, frequency } = req.body;
  db.run('INSERT INTO habits (name, frequency) VALUES (?, ?)', [name, frequency], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, frequency });
  });
});

// Delete habit
app.delete('/api/habits/:id', (req, res) => {
  db.run('DELETE FROM habits WHERE id = ?', req.params.id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM habit_logs WHERE habit_id = ?', req.params.id);
    res.json({ success: true });
  });
});

// Toggle habit completion for today
app.post('/api/toggle/:habitId', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const habitId = req.params.habitId;
  
  db.get('SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?', [habitId, today], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (row) {
      db.run('UPDATE habit_logs SET completed = NOT completed WHERE habit_id = ? AND date = ?', [habitId, today], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, completed: !row.completed });
      });
    } else {
      db.run('INSERT INTO habit_logs (habit_id, date, completed) VALUES (?, ?, 1)', [habitId, today], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, completed: true });
      });
    }
  });
});

// Get streak for a habit
app.get('/api/streak/:habitId', (req, res) => {
  db.all('SELECT date, completed FROM habit_logs WHERE habit_id = ? ORDER BY date DESC', [req.params.habitId], (err, logs) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let expectedDate = new Date(today);
    
    for (let log of logs) {
      const logDate = new Date(log.date);
      if (log.completed && logDate.toDateString() === expectedDate.toDateString()) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (log.completed) {
        break;
      } else {
        break;
      }
    }
    res.json({ streak });
  });
});

// Get all completions for dashboard
app.get('/api/completions', (req, res) => {
  db.all(`
    SELECT h.id, h.name, hl.date, hl.completed 
    FROM habits h 
    LEFT JOIN habit_logs hl ON h.id = hl.habit_id
    WHERE hl.date = date('now') OR hl.date IS NULL
    ORDER BY h.id
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  // Get user's habit data for context
  db.all('SELECT name, frequency FROM habits', [], async (err, habits) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Get today's completions
    const today = new Date().toISOString().split('T')[0];
    db.all(`
      SELECT h.name, hl.completed 
      FROM habits h 
      LEFT JOIN habit_logs hl ON h.id = hl.habit_id AND hl.date = ?
    `, [today], async (err, todayCompletions) => {
      
      const habitContext = habits.map(h => `${h.name} (${h.frequency})`).join(', ');
      const completionsContext = todayCompletions.filter(c => c.completed).map(c => c.name).join(', ');
      
      const systemPrompt = `You are an AI habit coach for HabitFlow. The user has these habits: ${habitContext || 'no habits yet'}. 
      Today they completed: ${completionsContext || 'nothing yet'}. 
      Provide encouraging, practical advice about building habits, breaking bad habits, and staying consistent. 
      Keep responses concise (2-3 sentences) and actionable.`;
      
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          max_tokens: 150,
          temperature: 0.7,
        });
        
        const reply = completion.choices[0].message.content;
        
        // Save to chat history
        db.run('INSERT INTO chat_history (role, content) VALUES (?, ?)', ['user', message]);
        db.run('INSERT INTO chat_history (role, content) VALUES (?, ?)', ['assistant', reply]);
        
        res.json({ reply });
      } catch (error) {
        console.error('OpenAI error:', error);
        res.json({ reply: "I'm having trouble connecting right now. Keep building those habits! 🔥" });
      }
    });
  });
});

// Get chat history
app.get('/api/chat/history', (req, res) => {
  db.all('SELECT role, content, timestamp FROM chat_history ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.reverse());
  });
});

app.listen(port, () => {
  console.log(`HabitFlow server running at http://localhost:${port}`);
});
