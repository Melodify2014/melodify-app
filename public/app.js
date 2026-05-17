/**
 * Melodify Core Full-Stack Integration Script
 * Bridges prototype layouts to live backend services and background video elements
 */

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : 'https://melodify-phonk.onrender.com'; 

// Application Runtime States
let tracksRawCollection = [];
let userSessionProfile = null;
let currentTrack = null;
let isPlaying = false;
let isLooping = false;
let activeFilter = 'all';
let searchQuery = '';
let currentViewMode = 'home'; 

let clientWatchHistory = JSON.parse(localStorage.getItem('melodify_fallback_history')) || [];
let clientLikedTracks = JSON.parse(localStorage.getItem('melodify_fallback_likes')) || [];
let clientFollowingList = JSON.parse(localStorage.getItem('melodify_fallback_following')) || [];

// DOM Element Registry Cache Mapping
const tracksGrid = document.getElementById('tracks-grid');
const searchInput = document.getElementById('search-input');
const filterAllBtn = document.getElementById('filter-all');
const filterMusicBtn = document.getElementById('filter-music');
const feedHeading = document.getElementById('feed-heading');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// Authentication UI Overlay Reference Elements
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleTextLabel = document.getElementById('auth-toggle-text-label');

// Audio Controller Element Reference Cache
const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerProducer = document.getElementById('player-producer');
const playerPlayBtn = document.getElementById('player-play-btn');
const playIcon = document.getElementById('play-icon');
const playerLoopBtn = document.getElementById('player-loop-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const likeIcon = document.getElementById('like-icon');
const playerProgress = document.getElementById('player-progress');

// View Switch Navigation Selectors
const navHome = document.getElementById('nav-home');
const navFollowing = document.getElementById('nav-following');
const navRecent = document.getElementById('nav-recent');
const navLiked = document.getElementById('nav-liked');

let isRegisterMode = false;
let ytPlayerEngine = null; 
let searchDebounceTimeout = null; 

/**
 * MOUNT BACKGROUND AUDIO ENGINE LAYER (YOUTUBE IFRAME API HOOK)
 */
(function initializeHiddenPlaybackCore() {
    const frameContainer = document.createElement('div');
    frameContainer.id = 'melodify-hidden-audio-engine';
    frameContainer.style.position = 'absolute';
    frameContainer.style.top = '-9999px'; 
    document.body.appendChild(frameContainer);

    const dynamicTag = document.createElement('script');
    dynamicTag.src = "https://www.youtube.com/iframe_api";
    const headScripts = document.getElementsByTagName('script')[0];
    headScripts.parentNode.insertBefore(dynamicTag, headScripts);

    window.onYouTubeIframeAPIReady = function () {
        ytPlayerEngine = new YT.Player('melodify-hidden-audio-engine', {
            height: '0',
            width: '0',
            playerVars: { 'controls': 0, 'disablekb': 1, 'modestbranding': 1 },
            events: {
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.ENDED && isLooping) {
                        ytPlayerEngine.playVideo();
                    }
                }
            }
        });
    };

    // Tracking progress state loop maps
    setInterval(() => {
        if (ytPlayerEngine && typeof ytPlayerEngine.getCurrentTime === 'function' && isPlaying) {
            const currentPosition = ytPlayerEngine.getCurrentTime();
            const absoluteDuration = ytPlayerEngine.getDuration() || 1;
            const progressRatio = (currentPosition / absoluteDuration) * 100;
            playerProgress.style.width = `${progressRatio}%`;
        }
    }, 1000);
})();

/**
 * 1. API Core Fetch Request Wrapper
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('melodify_token');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Server context rejected execution.');
        return data;
    } catch (err) {
        console.error(`Network Failure [${endpoint}]:`, err);
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
        userDisplay.textContent = `Connected: ${userProfile.username || 'User'}`;
        displayAuthPortal(false);
        await loadTracksDatabase();
    } catch (e) {
        localStorage.removeItem('melodify_token');
        displayAuthPortal(true);
    }
}

async function loadTracksDatabase(searchQueryParameter = '') {
    try {
        const uriTarget = searchQueryParameter 
            ? `/api/tracks?q=${encodeURIComponent(searchQueryParameter)}` 
            : '/api/tracks';
            
        const responseData = await apiRequest(uriTarget);
        tracksRawCollection = Array.isArray(responseData) ? responseData : (responseData.tracks || []);
        renderPersonalizedFeed();
    } catch (err) {
        console.error('Failed processing database source tracks matrix load.', err);
    }
}

/**
 * 2. Feed Renderer Component Assembly
 */
function renderPersonalizedFeed() {
    tracksGrid.innerHTML = '';
    let coreSourcePool = [...tracksRawCollection];
    
    const activeLikesList = userSessionProfile?.likedTracks || clientLikedTracks;
    const activeHistoryList = userSessionProfile?.watchHistory || clientWatchHistory;
    const activeFollowingList = userSessionProfile?.following || clientFollowingList;

    if (currentViewMode === 'liked') {
        coreSourcePool = coreSourcePool.filter(t => activeLikesList.includes(t._id || t.id));
        feedHeading.textContent = "Your Liked Collection";
    } else if (currentViewMode === 'recent') {
        coreSourcePool = coreSourcePool.filter(t => activeHistoryList.includes(t._id || t.id));
        feedHeading.textContent = "Recently Played Tracks";
    } else if (currentViewMode === 'following') {
        coreSourcePool = coreSourcePool.filter(t => activeFollowingList.includes(t.producer));
        feedHeading.textContent = "Following Producers Feed";
    } else {
        feedHeading.textContent = activeFilter === 'music' ? "Music Only Feed" : "Phonk Feed";
    }

    const compiledOutputList = coreSourcePool.filter(track => {
        if (activeFilter === 'music') return track.type === 'music';
        return true;
    });

    compiledOutputList.forEach(track => {
        const trackIdentifier = track._id || track.id;
        const trackIsLiked = activeLikesList.includes(trackIdentifier);
        const isFollowingThisProducer = activeFollowingList.includes(track.producer);
        
        const cardBlock = document.createElement('div');
        cardBlock.className = "card";
        cardBlock.innerHTML = `
            <div style="position: relative;">
                <img src="${track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300'}" alt="Cover Art">
                ${trackIsLiked ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 11px;"><i class="fa-solid fa-heart"></i></div>` : ''}
            </div>
            <h3 class="c-title" title="${track.title}">${track.title}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--txt-dim); margin-top: 6px;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;">${track.producer || 'Unknown'}</span>
                <button class="follow-badge-btn" style="background: ${isFollowingThisProducer ? '#22c55e' : '#1c1c21'}; font-size: 9px; font-weight: 800; padding: 2px 6px; border: none; border-radius: 4px; color: #fff; cursor: pointer; text-transform: uppercase;">
                    ${isFollowingThisProducer ? 'Following' : 'Follow'}
                </button>
            </div>
        `;

        const followBadge = cardBlock.querySelector('.follow-badge-btn');
        followBadge.addEventListener('click', async (event) => {
            event.stopPropagation(); 
            try {
                const response = await apiRequest('/api/users/follow', {
                    method: 'POST',
                    body: JSON.stringify({ producerName: track.producer })
                });
                if (userSessionProfile) userSessionProfile.following = response.following;
                renderPersonalizedFeed();
            } catch (err) {
                const searchIdx = clientFollowingList.indexOf(track.producer);
                if (searchIdx === -1) clientFollowingList.push(track.producer);
                else clientFollowingList.splice(searchIdx, 1);
                localStorage.setItem('melodify_fallback_following', JSON.stringify(clientFollowingList));
                renderPersonalizedFeed();
            }
        });

        cardBlock.addEventListener('click', () => dispatchPlaybackAction(track));
        tracksGrid.appendChild(cardBlock);
    });

    if (compiledOutputList.length === 0) {
        tracksGrid.innerHTML = `<div class="col-span-full" style="grid-column: 1 / -1; padding: 60px 0; color: var(--txt-dim); font-size: 14px; font-weight: 600; text-align: center;">No tracks found inside this feed matrix layout.</div>`;
    }
}

/**
 * 3. Media Controls & Handlers
 */
async function dispatchPlaybackAction(track) {
    currentTrack = track;
    const currentId = track._id || track.id;

    if (ytPlayerEngine && typeof ytPlayerEngine.loadVideoById === 'function') {
        ytPlayerEngine.loadVideoById(track.youtubeId);
        isPlaying = true;
    }

    try {
        await apiRequest('/api/users/history', { method: 'POST', body: JSON.stringify({ trackId: currentId }) });
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
    
    updateAudioControlBarUI();
    renderPersonalizedFeed(); 
}

function updateAudioControlBarUI() {
    playIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    playerLoopBtn.className = isLooping ? "ctrl-btn active" : "ctrl-btn";

    const activeLikes = userSessionProfile?.likedTracks || clientLikedTracks;
    const isCurrentLiked = currentTrack && activeLikes.includes(currentTrack._id || currentTrack.id);
    playerLikeBtn.style.color = isCurrentLiked ? "#ef4444" : "";
    likeIcon.className = isCurrentLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
}

playerPlayBtn.addEventListener('click', () => {
    if (!currentTrack || !ytPlayerEngine) return;
    isPlaying = !isPlaying;
    
    if (isPlaying) ytPlayerEngine.playVideo();
    else ytPlayerEngine.pauseVideo();
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
        const systemResponse = await apiRequest('/api/users/like', { method: 'POST', body: JSON.stringify({ trackId: currentId }) });
        if (userSessionProfile) userSessionProfile.likedTracks = systemResponse.likedTracks;
    } catch (e) {
        const position = clientLikedTracks.indexOf(currentId);
        if (position === -1) clientLikedTracks.push(currentId);
        else clientLikedTracks.splice(position, 1);
        localStorage.setItem('melodify_fallback_likes', JSON.stringify(clientLikedTracks));
    }
    updateAudioControlBarUI();
    renderPersonalizedFeed(); 
});

/**
 * 4. Debounced Live Video Search Trigger Link
 */
searchInput.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    clearTimeout(searchDebounceTimeout);
    
    searchDebounceTimeout = setTimeout(async () => {
        await loadTracksDatabase(searchQuery);
    }, 500); 
});

/**
 * 5. Interface View & Filter Management Links
 */
filterAllBtn.addEventListener('click', () => {
    activeFilter = 'all';
    filterAllBtn.classList.add('active'); filterMusicBtn.classList.remove('active');
    renderPersonalizedFeed();
});

filterMusicBtn.addEventListener('click', () => {
    activeFilter = 'music';
    filterMusicBtn.classList.add('active'); filterAllBtn.classList.remove('active');
    renderPersonalizedFeed();
});

const manageMenuViewState = (element, modeKey) => {
    [navHome, navFollowing, navRecent, navLiked].forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    currentViewMode = modeKey;
    renderPersonalizedFeed();
};

navHome.addEventListener('click', () => manageMenuViewState(navHome, 'home'));
navFollowing.addEventListener('click', () => manageMenuViewState(navFollowing, 'following'));
navRecent.addEventListener('click', () => manageMenuViewState(navRecent, 'recent'));
navLiked.addEventListener('click', () => manageMenuViewState(navLiked, 'liked'));

/**
 * 6. Portal Session Control Rules
 */
function displayAuthPortal(shouldShow) {
    if (shouldShow) {
        authModal.style.display = 'flex';
    } else {
        authModal.style.display = 'none';
        authError.style.display = 'none';
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
    const originalBtnText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = isRegisterMode ? "REGISTERING..." : "LOGGING IN...";
    authSubmitBtn.disabled = true;

    const targetEndpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const inputVal = authUsernameInput.value.trim();

    try {
        const responseData = await apiRequest(targetEndpoint, {
            method: 'POST',
            body: JSON.stringify({ username: inputVal, password: authPasswordInput.value })
        });

        if (isRegisterMode) {
            isRegisterMode = false;
            authTitle.textContent = "Sign In to Melodify";
            authSubmitBtn.textContent = "Login";
            authToggleTextLabel.textContent = "New listener?";
            authToggleBtn.textContent = "Create an account";
            
            authError.style.color = "#22c55e"; authError.style.background = "rgba(34, 197, 94, 0.1)"; authError.style.borderColor = "rgba(34, 197, 94, 0.2)";
            authError.textContent = "Account created successfully! Please sign in.";
            authError.style.display = 'block';
            authPasswordInput.value = '';
            return;
        }

        if (responseData && responseData.token) {
            localStorage.setItem('melodify_token', responseData.token);
            authUsernameInput.value = ''; authPasswordInput.value = '';
            await synchronizeAuthentication();
        }
    } catch (err) {
        authError.textContent = err.message || "Connection rejected. Please verify your credentials.";
        authError.style.color = "#ef4444"; authError.style.background = "rgba(239, 68, 68, 0.1)"; authError.style.borderColor = "rgba(239, 68, 68, 0.2)";
        authError.style.display = 'block';
    } finally {
        authSubmitBtn.textContent = originalBtnText;
        authSubmitBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('melodify_token');
    userSessionProfile = null; currentTrack = null; isPlaying = false;
    if (ytPlayerEngine && typeof ytPlayerEngine.pauseVideo === 'function') ytPlayerEngine.pauseVideo();
    updateAudioControlBarUI();
    userDisplay.textContent = 'Connected: guest';
    displayAuthPortal(true);
});

// Bootstrap Setup Pipeline Link
updateAudioControlBarUI();
synchronizeAuthentication();
