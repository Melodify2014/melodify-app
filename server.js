const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
// Fallback to local database connection string if Render variable isn't set
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/melodify';

// Connect to MongoDB with an explicit server selection timeout to prevent endless hanging
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000 
})
.then(() => console.log('🚀 Secure connection established with MongoDB.'))
.catch(err => {
    console.error('❌ Database connection failure during startup:');
    console.error(err.message);
});

// User Schema definitions
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/ folder
app.use(express.static(path.join(__dirname, 'public')));

// Attach the catalog feed routers
try {
    const feedRouter = require('./feed');
    app.use('/feed', feedRouter);
    console.log('✅ Catalog feed router mounted successfully.');
} catch (routerErr) {
    console.error('❌ Failed to mount feed.js router:', routerErr.message);
}

// Serve main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication API Login Route
app.post('/api/login', async (req, res) => {
    // Fail immediately if database isn't connected instead of letting the connection time out
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Database offline. Check your Render configuration logs." });
    }

    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (user) {
            res.json({ success: true, message: "Authorized login.", username: user.username });
        } else {
            res.status(401).json({ success: false, message: "Invalid system credentials." });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "Internal authentication runtime error." });
    }
});

// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).send('<h1>404: Location Not Found on Melodify Engines</h1>');
});

app.listen(PORT, () => {
    console.log(`🎵 Melodify Core Application online on port: ${PORT}`);
});
