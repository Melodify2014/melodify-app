/**
 * Melodify Backend Gateway Server
 * Real-time YouTube Channel Searching, Shorts Filtering, and User Follow Pipelines
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
    watchHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    following: { type: [String], default: [] } // Stores exact producer/channel strings
});

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Cluster.');
        syncChannelsExcludeShorts(); 
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
            watchHistory: [],
            following: []
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
 * MUSIC TRACK & SEARCH INTERFACES (LIVE YOUTUBE CORES)
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;

        // If a search query is passed, dynamically query YouTube live and sync matching long-form content
        if (queryToken && queryToken.trim().length > 0) {
            try {
                const searchResults = await ytSearch({ query: queryToken });
                if (searchResults && searchResults.videos) {
                    // Filter out Shorts (must be greater than 60 seconds)
                    const filteredCollection = searchResults.videos.filter(video => video.seconds > 60).slice(0, 12);
                    
                    for (const video of filteredCollection) {
                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: video.title.replace(/[\(\[].*?[\)\]]/g, '').trim(),
                                producer: video.author.name || queryToken,
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: ['search-sync', 'phonk']
                            },
                            { upsert: true, new: true }
                        );
                    }
                }
            } catch (searchErr) {
                console.error("Live YouTube sync warning:", searchErr);
            }
        }

        // Return matched database items back to frontend client
        let queryCondition = {};
        if (queryToken) {
            queryCondition = {
                $or: [
                    { title: { $regex: queryToken, $options: 'i' } },
                    { producer: { $regex: queryToken, $options: 'i' } }
                ]
            };
        }

        const feedCatalog = await Track.find(queryCondition).limit(40);
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading platform tracks matrix.' });
    }
});

/**
 * USER RELATIONSHIP ACTIONS (HISTORY, LIKES, CHANNELS FOLLOWING)
 */
app.post('/api/users/history', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!req.verifiedUser.watchHistory.includes(trackId)) {
            req.verifiedUser.watchHistory.push(trackId);
            await req.verifiedUser.save();
        }
        return res.status(200).json(req.verifiedUser);
    } catch (e) {
        return res.status(500).json({ message: 'Failed appending history node.' });
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

// Follow / Unfollow Toggle Endpoint Layer
app.post('/api/users/follow', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { producerName } = req.body;
        if (!producerName) return res.status(400).json({ message: 'Producer identity required.' });

        const searchPosition = req.verifiedUser.following.indexOf(producerName);
        if (searchPosition === -1) {
            req.verifiedUser.following.push(producerName); // Follow
        } else {
            req.verifiedUser.following.splice(searchPosition, 1); // Unfollow
        }

        await req.verifiedUser.save();
        return res.status(200).json({ following: req.verifiedUser.following });
    } catch (err) {
        return res.status(500).json({ message: 'Failed processing follow request vectors.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * BASELINE SEED DATA ON REBOOT
 */
async function syncChannelsExcludeShorts() {
    const existingCount = await Track.countDocuments();
    if (existingCount > 5) return; 

    const starterHubs = ['INTERWORLD Phonk', 'DVRST Phonk', 'KSLV Noh'];
    for (const producer of starterHubs) {
        try {
            const searchResults = await ytSearch({ query: producer });
            if (!searchResults || !searchResults.videos) continue;
            const longVideos = searchResults.videos.filter(v => v.seconds > 60).slice(0, 4);

            for (const video of longVideos) {
                await Track.findOneAndUpdate(
                    { youtubeId: video.videoId },
                    {
                        title: video.title.replace(/[\(\[].*?[\)\]]/g, '').trim(),
                        producer: video.author.name || producer,
                        thumbnail: video.image || video.thumbnail,
                        youtubeId: video.videoId,
                        type: 'music',
                        tags: ['drift', 'phonk']
                    },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.error("Seeder trace skipped execution steps.");
        }
    }
}

app.listen(PORT, () => {
    console.log(`Melodify Core Engine running on network hub: http://localhost:${PORT}`);
});
