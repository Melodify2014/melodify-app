/**
 * Melodify Core Frontend Application Engine
 * Deep Channel Navigation Layers and Integrated Drift Mode Execution Core
 */

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : `${window.location.protocol}//${window.location.host}`; 

// Application State Vectors
let tracksRawCollection = [];
let userSessionProfile = null;
let currentTrack = null;
let isPlaying = false;
let isDriftModeActive = false; 
let activeFilter = 'all';
let searchQuery = '';
let currentViewMode = 'home'; 
let selectedProducer = null; 

let clientWatchHistory = JSON.parse(localStorage.getItem('melodify_fallback_history')) || [];
let clientLikedTracks = JSON.parse(localStorage.getItem('melodify_fallback_likes')) || [];
let clientFollowingList = JSON.parse(localStorage.getItem('melodify_fallback_following')) || [];

// DOM Element Registry Cache Mapping
const appViewport = document.getElementById('app-viewport');
const tracksGrid = document.getElementById('tracks-grid');
const searchInput = document.getElementById('search-input');
const filterAllBtn = document.getElementById('filter-all');
const filterMusicBtn = document.getElementById('filter-music');
const feedHeading = document.getElementById('feed-heading');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// Security Portal Document Elements
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');

// Controller Selector Items
const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerProducer = document.getElementById('player-producer');
const playerPlayBtn = document.getElementById('player-play-btn');
const playIcon = document.getElementById('play-icon');
const playerDriftBtn = document.getElementById('player-drift-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const likeIcon = document.getElementById('like-icon');
const playerProgress = document.getElementById('player-progress');

const navHome = document.getElementById('nav-home');
const navFollowing = document.getElementById('nav-following');
const navRecent = document.getElementById('nav-recent');
const navLiked = document.getElementById('nav-liked');

let isRegisterMode = false;
let ytPlayerEngine = null; 
let searchDebounceTimeout = null; 

/**
 * INITIALIZE BACKGROUND AUDIO ENGINE (YOUTUBE EMBED IFRAME RUNTIME)
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
                    if (event.data === YT.PlayerState.ENDED) {
                        if (isDriftModeActive) {
                            ytPlayerEngine.playVideo(); 
                        } else {
                            isPlaying = false;
                            updateAudioControlBarUI();
                        }
                    }
                }
            }
        });
    };

    setInterval(() => {
        if (ytPlayerEngine && typeof ytPlayerEngine.getCurrentTime === 'function' && isPlaying) {
            const currentPosition = ytPlayerEngine.getCurrentTime();
            const absoluteDuration = ytPlayerEngine.getDuration() || 1;
            const progressRatio = (currentPosition / absoluteDuration) * 100;
            playerProgress.style.width = `${progressRatio}%`;
        }
    }, 1000);

    playerProducer.style.cursor = "pointer";
    playerProducer.addEventListener('click', () => {
        if (currentTrack && currentTrack.producer) openChannelView(currentTrack.producer);
    });
})();

/**
 * HTTP REST Connection Layer APIs
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('melodify_token');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Pipeline process crash.');
        return data;
    } catch (err) {
        console.error(`Network Failure [${endpoint}]:`, err);
        throw err;
    }
}

async function synchronizeAuthentication() {
    const localToken = localStorage.getItem('melodify_token');
    if (!localToken) { displayAuthPortal(true); return; }
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

async function loadTracksDatabase(searchQueryParameter = '', producerParameter = '') {
    try {
        let uriTarget = '/api/tracks';
        if (producerParameter) {
            uriTarget = `/api/tracks?producer=${encodeURIComponent(producerParameter)}`;
        } else if (searchQueryParameter) {
            uriTarget = `/api/tracks?q=${encodeURIComponent(searchQueryParameter)}`;
        }
            
        const responseData = await apiRequest(uriTarget);
        tracksRawCollection = Array.isArray(responseData) ? responseData : (responseData.tracks || []);
        renderPersonalizedFeed();
    } catch (err) {
        console.error('Failed processing database source tracks load.', err);
    }
}

/**
 * ROUTE NAVIGATION: REDIRECT TO CREATOR CHANNEL VIEW
 */
async function openChannelView(producerName) {
    currentViewMode = 'channel';
    selectedProducer = producerName;
    
    [navHome, navFollowing, navRecent, navLiked].forEach(btn => btn.classList.remove('active'));
    tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--txt-dim); font-size: 14px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading tracks dynamically from database cluster layers...</div>`;
    
    await loadTracksDatabase("", producerName);
}

/**
 * UI Grid Compilation Processing Engine
 */
function renderPersonalizedFeed() {
    tracksGrid.innerHTML = '';
    
    const activeLikesList = userSessionProfile?.likedTracks || clientLikedTracks;
    const activeHistoryList = userSessionProfile?.watchHistory || clientWatchHistory;
    const activeFollowingList = userSessionProfile?.following || clientFollowingList;

    if (currentViewMode === 'following') {
        feedHeading.textContent = "Following Producers Feed";
        if (activeFollowingList.length === 0) {
            tracksGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 60px 0; color: var(--txt-dim); font-size: 14px; text-align: center;">You are not following any channels yet.</div>`;
            return;
        }

        activeFollowingList.forEach(producer => {
            const channelCard = document.createElement('div');
            channelCard.className = "card";
            channelCard.style.textAlign = "center";
            channelCard.style.padding = "24px 16px";
            channelCard.innerHTML = `
                <div style="width: 72px; height: 72px; background: #27272a; border-radius: 50%; margin: 0 auto 14px auto; display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--txt-dim); border: 2px solid #27272a;">
                    <i class="fa-solid fa-user"></i>
                </div>
                <h3 class="c-title" style="margin-bottom: 4px;" title="${producer}">${producer}</h3>
                <span style="font-size: 10px; font-weight: 800; background: rgba(34,197,94,0.15); color: #22c55e; padding: 2px 8px; border-radius: 12px; text-transform: uppercase;">Channel Active</span>
            `;
            channelCard.addEventListener('click', () => openChannelView(producer));
            tracksGrid.appendChild(channelCard);
        });
        return;
    }

    let coreSourcePool = [...tracksRawCollection];

    if (currentViewMode === 'liked') {
        coreSourcePool = coreSourcePool.filter(t => activeLikesList.includes(t._id || t.id));
        feedHeading.textContent = "Your Liked Collection";
    } else if (currentViewMode === 'recent') {
        coreSourcePool = coreSourcePool.filter(t => activeHistoryList.includes(t._id || t.id));
        feedHeading.textContent = "Recently Played Tracks";
    } else if (currentViewMode === 'channel') {
        feedHeading.textContent = `${selectedProducer}'s Channel Videos`;
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
                <img src="${track.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300'}" alt="Cover">
                ${trackIsLiked ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 11px;"><i class="fa-solid fa-heart"></i></div>` : ''}
            </div>
            <h3 class="c-title" title="${track.title}">${track.title}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--txt-dim); margin-top: 6px;">
                <span class="producer-channel-link" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95px; cursor: pointer; font-weight: 600;">
                    ${track.producer || 'Unknown'}
                </span>
                <button class="follow-badge-btn" style="background: ${isFollowingThisProducer ? '#22c55e' : '#1c1c21'}; font-size: 9px; font-weight: 800; padding: 2px 6px; border: none; border-radius: 4px; color: #fff; cursor: pointer; text-transform: uppercase;">
                    ${isFollowingThisProducer ? 'Following' : 'Follow'}
                </button>
            </div>
        `;

        const channelLink = cardBlock.querySelector('.producer-channel-link');
        channelLink.addEventListener('click', (event) => {
            event.stopPropagation();
            openChannelView(track.producer);
        });

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
        tracksGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 60px 0; color: var(--txt-dim); font-size: 14px; text-align: center;">No tracks found inside this layout frame context.</div>`;
    }
}

/**
 * Audio Track Player Engine Commands
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
}

function updateAudioControlBarUI() {
    if (!playIcon) return;
    playIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    
    if (isDriftModeActive) {
        playerDriftBtn.className = "ctrl-btn active";
        playerDriftBtn.style.color = "#dc2626";
        appViewport.classList.add('drift-engaged-glow');
    } else {
        playerDriftBtn.className = "ctrl-btn";
        playerDriftBtn.style.color = "";
        appViewport.classList.remove('drift-engaged-glow');
    }

    const activeLikes = userSessionProfile?.likedTracks || clientLikedTracks;
    const isCurrentLiked = currentTrack && activeLikes.includes(currentTrack._id || currentTrack.id);
    playerLikeBtn.style.color = isCurrentLiked ? "#ef4444" : "";
    likeIcon.className = isCurrentLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
    
    // Safety check fallback to clean the initial "Unknown Producer" UI error bug state
    playerProducer.textContent = currentTrack ? (currentTrack.producer || 'Unknown Producer') : 'Select a track';
}

playerPlayBtn.addEventListener('click', () => {
    if (!currentTrack || !ytPlayerEngine) return;
    isPlaying = !isPlaying;
    if (isPlaying) ytPlayerEngine.playVideo();
    else ytPlayerEngine.pauseVideo();
    updateAudioControlBarUI();
});

playerDriftBtn.addEventListener('click', () => {
    isDriftModeActive = !isDriftModeActive;
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
 * Input Query Interceptors
 */
searchInput.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    clearTimeout(searchDebounceTimeout);
    
    searchDebounceTimeout = setTimeout(async () => {
        currentViewMode = 'home';
        navHome.classList.add('active');
        [navFollowing, navRecent, navLiked].forEach(btn => btn.classList.remove('active'));
        await loadTracksDatabase(searchQuery);
    }, 500); 
});

filterAllBtn.addEventListener('click', () => {
    activeFilter = 'all';
    filterAllBtn.style.background = "#fff"; filterAllBtn.style.color = "#000";
    filterMusicBtn.style.background = "#141417"; filterMusicBtn.style.color = "var(--txt-dim)";
    renderPersonalizedFeed();
});

filterMusicBtn.addEventListener('click', () => {
    activeFilter = 'music';
    filterMusicBtn.style.background = "#fff"; filterMusicBtn.style.color = "#000";
    filterAllBtn.style.background = "#141417"; filterAllBtn.style.color = "var(--txt-dim)";
    renderPersonalizedFeed();
});

const manageMenuViewState = (element, modeKey) => {
    [navHome, navFollowing, navRecent, navLiked].forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    currentViewMode = modeKey;
    selectedProducer = null; 
    
    if (modeKey === 'following') renderPersonalizedFeed();
    else loadTracksDatabase();
};

navHome.addEventListener('click', () => manageMenuViewState(navHome, 'home'));
navFollowing.addEventListener('click', () => manageMenuViewState(navFollowing, 'following'));
navRecent.addEventListener('click', () => manageMenuViewState(navRecent, 'recent'));
navLiked.addEventListener('click', () => manageMenuViewState(navLiked, 'liked'));

/**
 * Security Management Controls
 */
function displayAuthPortal(shouldShow) {
    authModal.style.display = shouldShow ? 'flex' : 'none';
    if (!shouldShow) authError.style.display = 'none';
}

authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    authTitle.textContent = isRegisterMode ? "Create Account" : "Sign In to Melodify";
    authSubmitBtn.textContent = isRegisterMode ? "Register" : "Login";
    authToggleBtn.textContent = isRegisterMode ? "Log in" : "Create an account";
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    try {
        const responseData = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ username: authUsernameInput.value.trim(), password: authPasswordInput.value })
        });

        if (isRegisterMode) {
            isRegisterMode = false;
            authTitle.textContent = "Sign In to Melodify";
            authSubmitBtn.textContent = "Login";
            authError.style.color = "#22c55e"; authError.textContent = "Account created! Please sign in.";
            authError.style.display = 'block';
        } else if (responseData && responseData.token) {
            localStorage.setItem('melodify_token', responseData.token);
            await synchronizeAuthentication();
        }
    } catch (err) {
        authError.textContent = err.message;
        authError.style.display = 'block';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('melodify_token');
    userSessionProfile = null; currentTrack = null; isPlaying = false;
    if (ytPlayerEngine?.pauseVideo) ytPlayerEngine.pauseVideo();
    updateAudioControlBarUI();
    displayAuthPortal(true);
});

updateAudioControlBarUI();
synchronizeAuthentication();
