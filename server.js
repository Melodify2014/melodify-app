/**
 * Melodify Backend Gateway Server
 * Robust Deep-Search Engine Optimization for Massive Channel Playlists
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
 * DATABASE CONFIGURATION
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
    .then(() => console.log('Connected to MongoDB.'))
    .catch(err => console.error('Database Error:', err));

/**
 * AUTHENTICATION MIDDLEWARE
 */
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

/**
 * AUTHENTICATION ENDPOINTS
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Credentials required.' });
        const exists = await User.findOne({ username: username.toLowerCase() });
        if (exists) return res.status(400).json({ message: 'Username taken.' });

        const encryptedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: username.toLowerCase(), password: encryptedPassword });
        return res.status(201).json({ message: 'User created.' });
    } catch (err) { return res.status(500).json({ message: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token });
    } catch (err) { return res.status(500).json({ message: 'Login failed.' }); }
});

app.get('/api/auth/me', parseBearerAuthenticationToken, (req, res) => {
    return res.status(200).json(req.verifiedUser);
});

/**
 * RE-ENGINEERED TRACK ENGINE ENDPOINT
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        const producerTarget = req.query.producer;

        if (producerTarget && producerTarget.trim().length > 0) {
            try {
                // Completely bypass the broken 18-video channel API loop.
                // Run an intensive structural search locked directly to the creator's upload name.
                const intensiveSearch = await ytSearch({ query: `"${producerTarget}" song music`, pages: 3 });
                
                if (intensiveSearch && intensiveSearch.videos) {
                    // Filter down to long-form songs, throwing out shorts/clips
                    const filteredItems = intensiveSearch.videos.filter(v => {
                        const isMatch = v.author.name.toLowerCase().includes(producerTarget.toLowerCase()) || 
                                        v.title.toLowerCase().includes(producerTarget.toLowerCase());
                        return isMatch && (v.seconds || 0) > 45;
                    });

                    // Bulk insert/update discovered media maps directly into your Mongo cache
                    for (const video of filteredItems) {
                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        const isDriftPhonk = /drift|phonk|rave|lxst|dxrk/i.test(video.title);

                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: cleanTitle,
                                producer: producerTarget,
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: isDriftPhonk ? ['drift', 'phonk'] : ['music']
                            },
                            { upsert: true }
                        );
                    }
                }
            } catch (err) {
                console.error("Scraper update skipped gracefully:", err);
            }
        } else if (queryToken && queryToken.trim().length > 0) {
            // General feed search query loop fallback handler
            try {
                const standardSearch = await ytSearch({ query: queryToken });
                if (standardSearch && standardSearch.videos) {
                    for (const video of standardSearch.videos.slice(0, 50)) {
                        if ((video.seconds || 0) < 45) continue;
                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: cleanTitle,
                                producer: video.author.name || 'Unknown Producer',
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: ['music']
                            },
                            { upsert: true }
                        );
                    }
                }
            } catch (e) {}
        }

        // Database Filtering Execution Core
        let queryCondition = {};
        if (producerTarget) {
            queryCondition = { producer: { $regex: producerTarget, $options: 'i' } };
        } else if (queryToken) {
            queryCondition = {
                $or: [
                    { title: { $regex: queryToken, $options: 'i' } },
                    { producer: { $regex: queryToken, $options: 'i' } }
                ]
            };
        }

        // Display up to 500 records smoothly on screen
        const feedCatalog = await Track.find(queryCondition).sort({ _id: -1 }).limit(500);
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading tracks matrix.' });
    }
});

/**
 * ACTION ROUTING HANDLERS
 */
app.post('/api/users/history', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!req.verifiedUser.watchHistory.includes(trackId)) {
            req.verifiedUser.watchHistory.push(trackId);
            await req.verifiedUser.save();
        }
        return res.status(200).json(req.verifiedUser);
    } catch (e) { return res.status(500).json({ message: 'Failed writing history.' }); }
});

app.post('/api/users/like', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        const pos = req.verifiedUser.likedTracks.indexOf(trackId);
        if (pos === -1) req.verifiedUser.likedTracks.push(trackId);
        else req.verifiedUser.likedTracks.splice(pos, 1);
        await req.verifiedUser.save();
        return res.status(200).json({ likedTracks: req.verifiedUser.likedTracks });
    } catch (e) { return res.status(500).json({ message: 'Like configuration failed.' }); }
});

app.post('/api/users/follow', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { producerName } = req.body;
        const pos = req.verifiedUser.following.indexOf(producerName);
        if (pos === -1) req.verifiedUser.following.push(producerName);
        else req.verifiedUser.following.splice(pos, 1);
        await req.verifiedUser.save();
        return res.status(200).json({ following: req.verifiedUser.following });
    } catch (err) { return res.status(500).json({ message: 'Follow alteration failure.' }); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server executing at http://localhost:${PORT}`));
