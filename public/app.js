// Load the YouTube Frame asset logic asynchronously
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let player;
let isPlayerReady = false;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '1',
        width: '1',
        videoId: 'dQw4w9WgXcQ', // Initial default stream track hook
        playerVars: {
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin,
            'controls': 0,
            'disablekb': 1
        },
        events: {
            'onReady': () => {
                isPlayerReady = true;
                console.log("Audio pipeline initialized securely.");
                document.getElementById('player-title').innerText = "FLY (Audio Feed)";
                document.getElementById('player-artist').innerText = "CG5";
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    const disk = document.getElementById('disk-element');
    if (event.data === YT.PlayerState.PLAYING) {
        if (disk) disk.classList.add('spinning');
    } else {
        if (disk) disk.classList.remove('spinning');
    }
}

// Attach UI Event controllers
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

    // Load available songs from stream registry routes
    fetchTracks();
});

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
                item.addEventListener('click', () => {
                    if (isPlayerReady && player) {
                        player.loadVideoById(track.youtubeId);
                        document.getElementById('player-title').innerText = track.title;
                        document.getElementById('player-artist').innerText = track.producer;
                    }
                });
                container.appendChild(item);
            });
        }
    } catch (err) {
        if (container) container.innerHTML = '<p class="gray-text">Failed to fetch dynamic tracks items.</p>';
    }
}
