/**
 * Melodify Backend Gateway Server
 * Built with Express, JSON Web Tokens, and MongoDB (Mongoose)
 */
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'melodify_super_secret_key_1337';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/melodify';

// Pipeline Middleware Stack Configurations
app.use(express.json());
app.use(cors());

// Serve static frontend assets from your public distribution path
app.use(express.static(path.join(__dirname, 'public')));

/**
 * DATABASE MODEL SCHEMA CONSTRUCTORS
 */
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    likedTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    watchHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }]
});

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

// Verify database connection state mapping
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Cluster.');
        seedMockTracksDatabase(); // Populates database with tracks if empty
    })
    .catch(err => console.error('Database Connection Error Context:', err));

/**
 * AUTHENTICATION ROUTE ENDPOINTS
 */

// User Account Registration Route Handler
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password elements required.' });
        }

        const exactMatchExists = await User.findOne({ username: username.toLowerCase() });
        if (exactMatchExists) {
            return res.status(400).json({ message: 'Username already taken.' });
        }

        const encryptedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            username: username.toLowerCase(),
            password: encryptedPassword,
            likedTracks: [],
            watchHistory: []
        });

        // Returns message directly matching Path A's frontend layout requirements
        return res.status(201).json({ message: 'User created successfully.', userId: newUser._id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error during registration.' });
    }
});

// User Session Authentication Entry Endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const targetUser = await User.findOne({ username: username.toLowerCase() });
        
        if (!targetUser) {
            return res.status(401).json({ message: 'Invalid username credentials.' });
        }

        const matchingKey = await bcrypt.compare(password, targetUser.password);
        if (!matchingKey) {
            return res.status(401).json({ message: 'Invalid password credentials.' });
        }

        const assignedTokenWrapper = jwt.sign({ id: targetUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token: assignedTokenWrapper });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Login controller process crash.' });
    }
});

// Profile Identity Synchronization Middleware Layer
const parseBearerAuthenticationToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const extractedToken = authHeader && authHeader.split(' ')[1];

        if (!extractedToken) {
            return res.status(401).json({ message: 'Access denied. Missing validation token.' });
        }

        const verificationDataPayload = jwt.verify(extractedToken, JWT_SECRET);
        req.verifiedUser = await User.findById(verificationDataPayload.id).select('-password');
        if (!req.verifiedUser) {
            return res.status(401).json({ message: 'Session user structure no longer exists.' });
        }
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Invalid or expired session token wrapper configuration.' });
    }
};

// Validate Live Client Session Context Status
app.get('/api/auth/me', parseBearerAuthenticationToken, (req, res) => {
    return res.status(200).json(req.verifiedUser);
});

/**
 * MUSIC CONTENT MANAGEMENT STREAM ENDPOINTS
 */

// Fetch Dynamic Platform Media Source Catalog Items
app.get('/api/tracks', async (req, res) => {
    try {
        const feedCatalog = await Track.find();
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading platform tracks matrix.' });
    }
});

// Record Played History Track Relationship Vector Map
app.post('/api/users/history', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!req.verifiedUser.watchHistory.includes(trackId)) {
            req.verifiedUser.watchHistory.push(trackId);
            await req.verifiedUser.save();
        }
        return res.status(200).json(req.verifiedUser);
    } catch (e) {
        return res.status(500).json({ message: 'Failed appending history node mapping.' });
    }
});

// Toggle Liked State Flag Metrics
app.post('/api/users/like', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        const indexPosition = req.verifiedUser.likedTracks.indexOf(trackId);
        
        if (indexPosition === -1) {
            req.verifiedUser.likedTracks.push(trackId);
        } else {
            req.verifiedUser.likedTracks.splice(indexPosition, 1);
        }
        
        await req.verifiedUser.save();
        return res.status(200).json({ likedTracks: req.verifiedUser.likedTracks });
    } catch (e) {
        return res.status(500).json({ message: 'Failed updating target like value.' });
    }
});

// Catch-all route to serve the index.html fallback for client routing safety
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * SYSTEM SEED TRACK GENERATION FACTORY
 */
async function seedMockTracksDatabase() {
    const existingCount = await Track.countDocuments();
    if (existingCount > 0) return;

    const mockDataset = [
        { title: 'METAMORPHOSIS', producer: 'INTERWORLD', thumbnail: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300', type: 'music', tags: ['drift', 'aggressive', 'viral'] },
        { title: 'Rapture', producer: 'KSLV Noh', thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300', type: 'music', tags: ['drift', 'ambient'] },
        { title: 'Phonk Kynd', producer: 'DVRST', thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300', type: 'music', tags: ['chill', 'ambient'] },
        { title: 'How Phonk Conquered TikTok', producer: 'Aesthetic Interviews', thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300', type: 'interview', tags: ['viral', 'educational'] }
    ];

    await Track.insertMany(mockDataset);
    console.log('Successfully seeded database with starter Phonk media collections.');
}

app.listen(PORT, () => {
    console.log(`Melodify System Engine listening on network hub: http://localhost:${PORT}`);
});
