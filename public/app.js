// --- Complete Catalog of Phonk Audio & Media Metadata ---
const TRACKS_DATABASE = [
  {
    id: "t1",
    title: "METAMORPHOSIS",
    producer: "INTERWORLD",
    category: "music",
    thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=250",
    badge: "classic"
  },
  {
    id: "t2",
    title: "MURDER IN MY MIND",
    producer: "KORDHELL",
    category: "music",
    thumbnail: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=250",
    badge: "drift"
  },
  {
    id: "t3",
    title: "RAVE",
    producer: "Dxrk",
    category: "music",
    thumbnail: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=250",
    badge: "popular"
  },
  {
    id: "t4",
    title: "CLOSE EYES",
    producer: "DVRST",
    category: "music",
    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=250",
    badge: "atmospheric"
  },
  {
    id: "t5",
    title: "GIGA CHAD THEME",
    producer: "g3ox_em",
    category: "all",
    thumbnail: "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=250",
    badge: "meme"
  },
  {
    id: "t6",
    title: "AUTOMOTIVE",
    producer: "Phonk Killer",
    category: "music",
    thumbnail: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?q=80&w=250",
    badge: "cowbell"
  }
];

// --- Functional State Parameters ---
let state = {
  currentUser: null,
  isRegistering: false,
  currentView: "home",      // Options: home, following, recent, liked
  filterCategory: "all",    // Options: all, music
  searchQuery: "",
  currentTrack: null,
  isPlaying: false,
  isDriftMode: false,
  playbackInterval: null,
  progressPercent: 0,
  likedTrackIds: [],
  recentTrackIds: []
};

// --- Target DOM Node Extraction Map ---
const nodes = {
  appViewport: document.getElementById("app-viewport"),
  navHome: document.getElementById("nav-home"),
  navFollowing: document.getElementById("nav-following"),
  navRecent: document.getElementById("nav-recent"),
  navLiked: document.getElementById("nav-liked"),
  searchInput: document.getElementById("search-input"),
  userDisplay: document.getElementById("user-display"),
  logoutBtn: document.getElementById("logout-btn"),
  feedHeading: document.getElementById("feed-heading"),
  filterAll: document.getElementById("filter-all"),
  filterMusic: document.getElementById("filter-music"),
  tracksGrid: document.getElementById("tracks-grid"),
  playerThumb: document.getElementById("player-thumb"),
  playerTitle: document.getElementById("player-title"),
  playerProducer: document.getElementById("player-producer"),
  playerDriftBtn: document.getElementById("player-drift-btn"),
  playerPlayBtn: document.getElementById("player-play-btn"),
  playIcon: document.getElementById("play-icon"),
  playerLikeBtn: document.getElementById("player-like-btn"),
  likeIcon: document.getElementById("like-icon"),
  playerProgress: document.getElementById("player-progress"),
  progressBarContainer: document.querySelector(".progress-bar"),
  authModal: document.getElementById("auth-modal"),
  authTitle: document.getElementById("auth-title"),
  authError: document.getElementById("auth-error"),
  authForm: document.getElementById("auth-form"),
  authUsername: document.getElementById("auth-username"),
  authPassword: document.getElementById("auth-password"),
  authSubmitBtn: document.getElementById("auth-submit-btn"),
  authToggleTextLabel: document.getElementById("auth-toggle-text-label"),
  authToggleBtn: document.getElementById("auth-toggle-btn")
};

// --- Execution Lifecycle Start ---
document.addEventListener("DOMContentLoaded", () => {
  setupEventBindings();
  checkAuthenticationSession();
});

function setupEventBindings() {
  // Sidebar Navigators
  nodes.navHome.addEventListener("click", () => switchView("home", nodes.navHome));
  nodes.navFollowing.addEventListener("click", () => switchView("following", nodes.navFollowing));
  nodes.navRecent.addEventListener("click", () => switchView("recent", nodes.navRecent));
  nodes.navLiked.addEventListener("click", () => switchView("liked", nodes.navLiked));

  // Category Selector Tabs
  nodes.filterAll.addEventListener("click", () => setCategoryFilter("all"));
  nodes.filterMusic.addEventListener("click", () => setCategoryFilter("music"));

  // Search Input Query Actions
  nodes.searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderTrackWorkspace();
  });

  // Media Playback Deck Group
  nodes.playerPlayBtn.addEventListener("click", togglePlaybackState);
  nodes.playerLikeBtn.addEventListener("click", toggleCurrentTrackLike);
  nodes.playerDriftBtn.addEventListener("click", toggleDriftOverdrive);
  
  // Interactive Timeline scrubbing simulation
  nodes.progressBarContainer.addEventListener("click", scrubPlaybackTimeline);

  // Authenticated Profile Systems
  nodes.logoutBtn.addEventListener("click", executeAccountLogout);
  nodes.authToggleBtn.addEventListener("click", toggleAuthFormIntent);
  nodes.authForm.addEventListener("submit", processAuthFormSubmission);
}

// --- Session Checking and Verification ---
function checkAuthenticationSession() {
  const activeUser = localStorage.getItem("melodify_session");
  if (activeUser) {
    state.currentUser = activeUser;
    nodes.userDisplay.textContent = `⚡ ${activeUser.toUpperCase()}`;
    nodes.authModal.style.display = "none";
    
    // Extract localized user preferences arrays from dynamic local stores
    state.likedTrackIds = JSON.parse(localStorage.getItem(`liked_${state.currentUser}`)) || [];
    state.recentTrackIds = JSON.parse(localStorage.getItem(`recent_${state.currentUser}`)) || [];
    
    renderTrackWorkspace();
  } else {
    nodes.authModal.style.display = "flex";
    nodes.userDisplay.textContent = "Connecting...";
  }
}

// --- Core Auth Form Process Engine ---
function toggleAuthFormIntent(e) {
  e.preventDefault();
  state.isRegistering = !state.isRegistering;
  nodes.authError.style.display = "none";
  nodes.authForm.reset();

  if (state.isRegistering) {
    nodes.authTitle.textContent = "Create Melodify Account";
    nodes.authSubmitBtn.textContent = "Sign Up";
    nodes.authToggleTextLabel.textContent = "Already a listener?";
    nodes.authToggleBtn.textContent = "Sign in here";
  } else {
    nodes.authTitle.textContent = "Sign In to Melodify";
    nodes.authSubmitBtn.textContent = "Login";
    nodes.authToggleTextLabel.textContent = "New listener?";
    nodes.authToggleBtn.textContent = "Create an account";
  }
}

function processAuthFormSubmission(e) {
  e.preventDefault();
  const username = nodes.authUsername.value.trim();
  const password = nodes.authPassword.value;

  if (!username || !password) return;

  const userRegistry = JSON.parse(localStorage.getItem("melodify_users")) || {};

  if (state.isRegistering) {
    if (userRegistry[username]) {
      showAuthError("Username is claimed by another producer.");
      return;
    }
    userRegistry[username] = password;
    localStorage.setItem("melodify_users", JSON.stringify(userRegistry));
  } else {
    if (!userRegistry[username] || userRegistry[username] !== password) {
      showAuthError("Invalid username or access code credentials.");
      return;
    }
  }

  localStorage.setItem("melodify_session", username);
  checkAuthenticationSession();
}

function showAuthError(message) {
  nodes.authError.textContent = message;
  nodes.authError.style.display = "block";
}

function executeAccountLogout() {
  stopPlaybackEngine();
  if (state.isDriftMode) toggleDriftOverdrive();
  localStorage.removeItem("melodify_session");
  state.currentUser = null;
  checkAuthenticationSession();
}

// --- Navigation Pipeline Functions ---
function switchView(targetView, targetedNode) {
  document.querySelectorAll(".sidebar .menu-item").forEach(btn => btn.classList.remove("active"));
  targetedNode.classList.add("active");

  state.currentView = targetView;
  
  // Assign custom strings updating the feed headers base title parameters
  const headings = {
    home: "Phonk Feed",
    following: "Following Channels",
    recent: "Recently Played",
    liked: "Your Underground Stash"
  };
  nodes.feedHeading.textContent = headings[targetView] || "Tracks";
  renderTrackWorkspace();
}

function setCategoryFilter(category) {
  nodes.filterAll.classList.remove("active");
  nodes.filterMusic.classList.remove("active");

  if (category === "music") {
    nodes.filterMusic.classList.add("active");
  } else {
    nodes.filterAll.classList.add("active");
  }

  state.filterCategory = category;
  renderTrackWorkspace();
}

// --- Dynamic Track Workspace Render Pass ---
function renderTrackWorkspace() {
  nodes.tracksGrid.innerHTML = "";

  // Apply sequential pipeline operations reducing down catalog parameters 
  let tracks = TRACKS_DATABASE.filter(track => {
    // 1. Structural view filters
    if (state.currentView === "liked") return state.likedTrackIds.includes(track.id);
    if (state.currentView === "recent") return state.recentTrackIds.includes(track.id);
    return true; 
  });

  // 2. Tab layout categorization pass
  if (state.filterCategory === "music") {
    tracks = tracks.filter(t => t.category === "music");
  }

  // 3. Sub-string match input evaluation queries
  if (state.searchQuery) {
    tracks = tracks.filter(t => 
      t.title.toLowerCase().includes(state.searchQuery) || 
      t.producer.toLowerCase().includes(state.searchQuery)
    );
  }

  if (tracks.length === 0) {
    nodes.tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--txt-dim); padding-top: 40px; font-size: 14px;">No tracks found matching criteria inside this signal channel.</div>`;
    return;
  }

  tracks.forEach(track => {
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
    nodes.tracksGrid.add(card);
  });
}

// --- Dynamic Audio Deck Controller Simulations ---
function selectAndPlayTrack(track) {
  if (state.currentTrack?.id === track.id) {
    togglePlaybackState();
    return;
  }

  stopPlaybackEngine();
  state.currentTrack = track;
  state.progressPercent = 0;

  // Track dynamic list memory pushes mapping matching structural operations
  state.recentTrackIds = [track.id, ...state.recentTrackIds.filter(id => id !== track.id)].slice(0, 15);
  localStorage.setItem(`recent_${state.currentUser}`, JSON.stringify(state.recentTrackIds));

  // Render deck updates
  nodes.playerThumb.src = track.thumbnail;
  nodes.playerTitle.textContent = track.title;
  nodes.playerProducer.textContent = track.producer;

  updateLikeButtonUIState();
  startPlaybackEngine();
  renderTrackWorkspace();
}

function togglePlaybackState() {
  if (!state.currentTrack) {
    if (TRACKS_DATABASE.length > 0) selectAndPlayTrack(TRACKS_DATABASE[0]);
    return;
  }

  if (state.isPlaying) {
    pausePlaybackEngine();
  } else {
    startPlaybackEngine();
  }
}

function startPlaybackEngine() {
  state.isPlaying = true;
  nodes.playIcon.className = "fa-solid fa-pause";
  
  state.playbackInterval = setInterval(() => {
    state.progressPercent += state.isDriftMode ? 1.4 : 0.8; // Drift acceleration mods
    if (state.progressPercent >= 100) {
      state.progressPercent = 0;
    }
    nodes.playerProgress.style.width = `${state.progressPercent}%`;
  }, 250);
}

function pausePlaybackEngine() {
  state.isPlaying = false;
  nodes.playIcon.className = "fa-solid fa-play";
  if (state.playbackInterval) clearInterval(state.playbackInterval);
}

function stopPlaybackEngine() {
  pausePlaybackEngine();
  nodes.playerProgress.style.width = "0%";
  state.progressPercent = 0;
}

function scrubPlaybackTimeline(e) {
  if (!state.currentTrack) return;
  const rect = nodes.progressBarContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  state.progressPercent = Math.min(100, Math.max(0, (clickX / rect.width) * 100));
  nodes.playerProgress.style.width = `${state.progressPercent}%`;
}

function toggleCurrentTrackLike() {
  if (!state.currentTrack) return;
  const trackId = state.currentTrack.id;

  if (state.likedTrackIds.includes(trackId)) {
    state.likedTrackIds = state.likedTrackIds.filter(id => id !== trackId);
  } else {
    state.likedTrackIds.push(trackId);
  }

  localStorage.setItem(`liked_${state.currentUser}`, JSON.stringify(state.likedTrackIds));
  updateLikeButtonUIState();
  if (state.currentView === "liked") renderTrackWorkspace();
}

function updateLikeButtonUIState() {
  if (state.currentTrack && state.likedTrackIds.includes(state.currentTrack.id)) {
    nodes.playerLikeBtn.classList.add("liked");
    nodes.likeIcon.className = "fa-solid fa-heart";
  } else {
    nodes.playerLikeBtn.classList.remove("liked");
    nodes.likeIcon.className = "fa-regular fa-heart";
  }
}

// --- The Drift Mode Modifier Loop ---
function toggleDriftOverdrive() {
  state.isDriftMode = !state.isDriftMode;
  
  if (state.isDriftMode) {
    nodes.appViewport.classList.add("drift-active");
    nodes.playerDriftBtn.style.color = "var(--accent-drift)";
  } else {
    nodes.appViewport.classList.remove("drift-active");
    nodes.playerDriftBtn.style.color = "";
  }
}
