let queue = [], currentIndex = 0, player, isDriftMode = false, isLooping = false;

// User Identity Security Credentials & Offline State Caches
let authToken = localStorage.getItem("token") || null;
let currentUsername = localStorage.getItem("username") || "Guest";
let liked = JSON.parse(localStorage.getItem("liked") || "[]");
let recent = JSON.parse(localStorage.getItem("recent") || "[]");
let following = JSON.parse(localStorage.getItem("following") || "{}");
let authMode = "LOGIN"; 

function checkAuthStatus() {
    const overlay = document.getElementById("auth-overlay");
    const statusText = document.getElementById("user-display-status");
    
    if (!authToken) {
        overlay.style.display = "flex";
        if(statusText) statusText.textContent = "Offline Profile";
    } else {
        overlay.style.display = "none";
        if(statusText) statusText.textContent = `Connected: ${currentUsername}`;
        loadData("q=Phonk music 2026");
    }
}

function toggleAuthMode() {
    authMode = authMode === "LOGIN" ? "REGISTER" : "LOGIN";
    document.getElementById("auth-title").textContent = authMode === "LOGIN" ? "Sign In to Melodify" : "Create Account";
    document.getElementById("auth-submit-btn").textContent = authMode === "LOGIN" ? "LOGIN" : "REGISTER";
    document.getElementById("auth-switch-prompt").textContent = authMode === "LOGIN" ? "New listener?" : "Already tracking?";
    document.getElementById("auth-switch-link").textContent = authMode === "LOGIN" ? "Log in" : "Create an account";
    document.getElementById("auth-error").style.display = "none";
}

async function handleAuthSubmit() {
    const username = document.getElementById("auth-user").value.trim();
    const password = document.getElementById("auth-pass").value;
    const errorDiv = document.getElementById("auth-error");
    
    if(!username || !password) {
        errorDiv.textContent = "Please fill out all credentials.";
        errorDiv.style.display = "block";
        return;
    }

    const endpoint = authMode === "LOGIN" ? "/api/auth/login" : "/api/auth/register";
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
            errorDiv.textContent = data.error || "Authentication failed.";
            errorDiv.style.display = "block";
            return;
        }

        if (authMode === "REGISTER") {
            authMode = "REGISTER";
            toggleAuthMode();
            errorDiv.textContent = "Registration successful! Please sign in.";
            errorDiv.style.display = "block";
            errorDiv.style.color = "#22c55e";
        } else {
            authToken = data.token;
            currentUsername = data.username;
            liked = data.likedTracks || [];
            following = data.followingArtists || {};
            
            localStorage.setItem("token", authToken);
            localStorage.setItem("username", currentUsername);
            localStorage.setItem("liked", JSON.stringify(liked));
            localStorage.setItem("following", JSON.stringify(following));

            document.getElementById("auth-user").value = "";
            document.getElementById("auth-pass").value = "";
            checkAuthStatus();
        }
    } catch(err) {
        errorDiv.textContent = "Connection dropped to backend core.";
        errorDiv.style.display = "block";
    }
}

async function syncDataWithCloud() {
    if (!authToken) return;
    try {
        await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ likedTracks: liked, followingArtists: following })
        });
    } catch(e) {
        console.warn("Background cloud backup sync failed.", e);
    }
}

function logout() {
    localStorage.clear();
    authToken = null;
    currentUsername = "Guest";
    liked = [];
    following = {};
    recent = [];
    window.location.reload();
}

/* --- YOUTUBE NATIVE CORE ENGINE --- */
window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('yt-player', {
        height: '100%', width: '100%',
        playerVars: { 'autoplay': 1, 'controls': 0, 'enablejsapi': 1, 'origin': window.location.origin },
        events: {
            'onStateChange': (e) => { 
                if (e.data === YT.PlayerState.ENDED) {
                    if (isLooping) player.playVideo(); else playNext();
                }
                updatePlayBtn();
            },
            'onError': () => playNext(), 
            'onReady': () => {
                setInterval(updateProgressBar, 1000);
                setupMediaSession();
            }
        }
    });
};

function toggleDriftMode() {
    isDriftMode = !isDriftMode;
    document.body.classList.toggle("drift-active", isDriftMode);
    if (isDriftMode) {
        const container = document.getElementById("viz-container");
        container.innerHTML = "";
        for(let i=0; i<12; i++){
            let b = document.createElement("div"); b.className = "v-bar";
            b.style.animationDelay = (Math.random() * 0.5) + "s";
            container.appendChild(b);
        }
    }
}

async function loadData(params = "") {
    if(!authToken) return;
    const grid = document.getElementById("grid");
    grid.innerHTML = "<div style='padding:40px; opacity:0.3; font-weight:700;'>SYNCING VAULT DATASTREAM...</div>";
    let refinedParams = params;
    
    if (params.includes("q=") && params.toLowerCase().includes("naomi")) {
        refinedParams = `q=naomi+brazilian+phonk`;
    }

    try {
        const res = await fetch(`/api/search?${refinedParams}`);
        const data = await res.json();
        queue = data.videos || [];
        render();
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

function render() {
    const grid = document.getElementById("grid");
    grid.innerHTML = "";
    if (queue.length === 0) {
        grid.innerHTML = "<div style='padding:50px; text-align:center; color:#444; font-weight:700;'>No audio tracks located in this matrix block.</div>";
        return;
    }
    queue.forEach((v, i) => {
        const isFollowed = following[v.channelId];
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <img src="${v.thumbnail}">
            <div class="c-title">${v.title}</div>
            <div style="display:flex; justify-content:space-between; align-items:center">
                <span style="font-size:11px; color:var(--txt-dim); font-weight:600; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v.artist}</span>
                <button class="follow-badge ${isFollowed ? 'active' : ''}" 
                        onclick="event.stopPropagation(); toggleFollow('${v.channelId}', '${v.artist}')">
                    ${isFollowed ? 'Following' : '+ Follow'}
                </button>
            </div>`;
        card.onclick = () => play(i);
        grid.appendChild(card);
    });
}

function play(i) {
    if (queue.length === 0 || !player) return;
    if (i >= queue.length) currentIndex = 0;
    else if (i < 0) currentIndex = queue.length - 1;
    else currentIndex = i;

    const v = queue[currentIndex];
    player.loadVideoById(v.id);
    
    document.getElementById("p-title").textContent = v.title;
    document.getElementById("p-artist").textContent = v.artist;
    document.getElementById("drift-title").textContent = v.title;
    document.getElementById("drift-artist-display").textContent = v.artist;
    document.getElementById("drift-bg").style.backgroundImage = `url('${v.thumbnail}')`;

    recent = [v, ...recent.filter(x => x.id !== v.id)].slice(0, 40);
    localStorage.setItem("recent", JSON.stringify(recent));
    updateLikeUI();
    updateMediaSessionMetadata(v);
}

function playNext() { play(currentIndex + 1); }
function playPrev() { play(currentIndex - 1); }
function changeVolume(amount) { if (player && player.setVolume) player.setVolume(amount); }
function togglePlay() { player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); }

function updatePlayBtn() { 
    const btn = document.getElementById("play-btn");
    if(btn && player) btn.textContent = player.getPlayerState() === 1 ? "PAUSE" : "PLAY"; 
}

function updateProgressBar() {
    if (player && player.getDuration) {
        const perc = (player.getCurrentTime() / player.getDuration()) * 100;
        document.getElementById("progress-bar").style.width = (perc || 0) + "%";
    }
}

function seek(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const perc = (event.clientX - rect.left) / rect.width;
    player.seekTo(player.getDuration() * perc);
}

function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => player.playVideo());
        navigator.mediaSession.setActionHandler('pause', () => player.pauseVideo());
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    }
}

function updateMediaSessionMetadata(track) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title, artist: track.artist,
            artwork: [{ src: track.thumbnail, sizes: '480x360', type: 'image/jpeg' }]
        });
    }
}

document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return; 
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight' && player) player.seekTo(player.getCurrentTime() + 5);
    else if (e.code === 'ArrowLeft' && player) player.seekTo(player.getCurrentTime() - 5);
});

function toggleLikeCurrent() {
    const v = queue[currentIndex];
    if (!v) return;
    const idx = liked.findIndex(l => l.id === v.id);
    idx > -1 ? liked.splice(idx, 1) : liked.push(v);
    localStorage.setItem("liked", JSON.stringify(liked));
    updateLikeUI();
    syncDataWithCloud();
}

function updateLikeUI() {
    const isLiked = liked.some(l => l.id === queue[currentIndex]?.id);
    document.getElementById("p-like-btn").classList.toggle("active", isLiked);
}

function toggleFollow(id, name) {
    following[id] ? delete following[id] : following[id] = name;
    localStorage.setItem("following", JSON.stringify(following));
    render();
    syncDataWithCloud();
}

function toggleLoop() {
    isLooping = !isLooping;
    document.getElementById("loop-btn").classList.toggle("active", isLooping);
}

function showHome() { setActiveNav("btn-home"); document.getElementById("view-title").textContent = "phonk feed"; loadData("q=Phonk music 2026"); }
function showLiked() { setActiveNav("btn-liked"); document.getElementById("view-title").textContent = "liked tracks"; queue = liked; render(); }
function showRecent() { setActiveNav("btn-recent"); document.getElementById("view-title").textContent = "recent"; queue = recent; render(); }

function showFollowing() {
    setActiveNav("btn-following");
    const grid = document.getElementById("grid");
    const viewTitle = document.getElementById("view-title");
    viewTitle.textContent = "following";
    grid.innerHTML = "";
    const artists = Object.entries(following);
    if (artists.length === 0) {
        grid.innerHTML = "<div style='padding:50px; color:#444; font-weight:700;'>No producers followed yet.</div>";
        return;
    }
    artists.forEach(([id, name]) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `<div class="c-title" style="text-align:center; margin-bottom:0; padding:10px 0;">👤 ${name}</div>`;
        card.onclick = () => { viewTitle.textContent = name.toLowerCase(); loadData(`channelId=${id}`); };
        grid.appendChild(card);
    });
}

function setActiveNav(id) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function search() {
    const q = document.getElementById("search-input").value;
    loadData(`q=${encodeURIComponent(q)}`);
}

checkAuthStatus();
