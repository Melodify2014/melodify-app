const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ytSearch = require('yt-search');

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});

const Track = mongoose.models.Track || mongoose.model('Track', TrackSchema);
const CHANNELS_TO_FEED = ['CG5']; 

// Expose track fetch endpoint
router.get('/tracks', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database pipeline currently offline.' });
    }
    try {
        const tracks = await Track.find({});
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tracks from catalog database.' });
    }
});

// Background Sync Scraper Execution endpoint
router.get('/sync', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, error: 'Database offline.' });
    }
    
    // Process async execution without making browser wait endlessly for response loop
    res.json({ success: true, message: "Deep ingest execution cycle kicked to background threads." });

    (async () => {
        try {
            for (const artist of CHANNELS_TO_FEED) {
                const queries = [`"${artist}" songs`, `"${artist}" official track sound`];
                for (const term of queries) {
                    const searchResults = await ytSearch({ query: term });
                    if (!searchResults || !searchResults.videos) continue;

                    for (const video of searchResults.videos) {
                        if ((video.seconds || 0) < 45) continue;
                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        
                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: cleanTitle,
                                producer: artist, 
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: ['music']
                            },
                            { upsert: true, new: true }
                        );
                    }
                }
            }
            console.log("🚀 Background catalog sync operation complete.");
        } catch (bgErr) {
            console.error("Error in background collection sync execution:", bgErr.message);
        }
    })();
});

module.exports = router;
