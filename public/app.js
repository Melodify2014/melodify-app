// Complete Database Mock Repository explicitly categorized for structural tracking
const TRACK_DATABASE = [
    { id: "t1", title: "TOP 50 MOST VIRAL PHONK MIX 2026", producer: "TOKYO GOD", type: "music", tags: ["viral", "drift", "aggressive"], thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300" },
    { id: "t2", title: "Phonk Music Pain 🤯", producer: "raxed", type: "music", tags: ["chill", "sad", "ambient"], thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300" },
    { id: "t3", title: "VIRAL PHONK/FUNK SENSATION", producer: "RioX", type: "music", tags: ["funk", "brazilian", "dance"], thumbnail: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300" },
    { id: "t4", title: "🔥 VIRAL PHONK PLAYLIST VOL 2", producer: "PHONK_MUSIC_MATRIX", type: "music", tags: ["viral", "drift", "bass"], thumbnail: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=300" },
    { id: "t5", title: "AURA = ∞ | 1 HOUR CHILL PHONK", producer: "EMPIRE PHONK", type: "music", tags: ["chill", "ambient", "aura"], thumbnail: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300" },
    { id: "t6", title: "Top 8 Phonk Songs of the Month", producer: "Phonk Mind", type: "music", tags: ["monthly", "curated", "drift"], thumbnail: "https://images.unsplash.com/photo-1516280440614-37939bbacd6a?q=80&w=300" },
    { id: "t7", title: "Behind the Drift Beats: Producer Interview", producer: "Phonk Culture Media", type: "interview", tags: ["talk", "educational", "producer"], thumbnail: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=300" },
    { id: "t8", title: "GUESS THE 50 PHONK SONGS (CHALLENGE)", producer: "Phonk Trivia Inc", type: "game", tags: ["interactive", "game", "quiz"], thumbnail: "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=80&w=300" },
    { id: "t9", title: "BRAZILIAN MANIA MANIACK (SLOWED)", producer: "RioX", type: "music", tags: ["funk", "brazilian", "slowed"], thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300" },
    { id: "t10", title: "DRIFT KING APEX METROPOLIS", producer: "TOKYO GOD", type: "music", tags: ["drift", "aggressive", "bass"], thumbnail: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=300" }
];

// Tracking Profiles persistent memory engine
let userHistory = JSON.parse(localStorage.getItem('melodify_history')) || [];
let likedTrackIds = JSON.parse(localStorage.getItem('melodify_liked')) || [];

// Active Client Application Memory State
let currentTrack = null;
let isPlaying = false;
let isLooping = false;
let activeFilter = 'all'; 
let searchQuery = '';

// DOM Element Registry Selector Blocks
const tracksGrid = document.getElementById('tracks-grid');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const filterAllBtn = document.getElementById('filter-all');
const filterMusicBtn = document.getElementById('filter-music');
const feedHeading = document.getElementById('feed-heading');

// Player Component Intersect DOM Elements
const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerProducer = document.getElementById('player-producer');
const playerPlayBtn = document.getElementById('player-play-btn');
const playIcon = document.getElementById('play-icon');
const playerLoopBtn = document.getElementById('player-loop-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const likeIcon = document.getElementById('like-icon');

/**
 * Intelligent Content Recommendation Engine
 * Computes live mathematical similarity vectors based on user engagement profiles
 * instead of displaying generic static items.
 */
function computeSmartRecommendations() {
    if (userHistory.length === 0 && likedTrackIds.length === 0) {
        // Safe Default: Fallback to global database matrix array order sequence
        return [...TRACK_DATABASE];
    }

    // Phase 1: Compile weighted interest matrices from profile parameters
    const categoryWeights = {};
    
    // Process profile histories
    userHistory.forEach(trackId => {
        const item = TRACK_DATABASE.find(t => t.id === trackId);
        if (item) {
            item.tags.forEach(tag => {
                categoryWeights[tag] = (categoryWeights[tag] || 0) + 1; // 1 point per execution watch
            });
        }
    });

    // Escalate value for explicit user preferences
    likedTrackIds.forEach(trackId => {
        const item = TRACK_DATABASE.find(t => t.id === trackId);
        if (item) {
            item.tags.forEach(tag => {
                categoryWeights[tag] = (categoryWeights[tag] || 0) + 3; // 3 points for explicit likes
            });
        }
    });

    // Phase 2: Compute scoring algorithm for all remaining components
    const scoredTracks = TRACK_DATABASE.map(track => {
        let profileMatchScore = 0;
        
        // Accumulate tags density mapping evaluation scores
        track.tags.forEach(tag => {
            if (categoryWeights[tag]) {
                profileMatchScore += categoryWeights[tag];
            }
        });

        // Boost items by same producer profile match vector
        const watchedProducers = userHistory.map(id => TRACK_DATABASE.find(t => t.id === id)?.producer).filter(Boolean);
        if (watchedProducers.includes(track.producer)) {
            profileMatchScore += 2;
        }

        return { track, score: profileMatchScore };
    });

    // Phase 3: Order tracks according to personalized score mapping vectors
    scoredTracks.sort((a, b) => b.score - a.score);
    return scoredTracks.map(item => item.track);
}

/**
 * Primary UI Synchronization Display Renderer Method
 */
function renderFeed() {
    tracksGrid.innerHTML = '';
    
    // Run content analysis array algorithm processing pipeline
    const recommendedSource = computeSmartRecommendations();

    // Apply active filter state mechanisms
    const filteredSource = recommendedSource.filter(track => {
        const matchText = track.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          track.producer.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (activeFilter === 'music') {
            return matchText && track.type === 'music';
        }
        return matchText;
    });

    // Generate explicit programmatic HTML architecture components 
    filteredSource.forEach(track => {
        const itemIsLiked = likedTrackIds.includes(track.id);
        const card = document.createElement('div');
        card.className = "bg-zinc-900/40 p-4 rounded-xl border border-zinc-900 hover:bg-zinc-800/50 transition-all cursor-pointer group select-none relative";
        
        card.innerHTML = `
            <div class="relative mb-3 aspect-square overflow-hidden rounded-md bg-zinc-800">
                <img src="${track.thumbnail}" alt="${track.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                ${itemIsLiked ? `<div class="absolute top-2 right-2 bg-black/70 w-7 h-7 rounded-full flex items-center justify-center text-red-500 text-xs"><i class="fa-solid fa-heart"></i></div>` : ''}
            </div>
            <h3 class="font-bold text-sm text-white truncate mb-1">${track.title}</h3>
            <div class="flex items-center justify-between text-xs text-zinc-400">
                <span class="truncate max-w-[90px]">${track.producer}</span>
                <span class="bg-zinc-800 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded text-zinc-300">${track.type}</span>
            </div>
        `;

        card.addEventListener('click', () => selectAndPlayTrack(track));
        tracksGrid.appendChild(card);
    });

    if (filteredSource.length === 0) {
        tracksGrid.innerHTML = `<div class="col-span-full text-center py-12 text-zinc-500 text-sm">No specific phonk tracks found matching the selection profile filters.</div>`;
    }
}

/**
 * Handle Selection Tracking Pipeline Execution Vectors
 */
function selectAndPlayTrack(track) {
    currentTrack = track;
    
    // Register event to runtime interaction arrays
    if (!userHistory.includes(track.id)) {
        userHistory.push(track.id);
        if (userHistory.length > 20) userHistory.shift(); // Bound memory capacity
        localStorage.setItem('melodify_history', JSON.stringify(userHistory));
    }

    // Sync media controls element tree layouts
    playerThumb.src = track.thumbnail;
    playerTitle.textContent = track.title;
    playerProducer.textContent = track.producer;

    isPlaying = true;
    updatePlayerControlsUI();
    
    // Dynamic Reordering Event: Instantly compute recalculations based on choice behavior 
    renderFeed();
}

/**
 * Updates Player Interface Control State Colors and Elements
 */
function updatePlayerControlsUI() {
    // 1. Play Icon Mutation Control State Verification Logic
    if (isPlaying) {
        playIcon.className = "fa-solid fa-pause";
    } else {
        playIcon.className = "fa-solid fa-play translate-x-[1px]";
    }

    // 2. Loop Controller Toggle Configuration Layout Styles
    if (isLooping) {
        playerLoopBtn.className = "text-purple-500 hover:text-purple-400 transition-colors text-sm focus:outline-none";
    } else {
        playerLoopBtn.className = "text-zinc-500 hover:text-zinc-300 transition-colors text-sm focus:outline-none";
    }

    // 3. Like Button Configuration Vector Checks (Hollow/Solid Toggle Engine)
    if (currentTrack && likedTrackIds.includes(currentTrack.id)) {
        playerLikeBtn.className = "text-red-500 hover:text-red-400 transition-colors text-sm focus:outline-none";
        likeIcon.className = "fa-solid fa-heart";
    } else {
        playerLikeBtn.className = "text-zinc-500 hover:text-zinc-300 transition-colors text-sm focus:outline-none";
        likeIcon.className = "fa-regular fa-heart";
    }
}

// Global UI Interactive Activation Listeners
playerPlayBtn.addEventListener('click', () => {
    if (!currentTrack) return;
    isPlaying = !isPlaying;
    updatePlayerControlsUI();
});

playerLoopBtn.addEventListener('click', () => {
    isLooping = !isLooping;
    updatePlayerControlsUI();
});

playerLikeBtn.addEventListener('click', () => {
    if (!currentTrack) return;
    
    const indexing = likedTrackIds.indexOf(currentTrack.id);
    if (indexing === -1) {
        likedTrackIds.push(currentTrack.id);
    } else {
        likedTrackIds.splice(indexing, 1);
    }
    
    localStorage.setItem('melodify_liked', JSON.stringify(likedTrackIds));
    updatePlayerControlsUI();
    renderFeed(); // Dynamically recompute feeds to re-rank item recommendations based on action data
});

// Category Filter Controller Binding Implementations
filterAllBtn.addEventListener('click', () => {
    activeFilter = 'all';
    filterAllBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-white text-black";
    filterMusicBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-zinc-900 text-zinc-400 hover:text-white";
    feedHeading.textContent = "phonk feed";
    renderFeed();
});

filterMusicBtn.addEventListener('click', () => {
    activeFilter = 'music';
    filterMusicBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-purple-500 text-white";
    filterAllBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-zinc-900 text-zinc-400 hover:text-white";
    feedHeading.textContent = "music only feed";
    renderFeed();
});

// Search Bar Input Processing Mechanics
const handleSearchExecution = () => {
    searchQuery = searchInput.value;
    renderFeed();
};
searchBtn.addEventListener('click', handleSearchExecution);
searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleSearchExecution(); });

// Bootstrap initialization configuration system execution trigger
updatePlayerControlsUI();
renderFeed();
