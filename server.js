/**
 * Melodify Backend Gateway Server
 * Integrates dynamic YouTube Channel syncing with an automatic Shorts exclusion layer
 */
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'melodify_super_secret_key_1337';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/melodify';

app.use(express.json());
app.use(cors());
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
    youtubeId: { type: String, required: true, unique: true }, // Map to hidden player engine
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Cluster.');
        syncChannelsExcludeShorts(); // Sync channels and filter out shorts on launch
    })
    .catch(err => console.error('Database Connection Error Context:', err));

/**
 * AUTHENTICATION ROUTE ENDPOINTS
 */
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
        return res.status(201).json({ message: 'User created successfully.', userId: newUser._id });
    } catch (err) {
        return res.status(500).json({ message: 'Internal Server Error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const targetUser = await User.findOne({ username: username.toLowerCase() });
        if (!targetUser) return res.status(401).json({ message: 'Invalid credentials.' });

        const matchingKey = await bcrypt.compare(password, targetUser.password);
        if (!matchingKey) return res.status(401).json({ message: 'Invalid credentials.' });

        const assignedTokenWrapper = jwt.sign({ id: targetUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token: assignedTokenWrapper });
    } catch (err) {
        return res.status(500).json({ message: 'Login controller process crash.' });
    }
});

const parseBearerAuthenticationToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const extractedToken = authHeader && authHeader.split(' ')[1];
        if (!extractedToken) return res.status(401).json({ message: 'Access denied.' });

        const verificationDataPayload = jwt.verify(extractedToken, JWT_SECRET);
        req.verifiedUser = await User.findById(verificationDataPayload.id).select('-password');
        if (!req.verifiedUser) return res.status(401).json({ message: 'Session expired.' });
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Invalid token.' });
    }
};

app.get('/api/auth/me', parseBearerAuthenticationToken, (req, res) => {
    return res.status(200).json(req.verifiedUser);
});

/**
 * MUSIC TRACK MANAGEMENT ENDPOINTS
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const feedCatalog = await Track.find();
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading platform tracks matrix.' });
    }
});

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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * DYNAMIC YOUTUBE CHANNEL CORES: EXCLUDE SHORTS PIPELINE
 */
async function syncChannelsExcludeShorts() {
    console.log('Synchronizing target content channel arrays...');
    
    // Core curator search terms targeting production music hubs
    const targetProducers = ['INTERWORLD Phonk', 'DVRST Phonk', 'KSLV Noh', 'Phonk drift music'];

    for (const producer of targetProducers) {
        try {
            const searchResults = await ytSearch({ query: producer });
            if (!searchResults || !searchResults.videos) continue;

            // CRITICAL STEP: Filter out videos <= 60 seconds (Shorts restriction mapping)
            const cleanVideosOnly = searchResults.videos.filter(video => video.seconds > 60);

            // Save up to 5 verified tracks per producer stream pipeline
            const limitTracks = cleanVideosOnly.slice(0, 5);

            for (const video of limitTracks) {
                await Track.findOneAndUpdate(
                    { youtubeId: video.videoId },
                    {
                        title: video.title.replace(/[\(\[].*?[\)\]]/g, '').trim(), // Clean up tracking labels
                        producer: video.author.name || producer,
                        thumbnail: video.image || video.thumbnail,
                        youtubeId: video.videoId,
                        type: 'music',
                        tags: ['drift', 'aggressive', 'phonk']
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (error) {
            console.error(`Error syncing channel feed profiles for ${producer}:`, error);
        }
    }
    console.log('Channel feed synchronization complete. Database records are fully loaded with zero Shorts.');
}

app.listen(PORT, () => {
    console.log(`Melodify Core Engine running on network hub: http://localhost:${PORT}`);
});
