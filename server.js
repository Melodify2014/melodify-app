/**
 * Melodify Backend Gateway Server
 * Added explicit Producer Filtering Pipelines and Channel-Specific Synchronizers
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
    following: { type: [String], default: [] }
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
 * AUTHENTICATION MIDDLEWARE & ROUTING INTERFACES
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
        
        const exactMatchExists = await User.findOne({ username: username.toLowerCase() });
        if (exactMatchExists) return res.status(400).json({ message: 'Username already taken.' });

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
        return res.status(500).json({ message: 'Login process crash.' });
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
 * MUSIC TRACK & DYNAMIC PRODUCER SEARCH INTERFACES
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        const producerTarget = req.query.producer; // Catch strict channel targets

        // Run search synchronization if a query or strict channel target is processed
        const activeSearchTerm = producerTarget || queryToken;
        if (activeSearchTerm && activeSearchTerm.trim().length > 0) {
            try {
                const searchResults = await ytSearch({ query: activeSearchTerm });
                if (searchResults && searchResults.videos) {
                    const filteredCollection = searchResults.videos.filter(video => video.seconds > 60).slice(0, 16);
                    
                    for (const video of filteredCollection) {
                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: video.title.replace(/[\(\[].*?[\)\]]/g, '').trim(),
                                producer: video.author.name || activeSearchTerm,
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: ['search-sync']
                            },
                            { upsert: true }
                        );
                    }
                }
            } catch (searchErr) {
                console.error("Live sync skipped:", searchErr);
            }
        }

        // Build database query matrices
        let queryCondition = {};
        if (producerTarget) {
            queryCondition = { producer: producerTarget };
        } else if (queryToken) {
            queryCondition = {
                $or: [
                    { title: { $regex: queryToken, $options: 'i' } },
                    { producer: { $regex: queryToken, $options: 'i' } }
                ]
            };
        }

        const feedCatalog = await Track.find(queryCondition).limit(50);
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading platform tracks matrix.' });
    }
});

/**
 * USER RELATIONSHIP ROUTING VECTORS
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

app.post('/api/users/follow', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { producerName } = req.body;
        if (!producerName) return res.status(400).json({ message: 'Producer identity required.' });

        const searchPosition = req.verifiedUser.following.indexOf(producerName);
        if (searchPosition === -1) {
            req.verifiedUser.following.push(producerName);
        } else {
            req.verifiedUser.following.splice(searchPosition, 1);
        }

        await req.verifiedUser.save();
        return res.status(200).json({ following: req.verifiedUser.following });
    } catch (err) {
        return res.status(500).json({ message: 'Failed processing follow vectors.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
            console.error("Seeder skipped.");
        }
    }
}

app.listen(PORT, () => {
    console.log(`Melodify Core Engine running on network hub: http://localhost:${PORT}`);
});
