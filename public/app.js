/**
 * Melodify Core Frontend Application Engine
 * Integrates backend APIs with recommendation sorting layers
 */

// Production Configuration: Update this string to your live host URL if deploying (e.g., https://your-app.onrender.com)
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : ''; 

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
const authToggleTextLabel = document.getElementById('auth-toggle-text-label');

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

        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Server rejected request layout.');
        }
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
        userDisplay.textContent = `Connected: ${userProfile.username || userProfile.email || 'User'}`;
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
        cardBlock.className = "card";
        
        cardBlock.innerHTML = `
            <div style="position: relative;">
                <img src="${track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300'}" alt="Cover Art">
                ${trackIsLiked ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 11px;"><i class="fa-solid fa-heart"></i></div>` : ''}
            </div>
            <h3 class="c-title" title="${track.title}">${track.title}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--txt-dim); margin-top: 4px;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-w: 110px;">${track.producer || 'Unknown'}</span>
                <span style="background: #1c1c21; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; color: #fff; text-transform: uppercase;">${track.type || 'track'}</span>
            </div>
        `;

        cardBlock.addEventListener('click', () => dispatchPlaybackAction(track));
        tracksGrid.appendChild(cardBlock);
    });

    if (compiledOutputList.length === 0) {
        tracksGrid.innerHTML = `
            <div class="col-span-full" style="grid-column: 1 / -1; text-center; padding: 60px 0; color: var(--txt-dim); font-size: 14px; font-weight: 600; text-align: center;">
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
    playIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";

    playerLoopBtn.className = isLooping ? "ctrl-btn option-btn active" : "ctrl-btn";

    const activeLikes = userSessionProfile?.likedTracks || clientLikedTracks;
    const isCurrentLiked = currentTrack && activeLikes.includes(currentTrack._id || currentTrack.id);

    if (isCurrentLiked) {
        playerLikeBtn.style.color = "#ef4444";
        likeIcon.className = "fa-solid fa-heart";
    } else {
        playerLikeBtn.style.color = "";
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
    filterAllBtn.style.background = "#fff";
    filterAllBtn.style.color = "#000";
    filterMusicBtn.style.background = "#141417";
    filterMusicBtn.style.color = "var(--txt-dim)";
    renderPersonalizedFeed();
});

filterMusicBtn.addEventListener('click', () => {
    activeFilter = 'music';
    filterMusicBtn.style.background = "#fff";
    filterMusicBtn.style.color = "#000";
    filterAllBtn.style.background = "#141417";
    filterAllBtn.style.color = "var(--txt-dim)";
    renderPersonalizedFeed();
});

const manageMenuViewState = (element, modeKey) => {
    [navHome, navFollowing, navRecent, navLiked].forEach(btn => {
        btn.classList.remove('active');
    });
    element.classList.add('active');
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
 * 6. Authentic Authentication Handlers
 */
function displayAuthPortal(shouldShow) {
    if (shouldShow) {
        authModal.style.display = 'flex';
    } else {
        authModal.style.display = 'none';
        authError.style.display = 'none';
        authError.textContent = '';
    }
}

authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    authError.style.display = 'none';
    authTitle.textContent = isRegisterMode ? "Create Account" : "Sign In to Melodify";
    authSubmitBtn.textContent = isRegisterMode ? "Register" : "Login";
    authToggleTextLabel.textContent = isRegisterMode ? "Already tracking?" : "New listener?";
    authToggleBtn.textContent = isRegisterMode ? "Log in" : "Create an account";
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    authError.style.display = 'none';
    authError.textContent = '';
    
    const originalBtnText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = isRegisterMode ? "REGISTERING..." : "LOGGING IN...";
    authSubmitBtn.disabled = true;

    const targetEndpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const inputVal = authUsernameInput.value.trim();
    
    const payloadBody = {
        username: inputVal,
        email: inputVal, 
        password: authPasswordInput.value
    };

    try {
        const responseData = await apiRequest(targetEndpoint, {
            method: 'POST',
            body: JSON.stringify(payloadBody)
        });

        if (responseData && responseData.token) {
            localStorage.setItem('melodify_token', responseData.token);
            
            authUsernameInput.value = '';
            authPasswordInput.value = '';
            
            await synchronizeAuthentication();
        } else {
            throw new Error("Missing credentials authentication token wrapper.");
        }
    } catch (err) {
        console.error("Auth Stack Trace Exception Catch Block:", err);
        authError.textContent = err.message || "Connection rejected. Please verify your credentials.";
        authError.style.display = 'block';
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
