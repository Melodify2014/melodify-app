/**
 * Melodify Deep Catalog Seeder
 * Run this tool directly using terminal command: node feed.js
 */
const mongoose = require('mongoose');
const ytSearch = require('yt-search');

const MONGO_URI = 'mongodb://127.0.0.1:27017/melodify';

const TrackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    producer: { type: String, default: 'Unknown Producer' },
    thumbnail: { type: String },
    youtubeId: { type: String, required: true, unique: true },
    type: { type: String, default: 'music' },
    tags: [{ type: String }]
});
const Track = mongoose.model('Track', TrackSchema);

// Change this name to target any creator you want to inject deep libraries for
const CHANNELS_TO_FEED = ['CG5']; 

async function executeDeepIngest() {
    console.log('Connecting to database core system...');
    await mongoose.connect(MONGO_URI);
    
    for (const artist of CHANNELS_TO_FEED) {
        console.log(`Executing hard brute-force scraping matrix for: ${artist}...`);
        
        // This explicitly downloads multiple pages of search histories to bypass YouTube platform page walls
        const queries = [
            `"${artist}" songs`,
            `"${artist}" gaming animation music`,
            `"${artist}" phonk remix remix`,
            `"${artist}" official track sound`
        ];

        for (const term of queries) {
            console.log(`  -> Pulling data vectors for index query: ${term}`);
            try {
                const searchResults = await ytSearch({ query: term });
                if (!searchResults || !searchResults.videos) continue;

                let addedCounter = 0;
                for (const video of searchResults.videos) {
                    if ((video.seconds || 0) < 45) continue; // Drop short clips

                    const cleanTitle = video.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                    const isDriftPhonk = /drift|phonk|rave|lxst|dxrk/i.test(video.title);

                    const record = await Track.findOneAndUpdate(
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
                    if (record) addedCounter++;
                }
                console.log(`  -> Completed processing index batch. Sync counts: +${addedCounter} elements.`);
            } catch (err) {
                console.error(`Error scraping vector loop node:`, err);
            }
        }
    }

    console.log('Database deep caching process complete. Closing thread connection.');
    await mongoose.disconnect();
    console.log('Process complete. Boot up server.js and check your dashboard now!');
}

executeDeepIngest();
