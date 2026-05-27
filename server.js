const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
// Dynamic configuration variable targeting Render or your local fallback
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/melodify';

// 1. CONNECT TO DATABASE CLUSTER
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('🚀 Connected to MongoDB successfully.'))
.catch(err => console.error('❌ MongoDB Connection Failure:', err.message));

// 2. MIDDLEWARE DEFINITIONS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CRITICAL ROUTING FIX: This explicitly maps the root domain to serve files from /public
// This solves your 'style.css' 404 error instantly.
app.use(express.static(path.join(__dirname, 'public')));

// 3. ATTACH ROUTERS
// Pulls in the feed logic routes
const feedRouter = require('./feed');
app.use('/feed', feedRouter);

// 4. MAIN INTERFACE GATEWAY ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. API AUTHENTICATION ENDPOINTS (Maps your login actions correctly)
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Safety guard if DB drops connection sequence
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Database offline." });
    }

    try {
        // Basic match authentication verification logic
        if (username === "Melodify Owner" && password === "******") {
            return res.json({ success: true, message: "Authorized backend access verified." });
        }
        res.status(401).json({ success: false, message: "Invalid credentials." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Dummy endpoint to satisfy initial profile checks
app.get('/api/auth/me', (req, res) => {
    res.json({ authenticated: false, message: "Guest session container active." });
});

// 6. CATCH ALL FOR BREAKING ROUTES
app.use((req, res) => {
    res.status(404).send('<h1>404: Request Point Missing on Melodify Server</h1>');
});

app.listen(PORT, () => {
    console.log(`🎵 Melodify Core App listening on port ${PORT}`);
});
