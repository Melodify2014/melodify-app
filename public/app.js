document.addEventListener('DOMContentLoaded', () => {
    const API_URL = window.location.origin;
    
    let ytPlayerInstance = null;
    let currentAuthMode = 'login'; 
    let activeTrackContext = null;
    let localCacheTracks = [];
    let isLoopActive = false; 

    let sessionUserToken = localStorage.getItem('melodify_jwt');
    let authenticatedUserData = null;

    // Interface Hooks
    const tracksContainer = document.getElementById('tracks-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const userPanel = document.getElementById('user-panel');
    const authModal = document.getElementById('auth-modal');
    const authTriggerBtn = document.getElementById('auth-trigger-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const authForm = document.getElementById('auth-form');
    const authToggleLink = document.getElementById('auth-toggle-link');
    
    // Playback Components
    const playerDock = document.getElementById('player-dock');
    const dockThumb = document.getElementById('dock-thumb');
    const dockTitle = document.getElementById('dock-title');
    const dockProducer = document.getElementById('dock-producer');
    const dockPlayBtn = document.getElementById('dock-play-btn');
    const dockLoopBtn = document.getElementById('dock-loop-btn');
    const dockLikeBtn = document.getElementById('dock-like-btn');
    const volumeSlider = document.getElementById('volume-slider');

    // Mount Invisible Stream Engine
    const hiddenPlayerDiv = document.createElement('div');
    hiddenPlayerDiv.id = 'melodify-hidden-hardware-engine';
    hiddenPlayerDiv.style.display = 'none';
    document.body.appendChild(hiddenPlayerDiv);

    window.onYouTubeIframeAPIReady = () => {
        ytPlayerInstance = new YT.Player('melodify-hidden-hardware-engine', {
            height: '0', width: '0',
            playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1 },
            events: {
                'onStateChange': handleEngineStateChange,
                'onError': (e) => console.error("YouTube Engine Interruption:", e.data)
            }
        });
    };

    async function executeCatalogSynchronization(queryParameters = '') {
        try {
            tracksContainer.innerHTML = '<div class="loading-state">Syncing audio streams...</div>';
            const response = await fetch(`${API_URL}/api/tracks${queryParameters}`);
            localCacheTracks = await response.json();
            renderTrackGrid(localCacheTracks);
        } catch (err) {
            tracksContainer.innerHTML = '<div class="error-state">Interface connection sequence dropped.</div>';
        }
    }

    function renderTrackGrid(tracksList) {
        tracksContainer.innerHTML = '';
        if (!tracksList || tracksList.length === 0) {
            tracksContainer.innerHTML = '<div class="empty-state">No matching music tracks found.</div>';
            return;
        }

        tracksList.forEach(track => {
            const titleParsed = (track.title || 'Untitled Track').replace(/"/g, '&quot;');
            const producerParsed = (track.producer || 'Unknown Producer').replace(/"/g, '&quot;');
            const isLiked = authenticatedUserData && authenticatedUserData.likedTracks.includes(track._id);
            const videoId = track.youtubeId || '';

            const primaryThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            const fallbackThumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

            const card = `
                <div class="track-card" data-id="${track._id}">
                    <div class="thumbnail-wrapper">
                        <img 
                            src="${track.thumbnail || primaryThumb}" 
                            alt="${titleParsed}" 
                            class="track-thumb" 
                            loading="lazy"
                            onerror="this.onerror=null; this.src='${fallbackThumb}';" 
                        />
                        <button class="play-overlay-btn" data-id="${track._id}">▶</button>
                    </div>
                    <div class="track-details">
                        <h3 class="track-title" title="${titleParsed}">${titleParsed}</h3>
                        <p class="track-producer" title="${producerParsed}">${producerParsed}</p>
                        <div class="card-action-bar">
                            <button class="card-like-btn" data-id="${track._id}">
                                ${isLiked ? '❤️' : '♡'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            tracksContainer.insertAdjacentHTML('beforeend', card);
        });

        bindInteractionTriggers();
    }

    function bindInteractionTriggers() {
        tracksContainer.querySelectorAll('.play-overlay-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const targetTrack = localCacheTracks.find(t => t._id === id);
                if (targetTrack) toggleMediaStream(targetTrack);
            });
        });

        tracksContainer.querySelectorAll('.card-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTrackLikeStatus(btn.getAttribute('data-id'));
            });
        });
    }

    function toggleMediaStream(track) {
        if (!ytPlayerInstance || typeof ytPlayerInstance.loadVideoById !== 'function') return;

        playerDock.classList.remove('hidden');

        if (activeTrackContext && activeTrackContext._id === track._id) {
            const state = ytPlayerInstance.getPlayerState();
            if (state === YT.PlayerState.PLAYING) ytPlayerInstance.pauseVideo();
            else ytPlayerInstance.playVideo();
            return;
        }

        activeTrackContext = track;
        dockTitle.textContent = track.title;
        dockProducer.textContent = track.producer;
        dockThumb.src = track.thumbnail || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`;
        dockPlayBtn.textContent = '⏳';

        updateLikeDockIcon();
        ytPlayerInstance.loadVideoById(track.youtubeId);
        logWatchHistory(track._id);
    }

    function handleEngineStateChange(event) {
        if (event.data === YT.PlayerState.ENDED && isLoopActive) {
            ytPlayerInstance.seekTo(0);
            ytPlayerInstance.playVideo();
            return;
        }

        document.querySelectorAll('.play-overlay-btn').forEach(b => {
            if (activeTrackContext && b.getAttribute('data-id') === activeTrackContext._id) {
                b.textContent = event.data === YT.PlayerState.PLAYING ? '⏸' : '▶';
            } else {
                b.textContent = '▶';
            }
        });
        dockPlayBtn.textContent = event.data === YT.PlayerState.PLAYING ? '⏸' : '▶';
    }

    dockLoopBtn.addEventListener('click', () => {
        isLoopActive = !isLoopActive;
        dockLoopBtn.style.color = isLoopActive ? '#1db954' : '#ffffff';
        dockLoopBtn.style.textShadow = isLoopActive ? '0 0 8px #1db954' : 'none';
    });

    dockPlayBtn.addEventListener('click', () => {
        if (!activeTrackContext) return;
        const state = ytPlayerInstance.getPlayerState();
        if (state === YT.PlayerState.PLAYING) ytPlayerInstance.pauseVideo();
        else ytPlayerInstance.playVideo();
    });

    volumeSlider.addEventListener('input', (e) => {
        if (ytPlayerInstance && typeof ytPlayerInstance.setVolume === 'function') {
            ytPlayerInstance.setVolume(e.target.value);
        }
    });

    async function verifyUserSession() {
        if (!sessionUserToken) return;
        try {
            const res = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${sessionUserToken}` }
            });
            if (res.ok) {
                authenticatedUserData = await res.json();
                renderUserAccountInterface();
            } else { clearSessionData(); }
        } catch (e) { clearSessionData(); }
    }

    function renderUserAccountInterface() {
        userPanel.innerHTML = `
            <div class="profile-badge">
                <span class="username-txt">👤 ${authenticatedUserData.username}</span>
                <button id="logout-btn" class="logout-btn">Exit</button>
            </div>
        `;
        document.getElementById('logout-btn').addEventListener('click', clearSessionData);
        renderTrackGrid(localCacheTracks);
    }

    function clearSessionData() {
        localStorage.removeItem('melodify_jwt');
        sessionUserToken = null;
        authenticatedUserData = null;
        userPanel.innerHTML = `<button id="auth-trigger-btn" class="nav-btn">Sign In</button>`;
        document.getElementById('auth-trigger-btn').addEventListener('click', openModal);
        renderTrackGrid(localCacheTracks);
    }

    const openModal = () => authModal.classList.remove('hidden');
    const closeModal = () => authModal.classList.add('hidden');

    if (authTriggerBtn) authTriggerBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);

    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        currentAuthMode = currentAuthMode === 'login' ? 'register' : 'login';
        document.getElementById('modal-headline').textContent = currentAuthMode === 'login' ? 'Sign In to Melodify' : 'Create Account';
        document.getElementById('auth-submit-action').textContent = currentAuthMode === 'login' ? 'Continue' : 'Register';
        document.getElementById('auth-toggle-prompt').innerHTML = currentAuthMode === 'login' ? `Don't have an account? <a href="#" id="auth-toggle-link">Register</a>` : `Already a member? <a href="#" id="auth-toggle-link">Sign In</a>`;
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const endpoint = currentAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('melodify_jwt', data.token);
                sessionUserToken = data.token;
                await verifyUserSession();
                closeModal();
                authForm.reset();
            } else { alert(data.message || "Authorization error."); }
        } catch (err) { alert("Authorization network timeout."); }
    });

    async function toggleTrackLikeStatus(trackId) {
        if (!sessionUserToken) return openModal();
        try {
            const res = await fetch(`${API_URL}/api/users/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionUserToken}` },
                body: JSON.stringify({ trackId })
            });
            const data = await res.json();
            if (res.ok) {
                authenticatedUserData.likedTracks = data.likedTracks;
                renderTrackGrid(localCacheTracks);
                updateLikeDockIcon();
            }
        } catch (e) { console.error(e); }
    }

    async function logWatchHistory(trackId) {
        if (!sessionUserToken) return;
        try {
            await fetch(`${API_URL}/api/users/history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionUserToken}` },
                body: JSON.stringify({ trackId })
            });
        } catch (e) { console.error(e); }
    }

    function updateLikeDockIcon() {
        if (!activeTrackContext) return;
        const isLiked = authenticatedUserData && authenticatedUserData.likedTracks.includes(activeTrackContext._id);
        dockLikeBtn.textContent = isLiked ? '❤️' : '♡';
        dockLikeBtn.style.color = isLiked ? '#1db954' : '#fff';
    }

    dockLikeBtn.addEventListener('click', () => { if (activeTrackContext) toggleTrackLikeStatus(activeTrackContext._id); });

    const executeSearchAction = () => {
        const query = searchInput.value.trim();
        if (query) executeCatalogSynchronization(`?q=${encodeURIComponent(query)}`);
    };

    searchBtn.addEventListener('click', executeSearchAction);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSearchAction(); });

    verifyUserSession().then(() => executeCatalogSynchronization());
});
