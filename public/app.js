// Load the YouTube Frame asset logic asynchronously
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let player;
let isPlayerReady = false;

// Triggered automatically when the script loads from YouTube's servers
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '1',
        width: '1',
        videoId: 'Hff7UzF4_lM', // Default startup track: METAMORPHOSIS
        playerVars: {
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin, // Crucial handshake fix
            'controls': 0,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log("Audio pipeline initialized securely.");
}

// Controls the turning animation on your spinning music icon
function onPlayerStateChange(event) {
    const disk = document.getElementById('disk-element');
    if (event.data === YT.PlayerState.PLAYING) {
        if (disk) disk.classList.add('spinning');
    } else {
        if (disk) disk.classList.remove('spinning');
    }
}

// Wire up your buttons and setup initial catalog items
document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (isPlayerReady && player) player.playVideo();
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (isPlayerReady && player) player.pauseVideo();
        });
    }

    fetchTracks();
});

// Grab your server music array
async function fetchTracks() {
    const container = document.getElementById('catalog-view');
    try {
        const response = await fetch('/feed/tracks');
        const tracks = await response.json();
        
        if (container) {
            container.innerHTML = '';
            tracks.forEach(track => {
                const item = document.createElement('div');
                item.className = 'track-item';
                item.innerHTML = `<strong>${track.title}</strong> — ${track.producer}`;
                
                // Track selector interaction click handler
                item.addEventListener('click', () => {
                    if (isPlayerReady && player) {
                        // Crucial Fix: Uses cueVideoById to load the video string safely without CORS issues
                        player.cueVideoById(track.youtubeId);
                        player.playVideo();
                        
                        // Update UI labels dynamically
                        document.getElementById('player-title').innerText = track.title;
                        document.getElementById('player-artist').innerText = track.producer;
                    }
                });
                container.appendChild(item);
            });
        }
    } catch (err) {
        console.error("Catalog track loading issue:", err.message);
    }
}
