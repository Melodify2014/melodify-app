/**
 * Melodify Ultimate Production Backend Gateway Server
 * Engineered for True Infinite Channel Scraping, Pagination, & Dynamic Producer Mapping
 * Incorporates: High-Speed Concurrency, Bulk Writing Cache Matrix, & Anti-404 Image Sanitization
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

// Serve static assets out of your public frontend build directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ==========================================================================
 * DATABASE CONFIGURATION
 * ==========================================================================
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
}, { timestamps: true }); // Tracks when records enter our cache matrix

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

/**
 * DATABASE CONNECTION & PROGRAMMATIC RENDER RESET HOOK
 */
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB Successfully.');
        
        // Dynamic clean up loop for Render environment controls
        if (process.env.RESET_DB === 'true') {
            console.log('⚠️ RESET_DB flag detected. Clearing stale track cache...');
            try {
                await Track.deleteMany({});
                console.log('✅ Stale track cache cleared successfully.');
            } catch (resetErr) {
                console.error('❌ Failed to clear track cache:', resetErr);
            }
        }
    })
    .catch(err => console.error('Database Connection Error:', err));

/**
 * ==========================================================================
 * UTILITY FUNCTIONS: THUMBNAIL VALIDATION SYSTEM
 * ==========================================================================
 * Catch and rewrite broken hqdefault configuration layers to prevent browser 404s
 */
const getSecureThumbnail = (video) => {
    const fallbackNeonImage = 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=500&auto=format&fit=crop';
    
    if (!video.videoId) return fallbackNeonImage;
    
    const rawImage = video.image || video.thumbnail;
    if (!rawImage || rawImage.includes('pixel') || rawImage.includes('blank')) {
        // Fallback to medium quality standard backgrounds which always generate safely
        return `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`; 
    }
    
    // Convert problematic high-definition strings to fast medium resolution links
    return rawImage.replace('hqdefault.jpg', 'mqdefault.jpg');
};

/**
 * ==========================================================================
 * AUTHENTICATION MIDDLEWARE
 * ==========================================================================
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
 * ==========================================================================
 * AUTHENTICATION ENDPOINTS
 * ==========================================================================
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
        const exists = await User.findOne({ username: username.toLowerCase() });
        if (exists) return res.status(400).json({ message: 'Username already taken.' });

        const encryptedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: username.toLowerCase(), password: encryptedPassword });
        return res.status(201).json({ message: 'User created successfully.' });
    } catch (err) { return res.status(500).json({ message: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
        
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
 * ==========================================================================
 * DYNAMIC MULTI-PAGE CHANNELS TRACK FINDER ENDPOINT (CONCURRENT OPS)
 * ==========================================================================
 */
app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        const producerTarget = req.query.producer;

        if (producerTarget && producerTarget.trim().length > 0) {
            try {
                const channelDataQuery = await ytSearch({ query: producerTarget, category: 'channels' });
                
                if (channelDataQuery && channelDataQuery.channels && channelDataQuery.channels.length > 0) {
                    const matchedChannel = channelDataQuery.channels[0];
                    
                    const deepScrapePhrases = [
                        `"${producerTarget}" music`,
                        `"${producerTarget}" tracks`
                    ];

                    let compiledVideos = [];
                    const baseFeed = await ytSearch({ channelId: matchedChannel.id });
                    if (baseFeed && baseFeed.videos) compiledVideos = [...baseFeed.videos];

                    // Fire text requests concurrently using multi-thread asynchronous resolving
                    const searchPromises = deepScrapePhrases.map(phrase => ytSearch({ query: phrase }));
                    const searchResults = await Promise.all(searchPromises);

                    searchResults.forEach(result => {
                        if (result && result.videos) {
                            compiledVideos = compiledVideos.concat(result.videos);
                        }
                    });

                    const uniqueVideoMap = {};
                    compiledVideos.forEach(v => { uniqueVideoMap[v.videoId] = v; });
                    const finalScrapedPool = Object.values(uniqueVideoMap).filter(v => (v.seconds || 0) > 40);

                    // Execute a rapid bulk injection cluster to MongoDB
                    if (finalScrapedPool.length > 0) {
                        const bulkOperations = finalScrapedPool.map(video => {
                            const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                            const isDriftPhonk = /drift|phonk|rave|lxst|dxrk/i.test(video.title);
                            
                            return {
                                updateOne: {
                                    filter: { youtubeId: video.videoId },
                                    update: {
                                        title: cleanTitle,
                                        producer: video.author.name || producerTarget, 
                                        thumbnail: getSecureThumbnail(video),
                                        youtubeId: video.videoId,
                                        type: 'music',
                                        tags: isDriftPhonk ? ['drift', 'phonk'] : ['music']
                                    },
                                    upsert: true
                                }
                            };
                        });
                        await Track.bulkWrite(bulkOperations);
                    }
                }
            } catch (err) { 
                console.error("Deep cache pipeline bypass details:", err); 
            }
        } else if (queryToken && queryToken.trim().length > 0) {
            try {
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
                                        type: 'music',
                                        tags: ['music']
                                    },
                                    upsert: true
                                }
                            };
                        });
                        await Track.bulkWrite(bulkOperations);
                    }
                }
            } catch (e) { console.error("Standard system search error:", e); }
        }

        // OUTPUT ENGINE PARSING BASE
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

        const feedCatalog = await Track.find(queryCondition).sort({ _id: -1 }).limit(100);
        return res.status(200).json(feedCatalog);
    } catch (err) {
        return res.status(500).json({ message: 'Failed reading tracks matrix.' });
    }
});

/**
 * ==========================================================================
 * INTERACTION ENDPOINTS
 * ==========================================================================
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
    } catch (e) { return res.status(500).json({ message: 'Like failed.' }); }
});

app.post('/api/users/follow', parseBearerAuthenticationToken, async (req, res) => {
    try {
        const { producerName } = req.body;
        const pos = req.verifiedUser.following.indexOf(producerName);
        if (pos === -1) req.verifiedUser.following.push(producerName);
        else req.verifiedUser.following.splice(pos, 1);
        await req.verifiedUser.save();
        return res.status(200).json({ following: req.verifiedUser.following });
    } catch (err) { return res.status(500).json({ message: 'Follow modification failure.' }); }
});

// Single Page Application SPA catch-all routing fallback block
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Melodify Gateway Core executing live on port: ${PORT}`));
