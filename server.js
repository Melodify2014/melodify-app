/**
 * Melodify Backend Gateway Server
 * Optimized for Deep Channel Syncing and Multi-Video Scraping
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
    .then(() => console.log('Successfully connected to MongoDB.'))
    .catch(err => console.error('Database Connection Error:', err));

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
 * AUTHENTICATION ROUTING INTERFACES
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
        
        const exactMatchExists = await User.findOne({ username: username.toLowerCase() });
        if (exactMatchExists) return res.status(400).json({ message: 'Username already taken.' });

        const encryptedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username: username.toLowerCase(),
            password: encryptedPassword,
            likedTracks: [],
            watchHistory: [],
            following: []
        });
        return res.status(201).json({ message: 'User created successfully.' });
    } catch (err) {
        return res.status(500).json({ message: 'Internal Server Error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const targetUser = await User.findOne({ username: username.toLowerCase() });
        if (!targetUser || !(await bcrypt.compare(password, targetUser.password))) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const assignedTokenWrapper = jwt.sign({ id: targetUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token: assignedTokenWrapper });
    } catch (err) {
        return res.status(500).json({ message: 'Login process crash.' });
    }
});

app.get('/api/auth/me', parseBearerAuthenticationToken, (req, res) => {
    return res.status(200).json(req.verifiedUser);
});

/**
 * DEEP CHANNELS & TRACK FEED API ENDPOINT
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        const producerTarget = req.query.producer;

        const activeSearchTerm = producerTarget || queryToken;
        if (activeSearchTerm && activeSearchTerm.trim().length > 0) {
            try {
                // Pinpoint the channel context infrastructure explicitly
                const channelSearch = await ytSearch({ query: activeSearchTerm, category: 'channels' });
                let searchTargetPool = [];

                if (channelSearch && channelSearch.channels && channelSearch.channels.length > 0) {
                    const matchedChannel = channelSearch.channels[0];
                    
                    // Pull full feed parameters directly from channel ID attributes
                    const fullChannelFeed = await ytSearch({ channelId: matchedChannel.id });
                    if (fullChannelFeed && fullChannelFeed.videos) {
                        // Gather up to 250 records from the creator's upload playlist history
                        searchTargetPool = fullChannelFeed.videos.slice(0, 250); 
                    }
                }

                // Fall back to standard search query loops if channel arrays are empty
                if (searchTargetPool.length === 0) {
                    const regularSearch = await ytSearch({ query: activeSearchTerm });
                    searchTargetPool = regularSearch.videos || [];
                }

                // Exclude shorts/clips and bulk sync local cache matrix
                const targetedVideos = searchTargetPool.filter(video => (video.seconds || 0) > 45);
                for (const video of targetedVideos) {
                    const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                    const isDriftPhonk = /drift|phonk|rave|lxst|dxrk/i.test(video.title);

                    await Track.findOneAndUpdate(
                        { youtubeId: video.videoId },
                        {
                            title: cleanTitle,
                            producer: producerTarget || video.author.name || 'Unknown Producer',
                            thumbnail: video.image || video.thumbnail,
                            youtubeId: video.videoId,
                            type: 'music',
                            tags: isDriftPhonk ? ['drift', 'phonk'] : ['music']
                        },
                        { upsert: true }
                    );
                }
            } catch (searchErr) {
                console.error("Deep video scraper sync bypassed:", searchErr);
            }
        }

        // Build database index filter selectors
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

        // Cap lifted to 500 to render huge playlists (like CG5's complete collection)
        const feedCatalog = await Track.find(queryCondition).sort({ _id: -1 }).limit(500);
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading platform tracks matrix.' });
    }
});

/**
 * USER INTERACTION ROUTING VECTORS
 */
app.post('/api/users/history', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!req.verifiedUser.watchHistory.includes(trackId)) {
            req.verifiedUser.watchHistory.push(trackId);
            await req.verifiedUser.save();
        }
        return res.status(200).json(req.verifiedUser);
    } catch (e) { return res.status(500).json({ message: 'Failed appending history.' }); }
});

app.post('/api/users/like', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        const pos = req.verifiedUser.likedTracks.indexOf(trackId);
        if (pos === -1) req.verifiedUser.likedTracks.push(trackId);
        else req.verifiedUser.likedTracks.splice(pos, 1);
        await req.verifiedUser.save();
        return res.status(200).json({ likedTracks: req.verifiedUser.likedTracks });
    } catch (e) { return res.status(500).json({ message: 'Failed updating like.' }); }
});

app.post('/api/users/follow', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { producerName } = req.body;
        const pos = req.verifiedUser.following.indexOf(producerName);
        if (pos === -1) req.verifiedUser.following.push(producerName);
        else req.verifiedUser.following.splice(pos, 1);
        await req.verifiedUser.save();
        return res.status(200).json({ following: req.verifiedUser.following });
    } catch (err) { return res.status(500).json({ message: 'Failed updating follow state.' }); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Melodify Core Engine running on network hub: http://localhost:${PORT}`);
});
