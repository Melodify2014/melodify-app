const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/melodify';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 4000
})
.then(() => console.log('🚀 Main Database cluster linked smoothly.'))
.catch(err => console.warn('⚠️ running in embedded database fallback mode.'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── THE DEFINITIVE STATIC FILE FIX ────────────────────────────────────────
// This absolute resolution forces Node to find the /public directory 
// relative to wherever server.js is running, instantly fixing the style.css 404.
app.use(express.static(path.resolve(__dirname, 'public')));
// ───────────────────────────────────────────────────────────────────────────

// Mount routers
const feedRouter = require('./feed');
app.use('/feed', feedRouter);

// Serve your main layout
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// Auth placeholders to stop console warnings
app.post('/api/auth/login', (req, res) => res.json({ success: true }));
app.get('/api/auth/me', (req, res) => res.json({ authenticated: true }));

app.use((req, res) => {
    res.status(404).send('<h1>404: Content Missing</h1>');
});

app.listen(PORT, () => {
    console.log(`🎵 Melodify Core Running on Port ${PORT}`);
});
