/**
 * ==========================================================================
 * 1. STATE MANAGEMENT & GLOBALS
 * ==========================================================================
 */
/**
 * ==========================================================================
 * YOUTUBE DATA API CONFIGURATION (OPTIONAL)
 * ==========================================================================
 * Place your Google Cloud Console API key inside the quotes below if you 
 * are transitioning from mock data to live server queries.
 */
const YT_DATA_API_KEY = "AIzaSyANndBije8n2js5wtfLb05SDW91IGsiqOg";

/**
 * ==========================================================================
 * 1. STATE MANAGEMENT & GLOBALS
 * ==========================================================================
 */
let ytPlayer = null;
let playbackInterval = null;
let currentTrackList = [];
let currentTrackIndex = -1;
let currentView = 'home';

// ... Rest of your clean app.js code continues exactly as before
let ytPlayer = null;
let playbackInterval = null;
let currentTrackList = [];
let currentTrackIndex = -1;
let currentView = 'home'; // Options: home, following, recent, liked

// Mock Data optimized to seamlessly clip YouTube wide thumbnails into clean squares
const mockDatabase = {
    home: [
        { id: 'tN8w7g0-Nsw', title: 'METAMORPHOSIS', artist: 'INTERWORLD', badge: 'CLASSIC', img: 'https://img.youtube.com/vi/tN8w7g0-Nsw/maxresdefault.jpg' },
        { id: 'fN_3Zg_3Ew0', title: 'MURDER IN MY MIND', artist: 'KORDHELL', badge: 'DRIFT', img: 'https://img.youtube.com/vi/fN_3Zg_3Ew0/maxresdefault.jpg' },
        { id: '1-xGerv5FOk', title: 'RAVE', artist: 'Dxrk', badge: 'POPULAR', img: 'https://img.youtube.com/vi/1-xGerv5FOk/maxresdefault.jpg' },
        { id: 'Wv2rLZmb_8g', title: 'CLOSE EYES', artist: 'DVRST', badge: 'ATMOSPHERIC', img: 'https://img.youtube.com/vi/Wv2rLZmb_8g/maxresdefault.jpg' },
        { id: 'H6YvS6O0m_o', title: 'GIGA CHAD THEME', artist: 'g3ox_em', badge: 'MEME', img: 'https://img.youtube.com/vi/H6YvS6O0m_o/maxresdefault.jpg' },
        { id: 'vA0A8X9xYSw', title: 'AUTOMOTIVE', artist: 'Phonk Killer', badge: 'COWBELL', img: 'https://img.youtube.com/vi/vA0A8X9xYSw/maxresdefault.jpg' }
    ],
    following: [
        { id: 'dQw4w9WgXcQ', title: 'Cuz We\'re Playing...', artist: 'CG5', badge: 'FEED', img: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', isChannel: false },
        { id: 'XqgYj7nO9fM', title: 'smol qwel and tall...', artist: 'CG5', badge: 'FEED', img: 'https://img.youtube.com/vi/XqgYj7nO9fM/maxresdefault.jpg', isChannel: false },
        { id: 'L_LUpnjbP90', title: 'POPPY PLAYTIME...', artist: 'CG5', badge: 'FEED', img: 'https://img.youtube.com/vi/L_LUpnjbP90/maxresdefault.jpg', isChannel: false }
    ],
    recent: [],
    liked: []
};

/**
 * ==========================================================================
 * 2. YOUTUBE IFRAME HARDWARE ENGINE
 * ==========================================================================
 */
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player-container', {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('Master Hardware Audio Engine Online.');
}

function onPlayerStateChange(event) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const icon = playPauseBtn.querySelector('i');

    if (event.data === YT.PlayerState.PLAYING) {
        icon.className = 'fas fa-pause';
        startProgressTracking();
    } else {
        icon.className = 'fas fa-play';
        clearInterval(playbackInterval);
    }

    // Auto-advance track playlist logic at song completion
    if (event.data === YT.PlayerState.ENDED) {
        handleNextTrack();
    }
}

/**
 * ==========================================================================
 * 3. INTERACTION & DOM CONTROLLER RENDER PIPELINE
 * ==========================================================================
 */
function renderWorkspaceView(viewKey, customData = null) {
    currentView = viewKey;
    const mainGrid = document.getElementById('main-grid');
    const heading = document.getElementById('feed-heading');
    
    // Manage active sidebar classes
    document.querySelectorAll('.sidebar .menu-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${viewKey}`);
    if (activeNav) activeNav.classList.add('active');

    // Title Updates
    heading.textContent = `${viewKey.charAt(0).toUpperCase() + viewKey.slice(1)} Feed`;

    const dataToRender = customData || mockDatabase[viewKey] || [];
    mainGrid.innerHTML = '';

    if (dataToRender.length === 0) {
        mainGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--txt-dim); padding-top: 40px;">No records or cached tracks found in this node.</div>`;
        return;
    }

    currentTrackList = dataToRender;

    dataToRender.forEach((track, index) => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.setAttribute('data-id', track.id);
        
        // Match the layout configuration for square thumbnails
        card.innerHTML = `
            <div class="card-thumb-wrap">
                <img src="${track.img}" alt="${track.title}" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400'">
                <div class="card-play-overlay">
                    <i class="fas fa-play"></i>
                </div>
                <span class="card-badge">${track.badge || 'CACHED'}</span>
            </div>
            <h4>${track.title}</h4>
            <div class="card-meta-row">
                <p>${track.artist}</p>
            </div>
        `;

        card.addEventListener('click', () => {
            currentTrackIndex = index;
            executeTrackPlayback(track);
        });

        mainGrid.appendChild(card);
    });
}

/**
 * ==========================================================================
 * 4. MEDIA PLAYBACK WORKFLOWS
 * ==========================================================================
 */
function executeTrackPlayback(track) {
    if (!ytPlayer || !ytPlayer.loadVideoById) return;

    // Load to global player dashboard ui nodes
    document.getElementById('player-title').textContent = track.title;
    document.getElementById('player-artist').textContent = track.artist;
    
    const thumb = document.getElementById('player-thumb');
    thumb.src = track.img;
    thumb.style.opacity = '1';

    // Fire hardware state machine
    ytPlayer.loadVideoById(track.id);

    // Contextual system switch to Drift Mode overrides
    if (track.badge === 'DRIFT') {
        document.body.classList.add('drift-active');
    } else {
        document.body.classList.remove('drift-active');
    }

    // Add into user caching histories safely
    if (!mockDatabase.recent.some(t => t.id === track.id)) {
        mockDatabase.recent.unshift(track);
        if (mockDatabase.recent.length > 20) mockDatabase.recent.pop();
    }
}

function handlePlayPauseToggle() {
    if (!ytPlayer || !ytPlayer.getPlayerState) return;
    
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
}

function handleNextTrack() {
    if (currentTrackList.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % currentTrackList.length;
    executeTrackPlayback(currentTrackList[currentTrackIndex]);
}

function handlePrevTrack() {
    if (currentTrackList.length === 0) return;
    currentTrackIndex = (currentTrackIndex - 1 + currentTrackList.length) % currentTrackList.length;
    executeTrackPlayback(currentTrackList[currentTrackIndex]);
}

/**
 * ==========================================================================
 * 5. TIMELINE TIMING & SCRUB NAVIGATION MECHANICS
 * ==========================================================================
 */
function startProgressTracking() {
    const filledBar = document.getElementById('progress-filled');
    
    clearInterval(playbackInterval);
    playbackInterval = setInterval(() => {
        if (ytPlayer && ytPlayer.getCurrentTime) {
            const current = ytPlayer.getCurrentTime();
            const total = ytPlayer.getDuration();
            if (total > 0) {
                const percentage = (current / total) * 100;
                filledBar.style.width = `${percentage}%`;
            }
        }
    }, 400);
}

function handleScrubNavigation(event) {
    const progressBar = document.getElementById('progress-bar');
    if (!ytPlayer || !ytPlayer.getDuration) return;

    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const seekPercentage = clickX / width;
    const targetTime = ytPlayer.getDuration() * seekPercentage;

    ytPlayer.seekTo(targetTime, true);
}

/**
 * ==========================================================================
 * 6. LIVE CLIENT-SIDE SEARCH ENGINE FILTER
 * ==========================================================================
 */
function processLiveSearch(query) {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) {
        renderWorkspaceView(currentView);
        return;
    }

    // Scan complete workspace pools across categories
    const combinedPool = [...mockDatabase.home, ...mockDatabase.following, ...mockDatabase.recent, ...mockDatabase.liked];
    
    // Deduplicate array values
    const uniquelyMapped = Array.from(new Map(combinedPool.map(item => [item.id, item])).values());

    const filtered = uniquelyMapped.filter(track => 
        track.title.toLowerCase().includes(cleanQuery) || 
        track.artist.toLowerCase().includes(cleanQuery)
    );

    renderWorkspaceView(currentView, filtered);
    document.getElementById('feed-heading').textContent = `Search Results for: "${query}"`;
}

/**
 * ==========================================================================
 * 7. SYSTEM BINDINGS AND LIFECYCLE INITIALIZER
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    // Nav Navigation Bindings
    document.getElementById('nav-home').addEventListener('click', () => renderWorkspaceView('home'));
    document.getElementById('nav-following').addEventListener('click', () => renderWorkspaceView('following'));
    document.getElementById('nav-recent').addEventListener('click', () => renderWorkspaceView('recent'));
    document.getElementById('nav-liked').addEventListener('click', () => renderWorkspaceView('liked'));

    // Controller Bindings
    document.getElementById('play-pause-btn').addEventListener('click', handlePlayPauseToggle);
    document.querySelector('.deck-controls-row .fa-step-forward').parentElement.addEventListener('click', handleNextTrack);
    document.querySelector('.deck-controls-row .fa-step-backward').parentElement.addEventListener('click', handlePrevTrack);
    
    // Timeline Scrub Binding
    document.getElementById('progress-bar').addEventListener('click', handleScrubNavigation);

    // Input Search Debounce-ready tracking
    document.getElementById('search-input').addEventListener('input', (e) => {
        processLiveSearch(e.target.value);
    });

    // Boot view initialization sequence 
    renderWorkspaceView('home');
});
