const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'melodify_secure_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/melodify';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Schema Infrastructure Definitions
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    likedTracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
    watchHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }]
}, { timestamps: true });

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    producer: { type: String, default: 'Unknown Producer', trim: true },
    thumbnail: { type: String, required: true },
    youtubeId: { type: String, required: true, unique: true },
    duration: { type: Number, default: 0 },
    views: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Track = mongoose.model('Track', TrackSchema);

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB Successfully.');
        if (process.env.RESET_DB === 'true' || process.env.RESET_DB === 'tzue') {
            console.log('⚠️ RESET_DB flag detected. Clearing stale track cache...');
            try {
                await Track.deleteMany({});
                console.log('✅ State track cache cleared successfully.');
            } catch (err) { console.error('Database flushing error:', err); }
        }
    })
    .catch(err => console.error('CRITICAL: Database connectivity fault:', err));

const getSecureThumbnail = (video) => {
    if (!video.videoId) return 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=500';
    return `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
};

const authenticateBearerToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Missing token data.' });

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) return res.status(401).json({ message: 'Session session trace dropped.' });
        next();
    } catch (e) { return res.status(403).json({ message: 'Unauthorized session frame.' }); }
};

// Route Processing Logic
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || username.trim().length < 3) return res.status(400).json({ message: 'Invalid field entry requirements.' });

        const exists = await User.findOne({ username: username.toLowerCase() });
        if (exists) return res.status(400).json({ message: 'Username has been taken.' });

        const salt = await bcrypt.genSalt(10);
        const encryptedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({ username: username.toLowerCase(), password: encryptedPassword });
        const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({ token, user: { id: newUser._id, username: newUser.username } });
    } catch (e) { return res.status(500).json({ message: 'Registration fault.' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Identity credentials mismatched.' });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token, user: { id: user._id, username: user.username, likedTracks: user.likedTracks } });
    } catch (e) { return res.status(500).json({ message: 'Authentication framework failure.' }); }
});

app.get('/api/auth/me', authenticateBearerToken, (req, res) => res.status(200).json(req.user));

app.get('/api/tracks', async (req, res) => {
    try {
        const queryToken = req.query.q;
        if (queryToken && queryToken.trim().length > 0) {
            const standardSearch = await ytSearch({ query: queryToken });
            if (standardSearch && standardSearch.videos) {
                const poolSlice = standardSearch.videos.slice(0, 24).filter(v => (v.seconds || 0) >= 10);
                if (poolSlice.length > 0) {
                    const bulkOperations = poolSlice.map(video => ({
                        updateOne: {
                            filter: { youtubeId: video.videoId },
                            update: {
                                title: video.title.replace(/[\(\[].*?[\)\]]/g, '').trim(),
                                producer: video.author.name || 'Unknown Producer',
                                thumbnail: getSecureThumbnail(video),
                                youtubeId: video.videoId,
                                duration: video.seconds || 0,
                                views: video.views || 0
                            },
                            upsert: true
                        }
                    }));
                    await Track.bulkWrite(bulkOperations);
                }
            }
        }

        let cond = {};
        if (queryToken) {
            cond = {
                $or: [
                    { title: { $regex: queryToken, $options: 'i' } },
                    { producer: { $regex: queryToken, $options: 'i' } }
                ]
            };
        }

        const feedCatalog = await Track.find(cond).sort({ _id: -1 }).limit(40);
        return res.status(200).json(feedCatalog);
    } catch (err) { return res.status(500).json({ message: 'Search query parsing error.' }); }
});

app.post('/api/users/like', authenticateBearerToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        const user = req.user;
        const index = user.likedTracks.indexOf(trackId);
        if (index === -1) user.likedTracks.push(trackId);
        else user.likedTracks.splice(index, 1);
        await user.save();
        return res.status(200).json({ likedTracks: user.likedTracks });
    } catch (e) { return res.status(500).json({ message: 'Like logging pipeline error.' }); }
});

app.post('/api/users/history', authenticateBearerToken, async (req, res) => {
    try {
        const { trackId } = req.body;
        req.user.watchHistory = req.user.watchHistory.filter(id => id.toString() !== trackId);
        req.user.watchHistory.unshift(trackId);
        if (req.user.watchHistory.length > 25) req.user.watchHistory.pop();
        await req.user.save();
        return res.status(200).json({ watchHistory: req.user.watchHistory });
    } catch (e) { return res.status(500).json({ message: 'History index modification failed.' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Melodify Gateway Active on Pipeline Port: ${PORT}`));
