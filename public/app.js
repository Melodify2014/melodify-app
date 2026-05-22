/**
 * ==========================================================================
 * YOUTUBE DATA API CONFIGURATION
 * ==========================================================================
 * Paste your Google Cloud Console API key inside the quotes below.
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
let currentView = 'home'; // Options: home, following, recent, liked

// Default local collections matching your UI screen setups
const mockDatabase = {
    home: [
        { id: 'tN8w7g0-Nsw', title: 'METAMORPHOSIS', artist: 'INTERWORLD', badge: 'CLASSIC', status: 'Trending' },
        { id: 'fN_3Zg_3Ew0', title: 'MURDER IN MY MIND', artist: 'KORDHELL', badge: 'DRIFT', status: 'Trending' },
        { id: '1-xGerv5FOk', title: 'RAVE', artist: 'Dxrk', badge: 'POPULAR', status: 'Trending' },
        { id: 'Wv2rLZmb_8g', title: 'CLOSE EYES', artist: 'DVRST', badge: 'ATMOSPHERIC', status: 'Trending' },
        { id: 'H6YvS6O0m_o', title: 'GIGA CHAD THEME', artist: 'g3ox_em', badge: 'MEME', status: 'Trending' },
        { id: 'vA0A8X9xYSw', title: 'AUTOMOTIVE', artist: 'Phonk Killer', badge: 'COWBELL', status: 'Trending' }
    ],
    following: [
        { id: 'dQw4w9WgXcQ', title: 'Cuz We\'re Playing...', artist: 'CG5', badge: 'CACHED', status: 'Following' },
        { id: 'XqgYj7nO9fM', title: 'smol qwel and tall...', artist: 'CG5', badge: 'CACHED', status: 'Following' },
        { id: 'L_LUpnjbP90', title: 'POPPY PLAYTIME...', artist: 'CG5', badge: 'CACHED', status: 'Following' }
    ],
    recent: [],
    liked: []
};

/**
 * ==========================================================================
 * 2. YOUTUBE IFRAME HARDWARE ENGINE (Audio/Video Playback)
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
    
    // Manage active state of sidebar items
    document.querySelectorAll('.sidebar .menu-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${viewKey}`);
    if (activeNav) activeNav.classList.add('active');

    if (!customData) {
        heading.textContent = `${viewKey.charAt(0).toUpperCase() + viewKey.slice(1)} Feed`;
    }

    const dataToRender = customData || mockDatabase[viewKey] || [];
    mainGrid.innerHTML = '';

    if (dataToRender.length === 0) {
        mainGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--txt-dim); padding-top: 40px;">No tracks found here.</div>`;
        return;
    }

    currentTrackList = dataToRender;

    dataToRender.forEach((track, index) => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.setAttribute('data-id', track.id);
        
        // Uses hqdefault image mapping directly to prevent 404 console errors on Render
        const imageUrl = track.img || `https://img.youtube.com/vi/${track.id}/hqdefault.jpg`;
        
        card.innerHTML = `
            <div class="card-thumb-wrap">
                <img src="${imageUrl}" alt="${track.title}">
                <div class="card-play-overlay">
                    <i class="fas fa-play"></i>
                </div>
                <span class="card-badge">${track.badge || 'LIVE'}</span>
            </div>
            <h4>${track.title}</h4>
            <div class="card-meta-row">
                <p>${track.artist}</p>
                <span class="status-action-tag">${track.status || 'Following'}</span>
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

    document.getElementById('player-title').textContent = track.title;
    document.getElementById('player-artist').textContent = track.artist;
    
    const thumb = document.getElementById('player-thumb');
    thumb.src = track.img || `https://img.youtube.com/vi/${track.id}/hqdefault.jpg`;
    thumb.style.opacity = '1';

    ytPlayer.loadVideoById(track.id);

    // Dynamic ambiance toggle rules
    if (track.badge === 'DRIFT') {
        document.body.classList.add('drift-active');
    } else {
        document.body.classList.remove('drift-active');
    }

    if (!mockDatabase.recent.some(t => t.id === track.id)) {
        mockDatabase.recent.unshift(track);
        if (mockDatabase.recent.length > 30) mockDatabase.recent.pop();
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
 * 6. LIVE YOUTUBE SERVER SEARCH ENGINE
 * ==========================================================================
 */
let searchTimeout = null;

function handleSearchInput(query) {
    clearTimeout(searchTimeout);
    
    if (!query.toLowerCase().trim()) {
        renderWorkspaceView(currentView);
        return;
    }

    // Debounce processing to optimize API quote spending
    searchTimeout = setTimeout(() => {
        fetchLiveYouTubeData(query);
    }, 500);
}

async function fetchLiveYouTubeData(query) {
    const heading = document.getElementById('feed-heading');

    if (!YT_DATA_API_KEY || YT_DATA_API_KEY.includes("YOUR_ACTUAL_YOUTUBE_API_KEY")) {
        console.warn("API Key unconfigured. Falling back onto internal local database matching.");
        fallbackLocalSearch(query);
        return;
    }

    heading.textContent = `Searching YouTube for "${query}"...`;

    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=18&q=${encodeURIComponent(query)}&type=video&key=${YT_DATA_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`Google Server Status: ${response.status}`);
        
        const data = await response.json();
        
        const liveTracks = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            badge: 'YT',
            status: 'Live Result',
            img: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`
        }));

        heading.textContent = `Search Results for: "${query}"`;
        renderWorkspaceView(currentView, liveTracks);

    } catch (error) {
        console.error("YouTube Live Search Engine Error:", error);
        heading.textContent = `Network Error. Showing local database matches.`;
        fallbackLocalSearch(query);
    }
}

function fallbackLocalSearch(query) {
    const cleanQuery = query.toLowerCase().trim();
    const combinedPool = [...mockDatabase.home, ...mockDatabase.following, ...mockDatabase.recent, ...mockDatabase.liked];
    const uniquelyMapped = Array.from(new Map(combinedPool.map(item => [item.id, item])).values());

    const filtered = uniquelyMapped.filter(track => 
        track.title.toLowerCase().includes(cleanQuery) || 
        track.artist.toLowerCase().includes(cleanQuery)
    );

    renderWorkspaceView(currentView, filtered);
}

/**
 * ==========================================================================
 * 7. SYSTEM BINDINGS AND LIFECYCLE INITIALIZER
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    // Navigation Menu Filters
    document.getElementById('nav-home').addEventListener('click', () => renderWorkspaceView('home'));
    document.getElementById('nav-following').addEventListener('click', () => renderWorkspaceView('following'));
    document.getElementById('nav-recent').addEventListener('click', () => renderWorkspaceView('recent'));
    document.getElementById('nav-liked').addEventListener('click', () => renderWorkspaceView('liked'));

    // Hardware Audio Deck Actions
    document.getElementById('play-pause-btn').addEventListener('click', handlePlayPauseToggle);
    document.querySelector('.deck-controls-row .fa-step-forward').parentElement.addEventListener('click', handleNextTrack);
    document.querySelector('.deck-controls-row .fa-step-backward').parentElement.addEventListener('click', handlePrevTrack);
    
    // Timeline Seek Handler
    document.getElementById('progress-bar').addEventListener('click', handleScrubNavigation);

    // Live Search Box Input Event
    document.getElementById('search-input').addEventListener('input', (e) => {
        handleSearchInput(e.target.value);
    });

    // Boot view setup sequence
    renderWorkspaceView('home');
});
