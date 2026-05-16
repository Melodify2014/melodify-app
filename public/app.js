/**
 * Melodify Core Frontend Application Engine
 * Integrates backend APIs with recommendation sorting layers
 */

// Application State vectors
let tracksRawCollection = [];
let userSessionProfile = null;
let currentTrack = null;
let isPlaying = false;
let isLooping = false;
let activeFilter = 'all';
let searchQuery = '';
let currentViewMode = 'home'; 

// Local fallbacks if backend array updates undergo mid-flight context drops
let clientWatchHistory = JSON.parse(localStorage.getItem('melodify_fallback_history')) || [];
let clientLikedTracks = JSON.parse(localStorage.getItem('melodify_fallback_likes')) || [];

// DOM Element Registry Cache
const tracksGrid = document.getElementById('tracks-grid');
const searchInput = document.getElementById('search-input');
const filterAllBtn = document.getElementById('filter-all');
const filterMusicBtn = document.getElementById('filter-music');
const feedHeading = document.getElementById('feed-heading');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// Authentication UI Selectors
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

// Audio Controller Elements
const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerProducer = document.getElementById('player-producer');
const playerPlayBtn = document.getElementById('player-play-btn');
const playIcon = document.getElementById('play-icon');
const playerLoopBtn = document.getElementById('player-loop-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const likeIcon = document.getElementById('like-icon');
const playerProgress = document.getElementById('player-progress');

// Nav Items
const navHome = document.getElementById('nav-home');
const navFollowing = document.getElementById('nav-following');
const navRecent = document.getElementById('nav-recent');
const navLiked = document.getElementById('nav-liked');

let isRegisterMode = false;

/**
 * 1. API Fetch Pipeline Configuration
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('melodify_token');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(endpoint, { ...options, headers });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'API processing mismatch.');
        return data;
    } catch (err) {
        console.error(`Network Interface failure [${endpoint}]:`, err);
        throw err;
    }
}

async function synchronizeAuthentication() {
    const localToken = localStorage.getItem('melodify_token');
    if (!localToken) {
        displayAuthPortal(true);
        return;
    }
    try {
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

async function loadTracksDatabase() {
    try {
        const responseData = await apiRequest('/api/tracks');
        tracksRawCollection = Array.isArray(responseData) ? responseData : (responseData.tracks || []);
        
        // Normalize object parameters to ensure content filters process accurately
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
 * 2. Adaptive Weight Recommendation Engine
 */
function processSmartRecommendations() {
    if (!tracksRawCollection || tracksRawCollection.length === 0) return [];

    const targetHistory = userSessionProfile?.watchHistory || clientWatchHistory;
    const targetLikes = userSessionProfile?.likedTracks || clientLikedTracks;

    if (targetHistory.length === 0 && targetLikes.length === 0) {
        return [...tracksRawCollection];
    }

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
                structuralWeights[tag] = (structuralWeights[tag] || 0) + 4.0; 
            });
        }
    });

    const rankedOutput = tracksRawCollection.map(track => {
        let similarityScore = 0;
        const currentId = track._id || track.id;

        if (track.tags) {
            track.tags.forEach(tag => {
                if (structuralWeights[tag]) similarityScore += structuralWeights[tag];
            });
        }

        const listenedProducers = targetHistory.map(id => tracksRawCollection.find(t => t._id === id || t.id === id)?.producer).filter(Boolean);
        if (listenedProducers.includes(track.producer)) {
            similarityScore += 2.5;
        }

        if (targetHistory.includes(currentId)) {
            similarityScore -= 1.0; 
        }

        return { track, score: similarityScore };
    });

    rankedOutput.sort((x, y) => y.score - x.score);
    return rankedOutput.map(item => item.track);
}

/**
 * 3. Layout Rendering Array Core Pipeline
 */
function renderPersonalizedFeed() {
    tracksGrid.innerHTML = '';
    
    let coreSourcePool = processSmartRecommendations();
    const activeLikesList = userSessionProfile?.likedTracks || clientLikedTracks;
    const activeHistoryList = userSessionProfile?.watchHistory || clientWatchHistory;

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

    const compiledOutputList = coreSourcePool.filter(track => {
        const textExpression = (track.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (track.producer || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        if (activeFilter === 'music') {
            return textExpression && track.type === 'music';
        }
        return textExpression;
    });

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
                No custom matches found inside this feed layout.
            </div>`;
    }
}

/**
 * 4. User Interaction Event Receivers
 */
async function dispatchPlaybackAction(track) {
    currentTrack = track;
    const currentId = track._id || track.id;

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

    playerThumb.src = track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100';
    playerTitle.textContent = track.title;
    playerProducer.textContent = track.producer || 'Unknown Producer';
    
    isPlaying = true;
    playerProgress.style.width = '35%'; 
    
    updateAudioControlBarUI();
    renderPersonalizedFeed(); 
}

function updateAudioControlBarUI() {
    playIcon.className = isPlaying ? "fa-solid fa-pause text-xs" : "fa-solid fa-play translate-x-[1px] text-xs";

    playerLoopBtn.className = isLooping 
        ? "text-purple-500 hover:text-purple-400 transition-colors text-base focus:outline-none" 
        : "text-zinc-500 hover:text-zinc-300 transition-colors text-base focus:outline-none";

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
        const systemResponse = await apiRequest('/api/users/like', {
            method: 'POST',
            body: JSON.stringify({ trackId: currentId })
        });
        if (userSessionProfile) userSessionProfile.likedTracks = systemResponse.likedTracks;
    } catch (e) {
        const position = clientLikedTracks.indexOf(currentId);
        if (position === -1) {
            clientLikedTracks.push(currentId);
        } else {
            clientLikedTracks.splice(position, 1);
        }
        localStorage.setItem('melodify_fallback_likes', JSON.stringify(clientLikedTracks));
    }

    updateAudioControlBarUI();
    renderPersonalizedFeed(); 
});

/**
 * 5. Interface Filter Event Hooks
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

searchInput.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    renderPersonalizedFeed();
});

/**
 * 6. Fix for Auth Submission Event Race Conditions
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
    // CRITICAL: Stop the browser page reload to protect state variables
    e.preventDefault(); 
    
    authError.classList.add('hidden');
    authError.textContent = '';
    
    const originalBtnText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = isRegisterMode ? "REGISTERING..." : "LOGGING IN...";
    authSubmitBtn.disabled = true;

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

        if (responseData && responseData.token) {
            localStorage.setItem('melodify_token', responseData.token);
            
            // Clear inputs ONLY after verified success response
            authUsernameInput.value = '';
            authPasswordInput.value = '';
            
            await synchronizeAuthentication();
        } else {
            throw new Error("Missing authentication token from server response.");
        }
    } catch (err) {
        console.error("Auth Stack Trace Exception:", err);
        // Retain values on error so user doesn't lose credentials text entries
        authError.textContent = err.message || (isRegisterMode ? "Server registration failure." : "Login authentication failure.");
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.textContent = originalBtnText;
        authSubmitBtn.disabled = false;
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

// App Bootstrap Init
updateAudioControlBarUI();
synchronizeAuthentication();
