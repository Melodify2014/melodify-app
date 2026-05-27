document.addEventListener('DOMContentLoaded', () => {
    const API_URL = window.location.origin;
    
    let ytPlayerInstance = null;
    let currentAuthMode = 'login'; 
    let activeTrackContext = null;
    let currentViewedProducer = null;
    let isLoopActive = false; 

    // Caches
    let localCacheTracks = [];
    let recommendedCacheTracks = [];
    let producerCacheTracks = [];

    let sessionUserToken = localStorage.getItem('melodify_jwt');
    let authenticatedUserData = null;

    // View Routing Elements
    const views = {
        'view-home': document.getElementById('view-home'),
        'view-subscriptions': document.getElementById('view-subscriptions'),
        'view-producer': document.getElementById('view-producer')
    };
    const menuItems = document.querySelectorAll('.menu-item');

    // UI Hooks
    const tracksContainer = document.getElementById('tracks-container');
    const recommendationsSection = document.getElementById('recommendations-section');
    const recommendationsContainer = document.getElementById('recommendations-container');
    const subscriptionsGrid = document.getElementById('subscriptions-grid');
    const producerTracksContainer = document.getElementById('producer-tracks-container');
    const producerPageName = document.getElementById('producer-page-name');
    const producerSubscribeBtn = document.getElementById('producer-subscribe-btn');
    
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const userPanel = document.getElementById('user-panel');
    const authModal = document.getElementById('auth-modal');
    
    // Playback Hooks
    const playerDock = document.getElementById('player-dock');
    const dockThumb = document.getElementById('dock-thumb');
    const dockTitle = document.getElementById('dock-title');
    const dockProducer = document.getElementById('dock-producer');
    const dockPlayBtn = document.getElementById('dock-play-btn');
    const dockLoopBtn = document.getElementById('dock-loop-btn');
    const dockLikeBtn = document.getElementById('dock-like-btn');

    // Mount Invisible Stream Engine
    const hiddenPlayerDiv = document.createElement('div');
    hiddenPlayerDiv.id = 'melodify-hidden-hardware-engine';
    hiddenPlayerDiv.style.display = 'none';
    document.body.appendChild(hiddenPlayerDiv);

    window.onYouTubeIframeAPIReady = () => {
        ytPlayerInstance = new YT.Player('melodify-hidden-hardware-engine', {
            height: '0', width: '0', playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1 },
            events: {
                'onStateChange': (e) => {
                    if (e.data === YT.PlayerState.ENDED && isLoopActive) { ytPlayerInstance.seekTo(0); ytPlayerInstance.playVideo(); return; }
                    document.querySelectorAll('.play-overlay-btn').forEach(b => {
                        b.textContent = (activeTrackContext && b.getAttribute('data-id') === activeTrackContext._id && e.data === YT.PlayerState.PLAYING) ? '⏸' : '▶';
                    });
                    dockPlayBtn.textContent = e.data === YT.PlayerState.PLAYING ? '⏸' : '▶';
                }
            }
        });
    };

    // --- SPA VIEW ROUTING LOGIC ---
    function switchView(targetViewId) {
        Object.values(views).forEach(pane => pane.classList.add('hidden'));
        views[targetViewId].classList.remove('hidden');
        
        menuItems.forEach(item => {
            item.classList.remove('active');
            if(item.getAttribute('data-target') === targetViewId) item.classList.add('active');
        });

        if (targetViewId === 'view-subscriptions') renderSubscriptionsView();
    }

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.getAttribute('data-target'));
        });
    });

    document.getElementById('brand-home-btn').addEventListener('click', () => switchView('view-home'));

    // --- PRODUCER PAGE LOGIC ---
    async function loadProducerProfile(producerName) {
        currentViewedProducer = producerName;
        producerPageName.textContent = producerName;
        switchView('view-producer');
        updateSubscribeButtonUI();

        producerTracksContainer.innerHTML = '<div class="loading-state">Loading artist catalog...</div>';
        try {
            const res = await fetch(`${API_URL}/api/tracks/producer/${encodeURIComponent(producerName)}`);
            producerCacheTracks = await res.json();
            renderTrackGrid(producerCacheTracks, producerTracksContainer, 'producer');
        } catch (err) {
            producerTracksContainer.innerHTML = '<div class="error-state">Failed to load channel data.</div>';
        }
    }

    // --- SUBSCRIPTION LOGIC ---
    async function toggleSubscribeAction() {
        if (!sessionUserToken) return openModal();
        if (!currentViewedProducer) return;

        try {
            const res = await fetch(`${API_URL}/api/users/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionUserToken}` },
                body: JSON.stringify({ producerName: currentViewedProducer })
            });
            const data = await res.json();
            if (res.ok) {
                authenticatedUserData.subscribedProducers = data.subscribedProducers;
                updateSubscribeButtonUI();
            }
        } catch (e) { console.error("Subscription fault.", e); }
    }

    function updateSubscribeButtonUI() {
        if (!authenticatedUserData || !currentViewedProducer) {
            producerSubscribeBtn.textContent = 'Subscribe';
            producerSubscribeBtn.classList.remove('is-subscribed');
            return;
        }
        const isSubbed = authenticatedUserData.subscribedProducers.includes(currentViewedProducer);
        producerSubscribeBtn.textContent = isSubbed ? 'Subscribed ✓' : 'Subscribe';
        if (isSubbed) producerSubscribeBtn.classList.add('is-subscribed');
        else producerSubscribeBtn.classList.remove('is-subscribed');
    }

    producerSubscribeBtn.addEventListener('click', toggleSubscribeAction);

    function renderSubscriptionsView() {
        if (!authenticatedUserData || !authenticatedUserData.subscribedProducers || authenticatedUserData.subscribedProducers.length === 0) {
            subscriptionsGrid.innerHTML = '<div class="empty-state">You are not subscribed to any channels yet.</div>';
            return;
        }

        subscriptionsGrid.innerHTML = '';
        authenticatedUserData.subscribedProducers.forEach(name => {
            const initial = name.charAt(0).toUpperCase();
            const cardHTML = `
                <div class="subscription-card" data-name="${name.replace(/"/g, '&quot;')}">
                    <div class="sub-avatar">${initial}</div>
                    <h3 class="sub-name">${name}</h3>
                </div>
            `;
            subscriptionsGrid.insertAdjacentHTML('beforeend', cardHTML);
        });

        subscriptionsGrid.querySelectorAll('.subscription-card').forEach(card => {
            card.addEventListener('click', () => loadProducerProfile(card.getAttribute('data-name')));
        });
    }

    // --- CORE DATA FETCHING & RENDERING ---
    async function executeCatalogSynchronization(queryParameters = '') {
        try {
            tracksContainer.innerHTML = '<div class="loading-state">Syncing audio streams...</div>';
            
            const response = await fetch(`${API_URL}/api/tracks${queryParameters}`);
            localCacheTracks = await response.json();
            renderTrackGrid(localCacheTracks, tracksContainer, 'home');

            const recResponse = await fetch(`${API_URL}/api/recommendations${queryParameters}`);
            recommendedCacheTracks = await recResponse.json();
            
            if (recommendedCacheTracks.length > 0) {
                recommendationsSection.classList.remove('hidden');
                renderTrackGrid(recommendedCacheTracks, recommendationsContainer, 'recommendation');
            } else { recommendationsSection.classList.add('hidden'); }
            
            switchView('view-home');
        } catch (err) { tracksContainer.innerHTML = '<div class="error-state">Interface connection sequence dropped.</div>'; }
    }

    function renderTrackGrid(tracksList, containerTarget, contextFlag) {
        containerTarget.innerHTML = '';
        if (!tracksList || tracksList.length === 0) { containerTarget.innerHTML = '<div class="empty-state">No tracks found.</div>'; return; }

        tracksList.forEach(track => {
            const titleParsed = (track.title || 'Untitled').replace(/"/g, '&quot;');
            const producerParsed = (track.producer || 'Unknown').replace(/"/g, '&quot;');
            const isLiked = authenticatedUserData && authenticatedUserData.likedTracks.includes(track._id);
            const videoId = track.youtubeId || '';

            const card = `
                <div class="track-card" data-id="${track._id}">
                    <div class="thumbnail-wrapper">
                        <img src="${track.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}" class="track-thumb" loading="lazy" onerror="this.src='https://img.youtube.com/vi/${videoId}/mqdefault.jpg';" />
                        <button class="play-overlay-btn" data-id="${track._id}" data-context="${contextFlag}">▶</button>
                    </div>
                    <div class="track-details">
                        <h3 class="track-title" title="${titleParsed}">${titleParsed}</h3>
                        <p class="track-producer" data-name="${producerParsed}" title="Go to ${producerParsed}'s Channel">${producerParsed}</p>
                        <div class="card-action-bar">
                            <button class="card-like-btn" data-id="${track._id}">${isLiked ? '❤️' : '♡'}</button>
                        </div>
                    </div>
                </div>
            `;
            containerTarget.insertAdjacentHTML('beforeend', card);
        });

        bindInteractionTriggers(containerTarget, contextFlag);
    }

    function bindInteractionTriggers(containerTarget, contextFlag) {
        let activeCache = contextFlag === 'producer' ? producerCacheTracks : (contextFlag === 'recommendation' ? recommendedCacheTracks : localCacheTracks);

        containerTarget.querySelectorAll('.play-overlay-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTrack = activeCache.find(t => t._id === btn.getAttribute('data-id'));
                if (targetTrack) toggleMediaStream(targetTrack);
            });
        });

        containerTarget.querySelectorAll('.card-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); toggleTrackLikeStatus(btn.getAttribute('data-id')); });
        });

        // Event Delegation for clicking a producer's name
        containerTarget.querySelectorAll('.track-producer').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                loadProducerProfile(el.getAttribute('data-name'));
            });
        });
    }

    // Dock Producer Click
    dockProducer.addEventListener('click', () => {
        if(activeTrackContext && activeTrackContext.producer) loadProducerProfile(activeTrackContext.producer);
    });

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
        
        if (sessionUserToken) fetch(`${API_URL}/api/users/history`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionUserToken}` }, body: JSON.stringify({ trackId: track._id }) });
    }

    dockLoopBtn.addEventListener('click', () => { isLoopActive = !isLoopActive; dockLoopBtn.style.color = isLoopActive ? '#1db954' : '#ffffff'; });
    dockPlayBtn.addEventListener('click', () => {
        if (!activeTrackContext) return;
        if (ytPlayerInstance.getPlayerState() === YT.PlayerState.PLAYING) ytPlayerInstance.pauseVideo();
        else ytPlayerInstance.playVideo();
    });
    document.getElementById('volume-slider').addEventListener('input', (e) => ytPlayerInstance && ytPlayerInstance.setVolume(e.target.value));

    // --- IDENTITY / AUTH ---
    async function verifyUserSession() {
        if (!sessionUserToken) return;
        try {
            const res = await fetch(`${API_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${sessionUserToken}` } });
            if (res.ok) { authenticatedUserData = await res.json(); renderUserAccountInterface(); }
            else clearSessionData();
        } catch (e) { clearSessionData(); }
    }

    function renderUserAccountInterface() {
        userPanel.innerHTML = `<div class="profile-badge"><span class="username-txt">👤 ${authenticatedUserData.username}</span><button id="logout-btn" class="logout-btn">Exit</button></div>`;
        document.getElementById('logout-btn').addEventListener('click', clearSessionData);
        // Force re-renders to show active like/subscribe states
        if(!views['view-home'].classList.contains('hidden')) executeCatalogSynchronization();
        if(!views['view-producer'].classList.contains('hidden')) loadProducerProfile(currentViewedProducer);
    }

    function clearSessionData() {
        localStorage.removeItem('melodify_jwt');
        sessionUserToken = null; authenticatedUserData = null;
        userPanel.innerHTML = `<button id="auth-trigger-btn" class="nav-btn">Sign In</button>`;
        document.getElementById('auth-trigger-btn').addEventListener('click', openModal);
        switchView('view-home');
        executeCatalogSynchronization();
    }

    const openModal = () => authModal.classList.remove('hidden');
    document.getElementById('close-modal-btn').addEventListener('click', () => authModal.classList.add('hidden'));
    if(authTriggerBtn) authTriggerBtn.addEventListener('click', openModal);

    document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
        e.preventDefault();
        currentAuthMode = currentAuthMode === 'login' ? 'register' : 'login';
        document.getElementById('modal-headline').textContent = currentAuthMode === 'login' ? 'Sign In' : 'Create Account';
        document.getElementById('auth-submit-action').textContent = currentAuthMode === 'login' ? 'Continue' : 'Register';
        document.getElementById('auth-toggle-prompt').innerHTML = currentAuthMode === 'login' ? `Don't have an account? <a href="#" id="auth-toggle-link">Register</a>` : `Already a member? <a href="#" id="auth-toggle-link">Sign In</a>`;
    });

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const endpoint = currentAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        try {
            const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('auth-username').value, password: document.getElementById('auth-password').value }) });
            const data = await res.json();
            if (res.ok) { localStorage.setItem('melodify_jwt', data.token); sessionUserToken = data.token; await verifyUserSession(); authModal.classList.add('hidden'); }
            else alert(data.message || "Authorization error.");
        } catch (err) { alert("Authorization network timeout."); }
    });

    async function toggleTrackLikeStatus(trackId) {
        if (!sessionUserToken) return openModal();
        try {
            const res = await fetch(`${API_URL}/api/users/like`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionUserToken}` }, body: JSON.stringify({ trackId }) });
            if (res.ok) {
                authenticatedUserData.likedTracks = (await res.json()).likedTracks;
                if(!views['view-home'].classList.contains('hidden')) renderTrackGrid(localCacheTracks, tracksContainer, 'home');
                if(!views['view-producer'].classList.contains('hidden')) renderTrackGrid(producerCacheTracks, producerTracksContainer, 'producer');
                updateLikeDockIcon();
            }
        } catch (e) { console.error(e); }
    }

    function updateLikeDockIcon() {
        if (!activeTrackContext) return;
        const isLiked = authenticatedUserData && authenticatedUserData.likedTracks.includes(activeTrackContext._id);
        dockLikeBtn.textContent = isLiked ? '❤️' : '♡'; dockLikeBtn.style.color = isLiked ? '#1db954' : '#fff';
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
