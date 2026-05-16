import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend files statically from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// YouTube API Search Router
app.get('/api/search', async (req, res) => {
    try {
        const { q, channelId } = req.query;
        
        const API_KEY = process.env.YOUTUBE_API_KEY || "YOUR_LOCAL_YOUTUBE_API_KEY";
        
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
            thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.medium.url,
            channelId: item.snippet.channelId
        }));

        res.json({ videos });
    } catch (err) {
        res.status(500).json({ error: "Failed connecting to database matrix stream." });
    }
});

// FIX: Catch-all syntax updated to '/*splat' for Express 5 compatibility
app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Melodify Engine Live at: http://localhost:${PORT}`));