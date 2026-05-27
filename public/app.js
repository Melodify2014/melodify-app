// 1. Asynchronously fetch the official YouTube script components
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '100%',
        videoId: 'dQw4w9WgXcQ', // Default video fallback
        playerVars: {
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': () => console.log("YouTube API client handshake established cleanly.")
        }
    });
}

// 2. Fetch tracks securely from the /feed route configuration namespace
async function bootstrapApplicationFeed() {
    const statusText = document.getElementById('status-node');
    try {
        // FIXED PATH: Points to our Express routing endpoint structure mapping
        const response = await fetch('/feed/tracks');
        if (!response.ok) throw new Error("Server communication drop.");
        
        const data = await response.json();
        if (statusText) statusText.style.display = 'none'; // Clear out message indicator
        console.log("Database catalog items mounted:", data);
    } catch (err) {
        console.error("Interface execution track sync dropped:", err.message);
        if (statusText) statusText.innerText = "Database tracks currently offline.";
    }
}

document.addEventListener('DOMContentLoaded', bootstrapApplicationFeed);
