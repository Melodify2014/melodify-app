/**
 * Melodify Ultimate Production Backend Gateway Server
 * Features robust data parsing, user state structures, authentication infrastructure,
 * and comprehensive error handlers for database transactions.
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
const JWT_SECRET = process.env.JWT_SECRET || 'melodify_super_secret_secure_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/melodify';

// Core Express Pipeline Middlewares
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ==========================================================================
 * DATABASE SCHEMAS & MODELLING LAYER
 * ==========================================================================
 */
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    likedTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    watchHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    preferences: {
        theme: { type: String, default: 'dark' },
        autoplay: { type: Boolean, default: true }
    }
}, { timestamps: true });

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    producer: { type: String, default: 'Unknown Producer', trim: true },
    thumbnail: { type: String, required: true },
    youtubeId: { type: String, required: true, unique: true },
    duration: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

// Database Engine Connector Routine
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB Successfully.');
        
        // Truncation maintenance pipeline handling programmatic flushing
        if (process.env.RESET_DB === 'true') {
            console.log('⚠️ RESET_DB active. Flushing old metadata tracks...');
            try {
                await Track.deleteMany({});
                console.log('✅ Stale database rows successfully truncated.');
            } catch (err) {
                console.error('❌ Database truncation fault:', err);
            }
        }
    })
    .catch(err => console.error('Database Connection Initialization Error:', err));

/**
 * ==========================================================================
 * DATA PARSING UTILITIES
 * ==========================================================================
 */
const getSecureThumbnail = (video) => {
    const defaultPlaceholder = 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=500&auto=format&fit=crop';
    if (!video.videoId) return defaultPlaceholder;
    
    const rawImage = video.image || video.thumbnail;
    if (!rawImage || rawImage.includes('pixel') || rawImage.includes('blank')) {
        return `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`; 
    }
    return rawImage.replace('hqdefault.jpg', 'mqdefault.jpg');
};

/**
 * ==========================================================================
 * SECURITY MIDDLEWARE LAYER
 * ==========================================================================
 */
const authenticateBearerToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Missing authentication credentials.' });

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) return res.status(401).json({ message: 'User session no longer valid.' });
        
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Invalid or expired authorization token.' });
    }
};

/**
 * ==========================================================================
 * API ROUTING SYSTEM
 * ==========================================================================
 */

// --- Authentication Controllers ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || username.trim().length < 3 || password.length < 6) {
            return res.status(400).json({ message: 'Invalid username (min 3 chars) or password (min 6 chars).' });
        }

        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) return res.status(400).json({ message: 'This username is already occupied.' });

        const salt = await bcrypt.genSalt(10);
        const encryptedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            username: username.toLowerCase(),
            password: encryptedPassword
        });

        const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({ token, user: { id: newUser._id, username: newUser.username } });
    } catch (err) {
        return res.status(500).json({ message: 'Error executing account registration loop.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Missing login criteria parameters.' });

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid combination of identity credentials.' });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({
            token,
            user: { id: user._id, username: user.username, likedTracks: user.likedTracks, watchHistory: user.watchHistory }
        });
    } catch (err) {
        return res.status(500).json({ message: 'Authentication process transaction anomaly.' });
    }
});

app.get('/api/auth/me', authenticateBearerToken, (req, res) => {
    return res.status(200).json(req.user);
});

// --- Catalog Retrieval & Scraping Pipeline Engine ---
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        const producerTarget = req.query.producer;

        if (producerTarget && producerTarget.trim().length > 0) {
            const channelDataQuery = await ytSearch({ query: producerTarget, category: 'channels' });
            if (channelDataQuery && channelDataQuery.channels && channelDataQuery.channels.length > 0) {
                const matchedChannel = channelDataQuery.channels[0];
                const baseFeed = await ytSearch({ channelId: matchedChannel.id });
                let compiledVideos = baseFeed && baseFeed.videos ? [...baseFeed.videos] : [];

                const searchResults = await ytSearch({ query: `"${producerTarget}" music` });
                if (searchResults && searchResults.videos) compiledVideos = compiledVideos.concat(searchResults.videos);

                const uniqueVideoMap = {};
                compiledVideos.forEach(v => { uniqueVideoMap[v.videoId] = v; });
                const finalScrapedPool = Object.values(uniqueVideoMap).filter(v => (v.seconds || 0) > 40);

                if (finalScrapedPool.length > 0) {
                    const bulkOperations = finalScrapedPool.map(video => {
                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        return {
                            updateOne: {
                                filter: { youtubeId: video.videoId },
                                update: {
                                    title: cleanTitle,
                                    producer: video.author.name || producerTarget, 
                                    thumbnail: getSecureThumbnail(video),
                                    youtubeId: video.videoId,
                                    duration: video.seconds || 0,
                                    views: video.views || 0,
                                    type: 'music',
                                    tags: ['music', 'scraped']
                                },
                                upsert: true
                            }
                        };
                    });
                    await Track.bulkWrite(bulkOperations);
                }
            }
        } else if (queryToken && queryToken.trim().length > 0) {
            const standardSearch = await ytSearch({ query: queryToken });
            if (standardSearch && standardSearch.videos) {
                const poolSlice = standardSearch.videos.slice(0, 40).filter(v => (v.seconds || 0) >= 45);
                if (poolSlice.length > 0) {
                    const bulkOperations = poolSlice.map(video => {
                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        return {
                            updateOne: {
                                filter: { youtubeId: video.videoId },
                                update: {
                                    title: cleanTitle,
                                    producer: video.author.name || 'Unknown Producer',
                                    thumbnail: getSecureThumbnail(video),
                                    youtubeId: video.videoId,
                                    duration: video.seconds || 0,
                                    views: video.views || 0,
                                    type: 'music',
                                    tags: ['music', 'search-result']
                                },
                                upsert: true
                            }
                        };
                    });
                    await Track.bulkWrite(bulkOperations);
                }
            }
        }

        // Apply filters to construct MongoDB lookup expressions
        let queryCondition = {};
        if (producerTarget) queryCondition = { producer: { $regex: producerTarget, $options: 'i' } };
        else if (queryToken) {
            queryCondition = {
                $or: [
                    { title: { $regex: queryToken, $options: 'i' } },
                    { producer: { $regex: queryToken, $options: 'i' } }
                ]
            };
        }

        const feedCatalog = await Track.find(queryCondition).sort({ _id: -1 }).limit(100);
        return res.status(200).json(feedCatalog);
    } catch (err) { 
        return res.status(500).json({ message: 'Internal Server Error handling video collection parsing.' }); 
    }
});

// --- Extended User Actions (Likes & Metrics Tracking) ---
app.post('/api/users/like', authenticateBearerToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(trackId)) return res.status(400).json({ message: 'Malformed track identifier.' });

        const user = req.user;
        const trackIndex = user.likedTracks.indexOf(trackId);

        if (trackIndex === -1) {
            user.likedTracks.push(trackId);
        } else {
            user.likedTracks.splice(trackIndex, 1);
        }

        await user.save();
        return res.status(200).json({ likedTracks: user.likedTracks });
    } catch (err) {
        return res.status(500).json({ message: 'Failure attempting modification of interaction matrices.' });
    }
});

app.post('/api/users/history', authenticateBearerToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(trackId)) return res.status(400).json({ message: 'Malformed track structure payload.' });

        const user = req.user;
        // Clean out existing occurrences to lift item to the absolute front of stack arrays
        user.watchHistory = user.watchHistory.filter(id => id.toString() !== trackId);
        user.watchHistory.unshift(trackId);

        // Enforce maximum logging boundaries
        if (user.watchHistory.length > 50) user.watchHistory.pop();

        await user.save();
        return res.status(200).json({ watchHistory: user.watchHistory });
    } catch (err) {
        return res.status(500).json({ message: 'Failure updating history logs.' });
    }
});

// Serve Client Engine Overrides Globally
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Melodify Gateway Core executing live on port: ${PORT}`));
