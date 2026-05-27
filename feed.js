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

// This endpoint answers at /feed/tracks (Matches your custom data-fetching routine)
router.get('/tracks', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database offline." });
    }
    try {
        const tracks = await Track.find({}).limit(20);
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: "Failed to grab system catalog data." });
    }
});

module.exports = router;
