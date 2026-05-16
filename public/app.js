/**
 * Melodify Core Frontend Logic Engine Architecture
 * Handles backend integrations, live state handling, and dynamic ranking calculations
 */

// Core Runtime State Vectors
let tracksRawCollection = [];
let userSessionProfile = null;
let currentTrack = null;
let isPlaying = false;
let isLooping = false;
let activeFilter = 'all';
let searchQuery = '';
let currentViewMode = 'home'; // Options: 'home', 'following', 'recent', 'liked'

// Simulated Local Storage fallback structures for historical data matrix values
let clientWatchHistory = JSON.parse(localStorage.getItem('melodify_fallback_history')) || [];
let clientLikedTracks = JSON.parse(localStorage.getItem('melodify_fallback_likes')) || [];

// DOM Cache Registry Selector Mapping
const tracksGrid = document.getElementById('tracks-grid');
const searchInput = document.getElementById('search-input');
const filterAllBtn = document.getElementById('filter-all');
const filterMusicBtn = document.getElementById('filter-music');
const feedHeading = document.getElementById('feed-heading');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// Authentication Forms Modal Selectors
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

// Playback Console Element Interfaces
const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerProducer = document.getElementById('player-producer');
const playerPlayBtn = document.getElementById('player-play-btn');
const playIcon = document.getElementById('play-icon');
const playerLoopBtn = document.getElementById('player-loop-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const likeIcon = document.getElementById('like-icon');
const playerProgress = document.getElementById('player-progress');

// Left Navigation Switch Action Array Hook Elements
const navHome = document.getElementById('nav-home');
const navFollowing = document.getElementById('nav-following');
const navRecent = document.getElementById('nav-recent');
const navLiked = document.getElementById('nav-liked');

let isRegisterMode = false;

/**
 * 1. API Network Operations Controller Block
 * Restores connection layers directly targeting server.js endpoints
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('melodify_token');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(endpoint, { ...options, headers });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'API request interface connection mismatch.');
        return data;
    } catch (err) {
        console.error(`Network Exception Event [${endpoint}]:`, err);
        throw err;
    }
}

/**
 * Validates active authorization records against backend server layers on startup
 */
async function synchronizeAuthentication() {
    const localToken = localStorage.getItem('melodify_token');
    if (!localToken) {
        displayAuthPortal(true);
        return;
    }
    try {
        // Ping authentication verify profile endpoint routes
        const userProfile = await apiRequest('/api/auth/me');
        userSessionProfile = userProfile;
        userDisplay.textContent = `Connected: ${userProfile.username}`;
        displayAuthPortal(false);
        await loadTracksDatabase();
    } catch (e) {
        localStorage.removeItem('melodify_token');
        displayAuthPortal(true);
    }
}

/**
 * Pulls current global track collection directly from live backend dataset routes
 */
async function loadTracksDatabase() {
    try {
        const responseData = await apiRequest('/api/tracks');
        // Ensure accurate structural assignment regardless of payload wrapper variations
        tracksRawCollection = Array.isArray(responseData) ? responseData : (responseData.tracks || []);
        
        // Ensure data arrays have tag properties for recommendations
        tracksRawCollection = tracksRawCollection.map((track, i) => ({
            ...track,
            type: track.type || (track.title.toLowerCase().includes('interview') ? 'interview' : track.title.toLowerCase().includes('challenge') ? 'game' : 'music'),
            tags: track.tags || (track.title.toLowerCase().includes('viral') ? ['viral', 'drift'] : i % 2 === 0 ? ['drift', 'aggressive'] : ['chill', 'ambient'])
        }));
        
        renderPersonalizedFeed();
    } catch (err) {
        console.error('Failed processing database source tracks load context.', err);
    }
}

/**
 * 2. Intelligent Adaptive Recommendation Algorithm Engine
 * Evaluates view counters, content categorization patterns, and explicit feedback logs
 * to dynamically re-rank items rather than rendering static lists.
 */
function processSmartRecommendations() {
    if (!tracksRawCollection || tracksRawCollection.length === 0) return [];

    // Base Profile Variables
    const targetHistory = userSessionProfile?.watchHistory || clientWatchHistory;
    const targetLikes = userSessionProfile?.likedTracks || clientLikedTracks;

    if (targetHistory.length === 0 && targetLikes.length === 0) {
        return [...tracksRawCollection]; // Return unfiltered array baseline
    }

    // Step A: Calculate tag-frequency preference densities
    const structuralWeights = {};

    targetHistory.forEach(id => {
        const matchingTrack = tracksRawCollection.find(t => t._id === id || t.id === id);
        if (matchingTrack && matchingTrack.tags) {
            matchingTrack.tags.forEach(tag => {
                structuralWeights[tag] = (structuralWeights[tag] || 0) + 1.5; 
            });
        }
    });

    targetLikes.forEach(id => {
        const matchingTrack = tracksRawCollection.find(t => t._id === id || t.id === id);
        if (matchingTrack && matchingTrack.tags) {
            matchingTrack.tags.forEach(tag => {
                structuralWeights[tag] = (structuralWeights[tag] || 0) + 4.0; // Likes carry highest impact score
            });
        }
    });

    // Step B: Loop evaluate data elements and compute individual match values
    const rankedOutput = tracksRawCollection.map(track => {
        let similarityScore = 0;
        const currentId = track._id || track.id;

        if (track.tags) {
            track.tags.forEach(tag => {
                if (structuralWeights[tag]) similarityScore += structuralWeights[tag];
            });
        }

        // Add matching producer bonus points
        const listenedProducers = targetHistory.map(id => tracksRawCollection.find(t => t._id === id || t.id === id)?.producer).filter(Boolean);
        if (listenedProducers.includes(track.producer)) {
            similarityScore += 2.5;
        }

        // Apply a slight penalty if already watched to keep content fresh
        if (targetHistory.includes(currentId)) {
            similarityScore -= 1.0;
        }

        return { track, score: similarityScore };
    });

    // Step C: Sort descending based on calculated weights
    rankedOutput.sort((x, y) => y.score - x.score);
    return rankedOutput.map(item => item.track);
}

/**
 * 3. Dynamic DOM Generation Layout Rendering Pipeline
 */
function renderPersonalizedFeed() {
    tracksGrid.innerHTML = '';
    
    // Sort items through recommendation engine
    let coreSourcePool = processSmartRecommendations();
    const activeLikesList = userSessionProfile?.likedTracks || clientLikedTracks;
    const activeHistoryList = userSessionProfile?.watchHistory || clientWatchHistory;

    // Filter by navigation view context modes
    if (currentViewMode === 'liked') {
        coreSourcePool = coreSourcePool.filter(t => activeLikesList.includes(t._id || t.id));
        feedHeading.textContent = "Your Liked Collection";
    } else if (currentViewMode === 'recent') {
        coreSourcePool = coreSourcePool.filter(t => activeHistoryList.includes(t._id || t.id));
        feedHeading.textContent = "Recently Played Tracks";
    } else if (currentViewMode === 'following') {
        feedHeading.textContent = "Following Producers Feed";
    } else {
        feedHeading.textContent = activeFilter === 'music' ? "Music Only Feed" : "Phonk Feed";
    }

    // Apply main query and music category switches
    const compiledOutputList = coreSourcePool.filter(track => {
        const textExpression = (track.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (track.producer || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        if (activeFilter === 'music') {
            return textExpression && track.type === 'music';
        }
        return textExpression;
    });

    // Map content elements dynamically to screen grid container
    compiledOutputList.forEach(track => {
        const trackIdentifier = track._id || track.id;
        const trackIsLiked = activeLikesList.includes(trackIdentifier);
        
        const cardBlock = document.createElement('div');
        cardBlock.className = "bg-zinc-900/40 p-4 rounded-xl border border-zinc-900 hover:bg-zinc-800/50 transition-all cursor-pointer group relative flex flex-col justify-between";
        
        cardBlock.innerHTML = `
            <div>
                <div class="relative mb-3 aspect-square overflow-hidden rounded-md bg-zinc-800 shadow-inner">
                    <img src="${track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300'}" alt="Cover Art" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                    ${trackIsLiked ? `<div class="absolute top-2 right-2 bg-black/70 w-7 h-7 rounded-full flex items-center justify-center text-red-500 text-xs shadow"><i class="fa-solid fa-heart"></i></div>` : ''}
                </div>
                <h3 class="font-bold text-sm text-white truncate mb-0.5" title="${track.title}">${track.title}</h3>
            </div>
            <div class="flex items-center justify-between text-xs text-zinc-400 mt-2">
                <span class="truncate max-w-[95px] font-medium">${track.producer || 'Unknown'}</span>
                <span class="bg-zinc-800 text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded text-zinc-300">${track.type || 'track'}</span>
            </div>
        `;

        cardBlock.addEventListener('click', () => dispatchPlaybackAction(track));
        tracksGrid.appendChild(cardBlock);
    });

    if (compiledOutputList.length === 0) {
        tracksGrid.innerHTML = `
            <div class="col-span-full text-center py-16 text-zinc-500 text-sm font-medium">
                No custom matches found inside the "${currentViewMode}" view state context.
            </div>`;
    }
}

/**
 * 4. Playback and Engagement Event Control Trackers
 */
async function dispatchPlaybackAction(track) {
    currentTrack = track;
    const currentId = track._id || track.id;

    // Trigger backend logging endpoints for watch history tracking sync
    try {
        await apiRequest('/api/users/history', {
            method: 'POST',
            body: JSON.stringify({ trackId: currentId })
        });
        if (userSessionProfile && !userSessionProfile.watchHistory.includes(currentId)) {
            userSessionProfile.watchHistory.push(currentId);
        }
    } catch (e) {
        if (!clientWatchHistory.includes(currentId)) {
            clientWatchHistory.push(currentId);
            localStorage.setItem('melodify_fallback_history', JSON.stringify(clientWatchHistory));
        }
    }

    // Bind playback info updates to user player control deck
    playerThumb.src = track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100';
    playerTitle.textContent = track.title;
    playerProducer.textContent = track.producer || 'Unknown Producer';
    
    isPlaying = true;
    playerProgress.style.width = '35%'; // Simulate a running status marker
    
    updateAudioControlBarUI();
    renderPersonalizedFeed(); // Re-rank dynamically based on interaction
}

/**
 * Syncs audio bar button states (gray loop button, outline/solid heart icon)
 */
function updateAudioControlBarUI() {
    // A. Play/Pause Mutation
    playIcon.className = isPlaying ? "fa-solid fa-pause text-xs" : "fa-solid fa-play translate-x-[1px] text-xs";

    // B. Loop Toggle Color Classes
    playerLoopBtn.className = isLooping 
        ? "text-purple-500 hover:text-purple-400 transition-colors text-base focus:outline-none" 
        : "text-zinc-500 hover:text-zinc-300 transition-colors text-base focus:outline-none";

    // C. Like Toggle Color Classes (Hollow/Solid Toggle Conversion Engine)
    const activeLikes = userSessionProfile?.likedTracks || clientLikedTracks;
    const isCurrentLiked = currentTrack && activeLikes.includes(currentTrack._id || currentTrack.id);

    if (isCurrentLiked) {
        playerLikeBtn.className = "text-red-500 hover:text-red-400 transition-colors text-base focus:outline-none";
        likeIcon.className = "fa-solid fa-heart";
    } else {
        playerLikeBtn.className = "text-zinc-500 hover:text-zinc-300 transition-colors text-base focus:outline-none";
        likeIcon.className = "fa-regular fa-heart";
    }
}

// Media Audio Bar Click Registries
playerPlayBtn.addEventListener('click', () => {
    if (!currentTrack) return;
    isPlaying = !isPlaying;
    updateAudioControlBarUI();
});

playerLoopBtn.addEventListener('click', () => {
    isLooping = !isLooping;
    updateAudioControlBarUI();
});

playerLikeBtn.addEventListener('click', async () => {
    if (!currentTrack) return;
    const currentId = currentTrack._id || currentTrack.id;

    try {
        // Ping actual database backend favorite toggle endpoint route mappings
        const systemResponse = await apiRequest('/api/users/like', {
            method: 'POST',
            body: JSON.stringify({ trackId: currentId })
        });
        if (userSessionProfile) userSessionProfile.likedTracks = systemResponse.likedTracks;
    } catch (e) {
        // Secure fail-soft tracking array updates if backend network route drops
        const position = clientLikedTracks.indexOf(currentId);
        if (position === -1) {
            clientLikedTracks.push(currentId);
        } else {
            clientLikedTracks.splice(position, 1);
        }
        localStorage.setItem('melodify_fallback_likes', JSON.stringify(clientLikedTracks));
    }

    updateAudioControlBarUI();
    renderPersonalizedFeed(); // Instantly update recommendation rankings based on explicit favorite feedback loop
});

/**
 * 5. Interface View Filter Event Toggles
 */
filterAllBtn.addEventListener('click', () => {
    activeFilter = 'all';
    filterAllBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-white text-black";
    filterMusicBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-zinc-900 text-zinc-400 hover:text-white";
    renderPersonalizedFeed();
});

filterMusicBtn.addEventListener('click', () => {
    activeFilter = 'music';
    filterMusicBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-purple-500 text-white";
    filterAllBtn.className = "px-4 py-1.5 text-xs font-bold rounded-full transition-colors bg-zinc-900 text-zinc-400 hover:text-white";
    renderPersonalizedFeed();
});

// Sidebar Navigation Switch Route Hooks
const manageMenuViewState = (element, modeKey) => {
    [navHome, navFollowing, navRecent, navLiked].forEach(btn => {
        btn.className = "w-full flex items-center gap-3.5 text-sm font-bold text-zinc-400 hover:text-white px-4 py-3 rounded-xl transition-all text-left";
    });
    element.className = "w-full flex items-center gap-3.5 text-sm font-bold text-white bg-zinc-900 px-4 py-3 rounded-xl transition-all text-left";
    currentViewMode = modeKey;
    renderPersonalizedFeed();
};

navHome.addEventListener('click', () => manageMenuViewState(navHome, 'home'));
navFollowing.addEventListener('click', () => manageMenuViewState(navFollowing, 'following'));
navRecent.addEventListener('click', () => manageMenuViewState(navRecent, 'recent'));
navLiked.addEventListener('click', () => manageMenuViewState(navLiked, 'liked'));

// Live Search Input Dispatch
searchInput.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    renderPersonalizedFeed();
});

/**
 * 6. Authentic Authentication Layer Submission Interface Controllers
 */
function displayAuthPortal(shouldShow) {
    if (shouldShow) {
        authModal.classList.remove('hidden');
    } else {
        authModal.classList.add('hidden');
        authError.classList.add('hidden');
        authError.textContent = '';
    }
}

authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    authTitle.textContent = isRegisterMode ? "Create Account" : "Sign In to Melodify";
    authSubmitBtn.textContent = isRegisterMode ? "Register" : "Login";
    authToggleText.textContent = isRegisterMode ? "Already tracking?" : "New listener?";
    authToggleBtn.textContent = isRegisterMode ? "Log in" : "Create an account";
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    
    const targetEndpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const payloadBody = {
        username: authUsernameInput.value.trim(),
        password: authPasswordInput.value
    };

    try {
        const responseData = await apiRequest(targetEndpoint, {
            method: 'POST',
            body: JSON.stringify(payloadBody)
        });

        if (responseData.token) {
            localStorage.setItem('melodify_token', responseData.token);
            authUsernameInput.value = '';
            authPasswordInput.value = '';
            await synchronizeAuthentication();
        } else {
            throw new Error("Missing authentication credentials response token wrapper mapping.");
        }
    } catch (err) {
        authError.textContent = err.message || (isRegisterMode ? "Server registration failure." : "Login authentication failure.");
        authError.classList.remove('hidden');
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('melodify_token');
    userSessionProfile = null;
    currentTrack = null;
    isPlaying = false;
    updateAudioControlBarUI();
    userDisplay.textContent = 'Connected: guest';
    displayAuthPortal(true);
});

// App Engine Launch Triggers
updateAudioControlBarUI();
synchronizeAuthentication();
