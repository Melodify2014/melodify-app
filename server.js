import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_matrix_key';

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/melodify';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Vault Connected Seamlessly'))
    .catch(err => console.error('Database connection error:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    likedTracks: { type: Array, default: [] },
    followingArtists: { type: Map, of: String, default: {} }
});
const User = mongoose.model('User', userSchema);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Sign-in required.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
};

/* --- AUTHENTICATION --- */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Credentials incomplete.' });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username already taken.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'Account constructed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server registration failure.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'User profile not found.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Incorrect password verification.' });

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token, 
            username: user.username, 
            likedTracks: user.likedTracks, 
            followingArtists: user.followingArtists 
        });
    } catch (err) {
        res.status(500).json({ error: 'Login authentication failure.' });
    }
});

/* --- DATA SYNC --- */
app.post('/api/user/sync', authenticateToken, async (req, res) => {
    try {
        const { likedTracks, followingArtists } = req.body;
        await User.findByIdAndUpdate(req.user.id, { likedTracks, followingArtists });
        res.json({ success: true, message: 'Cloud sync complete.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed syncing profile payload.' });
    }
});

/* --- YOUTUBE PROXY STREAM --- */
app.get('/api/search', async (req, res) => {
    try {
        const { q, channelId } = req.query;
        const API_KEY = process.env.YOUTUBE_API_KEY || "YOUR_LOCAL_API_KEY";
        let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&type=video&key=${API_KEY}`;
        
        if (channelId) {
            url += `&channelId=${channelId}&order=date`;
        } else if (q) {
            url += `&q=${encodeURIComponent(q)}`;
        }

        const fetchResponse = await fetch(url);
        const data = await fetchResponse.json();
        
        const videos = (data.items || []).map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
            channelId: item.snippet.channelId
        }));
        res.json({ videos });
    } catch (err) {
        res.status(500).json({ error: "Failed connecting to data stream system." });
    }
});

app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Melodify Secured Core Running on Port: ${PORT}`));
