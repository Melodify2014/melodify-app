const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' }
});
const Track = mongoose.models.Track || mongoose.model('Track', TrackSchema);

// FIXED: Built-in local fallback array prevents 503 error states if MongoDB is offline!
const FALLBACK_CATALOG = [
    { title: "FLY", producer: "CG5", youtubeId: "dQw4w9WgXcQ", thumbnail: "" },
    { title: "NEVER GONNA GIVE YOU UP", producer: "Rick Astley", youtubeId: "dQw4w9WgXcQ", thumbnail: "" },
    { title: "METAMORPHOSIS (PHONK)", producer: "INTERWORLD", youtubeId: "Hff7UzF4_lM", thumbnail: "" }
];

router.get('/tracks', async (req, res) => {
    // If database is down/connecting, return backup tracks instead of crashing with a 503
    if (mongoose.connection.readyState !== 1) {
        console.log("Database offline - Serving backup music catalog vectors.");
        return res.json(FALLBACK_CATALOG);
    }
    try {
        const tracks = await Track.find({}).limit(30);
        if (tracks.length === 0) return res.json(FALLBACK_CATALOG);
        res.json(tracks);
    } catch (err) {
        res.json(FALLBACK_CATALOG);
    }
});

module.exports = router;
