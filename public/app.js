let queue = [], currentIndex = 0, player, isDriftMode = false, isLooping = false;

// Data persistence
let liked = JSON.parse(localStorage.getItem("liked") || "[]");
let recent = JSON.parse(localStorage.getItem("recent") || "[]");
let following = JSON.parse(localStorage.getItem("following") || "{}");

window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('yt-player', {
        height: '100%', width: '100%',
        playerVars: { 
            'autoplay': 1, 'controls': 0, 'enablejsapi': 1,
            'origin': window.location.origin 
        },
        events: {
            'onStateChange': (e) => { 
                if (e.data === YT.PlayerState.ENDED) {
                    if (isLooping) player.playVideo();
                    else playNext();
                }
                updatePlayBtn();
            },
            // QoL 2: Auto-skip restricted tracks immediately upon error detection
            'onError': () => {
                console.warn("Track unplayable. Skipping forward...");
                playNext();
            },
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
    const grid = document.getElementById("grid");
    grid.innerHTML = "<div style='padding:40px; opacity:0.3'>SYNCING VAULT...</div>";
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
        grid.innerHTML = "<div style='padding:50px; text-align:center; color:#444'>No tracks found.</div>";
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
                <span style="font-size:10px; color:var(--txt-dim)">${v.artist}</span>
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
    // Bounds control wrap-around
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

// QoL 4: Linear Navigation Controls
function playNext() { play(currentIndex + 1); }
function playPrev() { play(currentIndex - 1); }

// QoL 5: Fine-tuned volume controller
function changeVolume(amount) {
    if (player && player.setVolume) {
        player.setVolume(amount);
    }
}

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

// QoL 1: System Lockscreen and Media Key integration bindings
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
            title: track.title,
            artist: track.artist,
            artwork: [{ src: track.thumbnail, sizes: '480x360', type: 'image/jpeg' }]
        });
    }
}

// QoL 3: Global Hotkeys (Spacebar context control)
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return; 
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    } else if (e.code === 'ArrowRight' && player) {
        player.seekTo(player.getCurrentTime() + 5);
    } else if (e.code === ArrowLeft && player) {
        player.seekTo(player.getCurrentTime() - 5);
    }
});

function toggleLikeCurrent() {
    const v = queue[currentIndex];
    if (!v) return;
    const idx = liked.findIndex(l => l.id === v.id);
    idx > -1 ? liked.splice(idx, 1) : liked.push(v);
    localStorage.setItem("liked", JSON.stringify(liked));
    updateLikeUI();
}

function updateLikeUI() {
    const isLiked = liked.some(l => l.id === queue[currentIndex]?.id);
    document.getElementById("p-like-btn").classList.toggle("active", isLiked);
}

function toggleFollow(id, name) {
    following[id] ? delete following[id] : following[id] = name;
    localStorage.setItem("following", JSON.stringify(following));
    render();
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
        grid.innerHTML = "<div style='padding:50px; color:#444'>No producers followed yet.</div>";
        return;
    }
    artists.forEach(([id, name]) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `<div class="c-title" style="text-align:center">${name}</div>`;
        card.onclick = () => {
            viewTitle.textContent = name.toLowerCase();
            loadData(`channelId=${id}`);
        };
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

showHome();