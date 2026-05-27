/**
 * Melodify Deep Catalog Seeder & Router Route
 * Handles data fetching and exposes an API endpoint for the frontend.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ytSearch = require('yt-search');

// Use the existing Mongoose Schema model (must match exactly across files)
const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});

// Avoid re-compiling the model if it was already initialized in server.js
const Track = mongoose.models.Track || mongoose.model('Track', TrackSchema);

const CHANNELS_TO_FEED = ['CG5']; 

// ─── API ENDPOINT: GET ALL TRACKS ──────────────────────────────────────────
// Accessible at: https://melodify-phonk.onrender.com/feed/tracks
router.get('/tracks', async (req, res) => {
    try {
        const tracks = await Track.find({});
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tracks from database' });
    }
});

// ─── API ENDPOINT: RUN YOUTUBE SCRAPER SYNC ───────────────────────────────
// Accessible at: https://melodify-phonk.onrender.com/feed/sync
router.get('/sync', async (req, res) => {
    try {
        console.log('Initiating on-demand catalog sync...');
        let syncCount = 0;

        for (const artist of CHANNELS_TO_FEED) {
            const queries = [
                `"${artist}" songs`,
                `"${artist}" gaming animation music`,
                `"${artist}" phonk remix remix`,
                `"${artist}" official track sound`
            ];

            for (const term of queries) {
                try {
                    const searchResults = await ytSearch({ query: term });
                    if (!searchResults || !searchResults.videos) continue;

                    for (const video of searchResults.videos) {
                        if ((video.seconds || 0) < 45) continue;

                        const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                        const isDriftPhonk = /drift|phonk|rave|lxst|dxrk/i.test(video.title);

                        await Track.findOneAndUpdate(
                            { youtubeId: video.videoId },
                            {
                                title: cleanTitle,
                                producer: artist, 
                                thumbnail: video.image || video.thumbnail,
                                youtubeId: video.videoId,
                                type: 'music',
                                tags: isDriftPhonk ? ['drift', 'phonk'] : ['music']
                            },
                            { upsert: true, new: true }
                        );
                        syncCount++;
                    }
                } catch (scrapeErr) {
                    console.error(`Error scraping query term ${term}:`, scrapeErr);
                }
            }
        }
        res.json({ success: true, message: `Sync complete. Processed ${syncCount} elements.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router; // Essential line to expose this to your server.js
