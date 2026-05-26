/**
 * Melodify Client Media Architecture Manager
 */
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = window.location.origin;
    let ytPlayerInstance = null;
    let currentlyPlayingButton = null;
    let activelyPlayingTrackCard = null;

    const tracksContainer = document.getElementById('tracks-container') || document.body;

    // Inject invisible core anchor for frame embedding mechanics
    const hiddenPlayerDiv = document.createElement('div');
    hiddenPlayerDiv.id = 'melodify-hidden-hardware-engine';
    hiddenPlayerDiv.style.display = 'none';
    document.body.appendChild(hiddenPlayerDiv);

    const ytScriptTag = document.createElement('script');
    ytScriptTag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(ytScriptTag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
        ytPlayerInstance = new YT.Player('melodify-hidden-hardware-engine', {
            height: '0', width: '0',
            playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1 },
            events: {
                'onStateChange': handleEngineStateChange,
                'onError': () => { if(currentlyPlayingButton) currentlyPlayingButton.textContent = '▶'; }
            }
        });
    };

    async function executeCatalogSynchronization(queryParameters = '') {
        try {
            tracksContainer.innerHTML = '<div class="loading-state">Synchronizing Matrices...</div>';
            const response = await fetch(`${API_URL}/api/tracks${queryParameters}`);
            const musicFeed = await response.json();
            tracksContainer.innerHTML = '';

            if (musicFeed.length === 0) {
                tracksContainer.innerHTML = '<div class="empty-state">No tracks found.</div>';
                return;
            }

            musicFeed.forEach(track => {
                const titleParsed = (track.title || 'Untitled Track').replace(/"/g, '&quot;');
                const producerParsed = (track.producer || 'Unknown Producer').replace(/"/g, '&quot;');
                const videoId = track.youtubeId || '';
                const fallbackThumb = 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=500&auto=format&fit=crop';

                const trackCardElement = `
                    <div class="track-card" data-youtube-id="${videoId}">
                        <div class="thumbnail-wrapper">
                            <img src="${track.thumbnail || fallbackThumb}" alt="${titleParsed}" class="track-thumb" onerror="this.onerror=null; this.src='${fallbackThumb}';" />
                            <button class="play-overlay-btn">▶</button>
                        </div>
                        <div class="track-details">
                            <h3 class="track-title">${titleParsed}</h3>
                            <p class="track-producer">${producerParsed}</p>
                        </div>
                    </div>
                `;
                tracksContainer.insertAdjacentHTML('beforeend', trackCardElement);
            });

            registerHardwareAudioInputTriggers();
        } catch (err) {
            tracksContainer.innerHTML = '<div class="error-state">Interface rendering error.</div>';
        }
    }

    function registerHardwareAudioInputTriggers() {
        const cards = tracksContainer.querySelectorAll('.track-card');
        cards.forEach(card => {
            const playBtn = card.querySelector('.play-overlay-btn');
            const targetVideoId = card.getAttribute('data-youtube-id');
            if (playBtn && targetVideoId) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMediaStream(targetVideoId, playBtn, card);
                });
            }
        });
    }

    function toggleMediaStream(videoId, clickedButton, cardElement) {
        if (!ytPlayerInstance || typeof ytPlayerInstance.loadVideoById !== 'function') return;

        if (currentlyPlayingButton === clickedButton) {
            const playerState = ytPlayerInstance.getPlayerState();
            if (playerState === YT.PlayerState.PLAYING) ytPlayerInstance.pauseVideo();
            else ytPlayerInstance.playVideo();
            return;
        }

        if (currentlyPlayingButton) currentlyPlayingButton.textContent = '▶';

        currentlyPlayingButton = clickedButton;
        activelyPlayingTrackCard = cardElement;
        clickedButton.textContent = '⏳';
        ytPlayerInstance.loadVideoById(videoId);
    }

    function handleEngineStateChange(event) {
        if (!currentlyPlayingButton) return;
        if (event.data === YT.PlayerState.PLAYING) currentlyPlayingButton.textContent = '⏸';
        else currentlyPlayingButton.textContent = '▶';
    }

    executeCatalogSynchronization();
});
