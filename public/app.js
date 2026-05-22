// ==========================================
// 1. INSERT YOUR GOOGLE API KEY HERE
const YOUTUBE_API_KEY = 'AIzaSyANndBije8n2js5wtfLb05SDW91IGsiqOg';
// ==========================================

let TRACKS_DATABASE = []; 

let state = {
  currentUser: "melodify owner",
  currentView: "home",
  searchQuery: "phonk music", 
  currentTrack: null,
  isPlaying: false,
  isDriftMode: false,
  playbackInterval: null,
  progressPercent: 0,
  likedTrackIds: [],
  recentTrackIds: [],
  followedChannels: [] // Format: { id: "CHANNEL_ID", title: "CHANNEL_TITLE" }
};

// --- YouTube Embedded Player Instance ---
let ytPlayer;

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player-container', {
    height: '0',
    width: '0',
    videoId: '',
    playerVars: { 'autoplay': 0, 'controls': 0 },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (event.data === 1) {
    state.isPlaying = true;
    nodes.playIcon.className = "fa-solid fa-pause";
  } else {
    state.isPlaying = false;
    nodes.playIcon.className = "fa-solid fa-play";
  }
}

// --- Target DOM Node System Map ---
const nodes = {
  appViewport: document.getElementById("app-viewport"),
  navHome: document.getElementById("nav-home"),
  navFollowing: document.getElementById("nav-following"),
  navRecent: document.getElementById("nav-recent"),
  navLiked: document.getElementById("nav-liked"),
  searchInput: document.getElementById("search-input"),
  userDisplay: document.getElementById("user-display"),
  feedHeading: document.getElementById("feed-heading"),
  tracksGrid: document.getElementById("tracks-grid"),
  playerThumb: document.getElementById("player-thumb"),
  playerTitle: document.getElementById("player-title"),
  playerProducer: document.getElementById("player-producer"),
  playerPlayBtn: document.getElementById("player-play-btn"),
  playIcon: document.getElementById("play-icon"),
  playerLikeBtn: document.getElementById("player-like-btn"),
  likeIcon: document.getElementById("like-icon"),
  playerProgress: document.getElementById("player-progress"),
  progressBarContainer: document.querySelector(".progress-bar"),
  playerDriftBtn: document.getElementById("player-drift-btn"),
  btnBackChannels: document.getElementById("btn-back-channels")
};

document.addEventListener("DOMContentLoaded", () => {
  setupEventBindings();
  loadLocalStorageCacheContext();
  searchYouTube(state.searchQuery);
});

function setupEventBindings() {
  if (nodes.navHome) nodes.navHome.addEventListener("click", () => switchView("home"));
  if (nodes.navFollowing) nodes.navFollowing.addEventListener("click", () => switchView("following"));
  if (nodes.navRecent) nodes.navRecent.addEventListener("click", () => switchView("recent"));
  if (nodes.navLiked) nodes.navLiked.addEventListener("click", () => switchView("liked"));
  if (nodes.btnBackChannels) nodes.btnBackChannels.addEventListener("click", () => switchView("following"));

  if (nodes.searchInput) {
    nodes.searchInput.addEventListener("keydown", (e) => {
      if (e.key === 'Enter') {
        state.searchQuery = e.target.value;
        state.currentView = "home";
        document.querySelectorAll(".sidebar .menu-item").forEach(btn => btn.classList.remove("active"));
        if (nodes.navHome) nodes.navHome.classList.add("active");
        searchYouTube(state.searchQuery);
      }
    });
  }

  if (nodes.playerPlayBtn) nodes.playerPlayBtn.addEventListener("click", togglePlaybackState);
  if (nodes.playerLikeBtn) nodes.playerLikeBtn.addEventListener("click", toggleTrackLikeState);
  if (nodes.progressBarContainer) nodes.progressBarContainer.addEventListener("click", scrubPlaybackTimeline);
  if (nodes.playerDriftBtn) nodes.playerDriftBtn.addEventListener("click", toggleDriftOverdrive);
}

function loadLocalStorageCacheContext() {
  state.likedTrackIds = JSON.parse(localStorage.getItem(`liked_${state.currentUser}`)) || [];
  state.recentTrackIds = JSON.parse(localStorage.getItem(`recent_${state.currentUser}`)) || [];
  state.followedChannels = JSON.parse(localStorage.getItem(`followed_channels_${state.currentUser}`)) || [];
}

// --- Core View Navigator Logic ---
function switchView(targetView) {
  document.querySelectorAll(".sidebar .menu-item").forEach(btn => btn.classList.remove("active"));
  if (nodes.btnBackChannels) nodes.btnBackChannels.style.display = "none"; 
  state.currentView = targetView;

  if (targetView === "home") {
    if (nodes.navHome) nodes.navHome.classList.add("active");
    searchYouTube(state.searchQuery);
  } else if (targetView === "following") {
    if (nodes.navFollowing) nodes.navFollowing.classList.add("active");
    renderFollowedChannelsDirectory();
  } else if (targetView === "recent") {
    if (nodes.navRecent) nodes.navRecent.classList.add("active");
    if (nodes.feedHeading) nodes.feedHeading.textContent = "Recently Played";
    const historicalStorage = JSON.parse(localStorage.getItem(`history_objects_${state.currentUser}`)) || [];
    TRACKS_DATABASE = historicalStorage.filter(t => state.recentTrackIds.includes(t.id));
    renderTrackWorkspace();
  } else if (targetView === "liked") {
    if (nodes.navLiked) nodes.navLiked.classList.add("active");
    if (nodes.feedHeading) nodes.feedHeading.textContent = "Your Underground Stash";
    const historicalStorage = JSON.parse(localStorage.getItem(`history_objects_${state.currentUser}`)) || [];
    TRACKS_DATABASE = historicalStorage.filter(t => state.likedTrackIds.includes(t.id));
    renderTrackWorkspace();
  }
}

// --- Render Followed Channels Directory Grid ---
function renderFollowedChannelsDirectory() {
  if (nodes.feedHeading) nodes.feedHeading.textContent = "Followed Creators";
  if (!nodes.tracksGrid) return;
  nodes.tracksGrid.innerHTML = "";

  if (state.followedChannels.length === 0) {
    nodes.tracksGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--txt-dim); padding-top: 40px; font-size: 13px;">
        You aren't following any channels yet! Search on Home and tap 'Follow' next to tracks.
      </div>`;
    return;
  }

  state.followedChannels.forEach(channel => {
    const channelCard = document.createElement("div");
    channelCard.className = "channel-card-item";
    channelCard.innerHTML = `
      <div class="channel-avatar-placeholder">
        <i class="fa-solid fa-user-astronaut"></i>
      </div>
      <h3>${channel.title}</h3>
      <button class="btn-follow-toggle following-active" style="font-size:10px;">View Videos</button>
    `;
    
    channelCard.addEventListener("click", () => openSpecificChannelFeedPage(channel));
    nodes.tracksGrid.appendChild(channelCard);
  });
}

// --- Fetch & Open Dedicated Creator Feed Page (Strictly Horizontal Videos) ---
async function openSpecificChannelFeedPage(channel) {
  if (nodes.btnBackChannels) nodes.btnBackChannels.style.display = "block";
  if (nodes.feedHeading) nodes.feedHeading.textContent = `${channel.title}'s Videos`;
  
  nodes.tracksGrid.innerHTML = `<div style="color:var(--txt-dim); padding: 20px;">Fetching video catalogue streams...</div>`;

  try {
    // Strictly enforcing type=video and videoEmbeddable=true parameters
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&channelId=${channel.id}&type=video&videoEmbeddable=true&order=date&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      nodes.tracksGrid.innerHTML = `<div style="color:red; padding:20px;">API Error: ${data.error.message}</div>`;
      return;
    }

    // Filter to ensure things like shorts are minimized by checking descriptions or titles if necessary
    const videoItems = data.items.filter(item => {
      const isVideo = item.id && item.id.videoId;
      const isShort = item.snippet.title.toLowerCase().includes("#shorts") || (item.snippet.description && item.snippet.description.toLowerCase().includes("#shorts"));
      return isVideo && !isShort;
    });

    TRACKS_DATABASE = videoItems.map(item => ({
      id: item.id.videoId,
      channelId: channel.id,
      title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
      producer: channel.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      badge: "Cached"
    }));

    // AUTO-CACHE SYSTEM ACTION: Commit all gathered items into local storage history cache
    const historicalStorage = JSON.parse(localStorage.getItem(`history_objects_${state.currentUser}`)) || [];
    TRACKS_DATABASE.forEach(track => {
      if (!historicalStorage.some(h => h.id === track.id)) {
        historicalStorage.push(track);
      }
    });
    localStorage.setItem(`history_objects_${state.currentUser}`, JSON.stringify(historicalStorage));

    renderTrackWorkspace();

  } catch (err) {
    nodes.tracksGrid.innerHTML = `<div style="color:red; padding: 20px;">Failed to sync with channel data servers.</div>`;
  }
}

// --- Live YouTube Network Fetch Operations ---
async function searchYouTube(query) {
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
    nodes.tracksGrid.innerHTML = `<div style="color:red; padding: 20px;">Missing YouTube API Key on Line 2!</div>`;
    return;
  }

  if (state.currentView !== "home") return;

  if (nodes.feedHeading) nodes.feedHeading.textContent = `Searching: ${query}...`;
  nodes.tracksGrid.innerHTML = `<div style="color:var(--txt-dim); padding: 20px;">Fetching from YouTube...</div>`;

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=24&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      nodes.tracksGrid.innerHTML = `<div style="color:red; padding: 20px;">API Error: ${data.error.message}</div>`;
      return;
    }

    const videoItems = data.items.filter(item => {
      const isVideo = item.id && item.id.videoId;
      const isShort = item.snippet.title.toLowerCase().includes("#shorts");
      return isVideo && !isShort;
    });

    TRACKS_DATABASE = videoItems.map(item => ({
      id: item.id.videoId,
      channelId: item.snippet.channelId, 
      title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
      producer: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url,
      badge: "YT"
    }));

    const historicalStorage = JSON.parse(localStorage.getItem(`history_objects_${state.currentUser}`)) || [];
    TRACKS_DATABASE.forEach(track => {
      if (!historicalStorage.some(h => h.id === track.id)) historicalStorage.push(track);
    });
    localStorage.setItem(`history_objects_${state.currentUser}`, JSON.stringify(historicalStorage));

    if (nodes.feedHeading) nodes.feedHeading.textContent = "Phonk Feed";
    renderTrackWorkspace();

  } catch (error) {
    nodes.tracksGrid.innerHTML = `<div style="color:var(--txt-dim); padding: 20px;">Failed to connect to streaming cloud feed.</div>`;
  }
}

// --- Render Core DOM View Structure Elements ---
function renderTrackWorkspace() {
  if (!nodes.tracksGrid) return;
  
  if (state.currentView !== "following" && nodes.btnBackChannels) {
    nodes.btnBackChannels.style.display = "none";
  }

  nodes.tracksGrid.innerHTML = "";

  if (TRACKS_DATABASE.length === 0) {
    nodes.tracksGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--txt-dim); padding-top: 40px; font-size: 13px;">
        No videos available inside this feed.
      </div>`;
    return;
  }

  TRACKS_DATABASE.forEach(track => {
    const isFollowing = state.followedChannels.some(c => c.id === track.channelId);

    const card = document.createElement("div");
    card.className = "track-card";
    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img src="${track.thumbnail}" alt="${track.title}">
        <div class="card-play-overlay">
          <i class="fa-solid ${state.currentTrack?.id === track.id && state.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
        </div>
      </div>
      <span class="card-badge">${track.badge}</span>
      <h4>${track.title}</h4>
      <div class="card-meta-row">
        <p>${track.producer}</p>
        <button class="btn-follow-toggle ${isFollowing ? 'following-active' : ''}" data-channel-id="${track.channelId}" data-channel-title="${track.producer}">
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    `;

    card.querySelector(".btn-follow-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleChannelFollowState(track.channelId, track.producer);
    });

    card.addEventListener("click", () => selectAndPlayTrack(track));
    nodes.tracksGrid.appendChild(card);
  });
}

function toggleChannelFollowState(channelId, channelTitle) {
  if (!channelId) return;
  const matchIndex = state.followedChannels.findIndex(c => c.id === channelId);

  if (matchIndex > -1) {
    state.followedChannels.splice(matchIndex, 1);
    localStorage.setItem(`followed_channels_${state.currentUser}`, JSON.stringify(state.followedChannels));
    
    if (state.currentView === "following" && nodes.btnBackChannels.style.display !== "block") {
      renderFollowedChannelsDirectory();
      return;
    }
  } else {
    state.followedChannels.push({ id: channelId, title: channelTitle });
    localStorage.setItem(`followed_channels_${state.currentUser}`, JSON.stringify(state.followedChannels));
  }

  renderTrackWorkspace();
}

// --- Live Audio Deck Controller Engine ---
function selectAndPlayTrack(track) {
  if (state.currentTrack?.id === track.id) {
    togglePlaybackState();
    return;
  }

  state.currentTrack = track;
  state.progressPercent = 0;

  state.recentTrackIds = [track.id, ...state.recentTrackIds.filter(id => id !== track.id)].slice(0, 20);
  localStorage.setItem(`recent_${state.currentUser}`, JSON.stringify(state.recentTrackIds));

  if (nodes.playerThumb) nodes.playerThumb.src = track.thumbnail;
  if (nodes.playerTitle) nodes.playerTitle.textContent = track.title;
  if (nodes.playerProducer) nodes.playerProducer.textContent = track.producer;

  updateLikeButtonUIState();

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(track.id);
  }
  
  startProgressTrackerLoop();
  renderTrackWorkspace();
}

function togglePlaybackState() {
  if (!state.currentTrack || !ytPlayer) return;

  if (state.isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function startProgressTrackerLoop() {
  if (state.playbackInterval) clearInterval(state.playbackInterval);
  
  state.playbackInterval = setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
      const current = ytPlayer.getCurrentTime();
      const total = ytPlayer.getDuration();
      
      if (total > 0) {
        state.progressPercent = (current / total) * 100;
        if (nodes.playerProgress) nodes.playerProgress.style.width = `${state.progressPercent}%`;
      }
    }
  }, 400);
}

function scrubPlaybackTimeline(e) {
  if (!state.currentTrack || !ytPlayer || !nodes.progressBarContainer) return;
  
  const rect = nodes.progressBarContainer.getBoundingClientRect();
  const clickPercent = (e.clientX - rect.left) / rect.width;
  const total = ytPlayer.getDuration();
  
  if (total > 0) {
    ytPlayer.seekTo(clickPercent * total, true);
    state.progressPercent = clickPercent * 100;
    if (nodes.playerProgress) nodes.playerProgress.style.width = `${state.progressPercent}%`;
  }
}

function toggleTrackLikeState() {
  if (!state.currentTrack) return;
  const id = state.currentTrack.id;

  if (state.likedTrackIds.includes(id)) {
    state.likedTrackIds = state.likedTrackIds.filter(i => i !== id);
  } else {
    state.likedTrackIds.push(id);
  }

  localStorage.setItem(`liked_${state.currentUser}`, JSON.stringify(state.likedTrackIds));
  updateLikeButtonUIState();
  if (state.currentView === "liked") switchView("liked");
}

function updateLikeButtonUIState() {
  if (!nodes.playerLikeBtn || !nodes.likeIcon) return;
  if (state.currentTrack && state.likedTrackIds.includes(state.currentTrack.id)) {
    nodes.playerLikeBtn.classList.add("liked");
    nodes.likeIcon.className = "fa-solid fa-heart";
  } else {
    nodes.playerLikeBtn.classList.remove("liked");
    nodes.likeIcon.className = "fa-regular fa-heart";
  }
}

function toggleDriftOverdrive() {
  state.isDriftMode = !state.isDriftMode;
  if (state.isDriftMode) {
    if (nodes.appViewport) nodes.appViewport.classList.add("drift-active");
    if (nodes.playerDriftBtn) nodes.playerDriftBtn.style.color = "var(--accent-drift)";
  } else {
    if (nodes.appViewport) nodes.appViewport.classList.remove("drift-active");
    if (nodes.playerDriftBtn) nodes.playerDriftBtn.style.color = "";
  }
}
