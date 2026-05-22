// ==========================================
// 1. INSERT YOUR GOOGLE API KEY HERE
const YOUTUBE_API_KEY = 'AIzaSyANndBije8n2js5wtfLb05SDW91IGsiqOg';
// ==========================================

let TRACKS_DATABASE = []; // This will now populate from YouTube dynamically

let state = {
  currentUser: null,
  isRegistering: false,
  currentView: "home",
  searchQuery: "phonk music", // Default search on load
  currentTrack: null,
  isPlaying: false,
  isDriftMode: false,
  playbackInterval: null,
  progressPercent: 0,
  likedTrackIds: [],
  recentTrackIds: []
};

// --- YouTube Player Setup ---
let ytPlayer;

// This function is automatically called by the YouTube script in your HTML
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
  // YT.PlayerState.PLAYING is 1
  if (event.data === 1) {
    state.isPlaying = true;
    nodes.playIcon.className = "fa-solid fa-pause";
  } else {
    state.isPlaying = false;
    nodes.playIcon.className = "fa-solid fa-play";
  }
}

// --- Target DOM Nodes ---
const nodes = {
  appViewport: document.getElementById("app-viewport"),
  navHome: document.getElementById("nav-home"),
  searchInput: document.getElementById("search-input"),
  userDisplay: document.getElementById("user-display"),
  feedHeading: document.getElementById("feed-heading"),
  tracksGrid: document.getElementById("tracks-grid"),
  playerThumb: document.getElementById("player-thumb"),
  playerTitle: document.getElementById("player-title"),
  playerProducer: document.getElementById("player-producer"),
  playerPlayBtn: document.getElementById("player-play-btn"),
  playIcon: document.getElementById("play-icon"),
  playerProgress: document.getElementById("player-progress"),
  progressBarContainer: document.querySelector(".progress-bar")
};

document.addEventListener("DOMContentLoaded", () => {
  setupEventBindings();
  // Fetch initial tracks on load
  searchYouTube(state.searchQuery);
});

function setupEventBindings() {
  if (nodes.navHome) nodes.navHome.addEventListener("click", () => searchYouTube("phonk music"));

  // Using "keydown" for Enter key to save API Quota. 
  // Searching on every single letter typed will exhaust your free API key instantly.
  if (nodes.searchInput) {
    nodes.searchInput.addEventListener("keydown", (e) => {
      if (e.key === 'Enter') {
        state.searchQuery = e.target.value;
        searchYouTube(state.searchQuery);
      }
    });
  }

  if (nodes.playerPlayBtn) nodes.playerPlayBtn.addEventListener("click", togglePlaybackState);
  if (nodes.progressBarContainer) nodes.progressBarContainer.addEventListener("click", scrubPlaybackTimeline);
}

// --- YouTube API Data Fetching ---
async function searchYouTube(query) {
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
    nodes.tracksGrid.innerHTML = `<div style="color:red; padding: 20px;">Missing YouTube API Key on Line 2!</div>`;
    return;
  }

  nodes.feedHeading.textContent = `Searching: ${query}...`;
  nodes.tracksGrid.innerHTML = `<div style="color:var(--txt-dim); padding: 20px;">Fetching from YouTube...</div>`;

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("YouTube API Error:", data.error.message);
      nodes.tracksGrid.innerHTML = `<div style="color:red;">API Error: ${data.error.message}</div>`;
      return;
    }

    // Convert YouTube data into our Track format
    TRACKS_DATABASE = data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'"), // Clean up HTML entities
      producer: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url,
      badge: "YT"
    }));

    nodes.feedHeading.textContent = "Search Results";
    renderTrackWorkspace();

  } catch (error) {
    console.error("Failed to fetch tracks:", error);
    nodes.tracksGrid.innerHTML = `<div style="color:var(--txt-dim);">Network error occurred.</div>`;
  }
}

// --- Render UI ---
function renderTrackWorkspace() {
  if (!nodes.tracksGrid) return;
  nodes.tracksGrid.innerHTML = "";

  TRACKS_DATABASE.forEach(track => {
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
      <p>${track.producer}</p>
    `;

    card.addEventListener("click", () => selectAndPlayTrack(track));
    nodes.tracksGrid.appendChild(card);
  });
}

// --- Live Audio Deck Controller ---
function selectAndPlayTrack(track) {
  if (state.currentTrack?.id === track.id) {
    togglePlaybackState();
    return;
  }

  state.currentTrack = track;
  state.progressPercent = 0;

  // Update UI
  if (nodes.playerThumb) nodes.playerThumb.src = track.thumbnail;
  if (nodes.playerTitle) nodes.playerTitle.textContent = track.title;
  if (nodes.playerProducer) nodes.playerProducer.textContent = track.producer;

  // Load into YouTube Player and Play
  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(track.id);
  }
  
  startProgressTracker();
  renderTrackWorkspace(); // Re-render to show correct play/pause icon on card
}

function togglePlaybackState() {
  if (!state.currentTrack || !ytPlayer) return;

  if (state.isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

// Tracks real progress from the YouTube API
function startProgressTracker() {
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
  }, 500);
}

function scrubPlaybackTimeline(e) {
  if (!state.currentTrack || !ytPlayer || !nodes.progressBarContainer) return;
  
  const rect = nodes.progressBarContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickPercent = clickX / rect.width;
  
  const total = ytPlayer.getDuration();
  if (total > 0) {
    const newTime = clickPercent * total;
    ytPlayer.seekTo(newTime, true);
    state.progressPercent = clickPercent * 100;
    if (nodes.playerProgress) nodes.playerProgress.style.width = `${state.progressPercent}%`;
  }
}
