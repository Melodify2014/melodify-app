const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

// 1. SYSTEM CONFIGURATION & PORT
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// 2. MONGOOSE DATABASE CONNECTION
if (!MONGODB_URI) {
    console.warn("WARNING: MONGODB_URI environment variable is missing. Database features will fail.");
} else {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('🚀 Connected to MongoDB Cluster Successfully.'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err));
}

// 3. DATABASE SCHEMAS & MODELS
// User Schema for handling Sign In / Sign Up data
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // In a real app, hash this using bcrypt!
    subscribedTo: [String], // Array of artist names or channel IDs
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// 4. INCOMING REQUEST PARSING MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all UI code, styles, and front-end JS automatically from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// 5. INTEGRATING YOUR EXTERNAL ROUTERS
// This links your 'feed.js' file. Any routes inside feed.js will be prefixed with /feed
try {
    const feedRouter = require('./feed');
    app.use('/feed', feedRouter);
} catch (error) {
    console.warn("⚠️ feed.js file not found or contains errors. Skipping feed router setup.");
}

// 6. FRONTEND ROUTE
// Serves your index.html file on the root web address
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 7. AUTHENTICATION API ROUTES (For your login box)
// Handle User Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (user) {
            res.json({ success: true, message: "Welcome back!", user: { username: user.username } });
        } else {
            res.status(401).json({ success: false, message: "Invalid username or password." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server login error." });
    }
});

// Handle User Registration
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already taken." });
        }
        
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ success: true, message: "Account created successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server registration error." });
    }
});

// 8. FALLBACK ERROR HANDLING
app.use((req, res) => {
    res.status(404).send('<h1>404: Page Not Found on Melodify</h1>');
});

// 9. INITIALIZE SERVER RUNTIME
app.listen(PORT, () => {
    console.log(`🎵 Melodify Core Engine operational on port ${PORT}`);
});
