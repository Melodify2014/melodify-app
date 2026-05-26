/**
 * Melodify Production Backend Gateway Server
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

// Database Schema Blueprint Configurations
const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
}, { timestamps: true });

const Track = mongoose.model('Track', TrackSchema);

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB Successfully.');
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
    .catch(err => console.error('Database Connection Error:', err));

const getSecureThumbnail = (video) => {
    const defaultPlaceholder = 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=500&auto=format&fit=crop';
    if (!video.videoId) return defaultPlaceholder;
    const rawImage = video.image || video.thumbnail;
    if (!rawImage || rawImage.includes('pixel') || rawImage.includes('blank')) {
        return `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`; 
    }
    return rawImage.replace('hqdefault.jpg', 'mqdefault.jpg');
};

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
        }

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
    } catch (err) { return res.status(500).json({ message: 'Internal Server Error' }); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Executing live on port: ${PORT}`));
