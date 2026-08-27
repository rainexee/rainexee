

const fs = require("fs");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error("Missing Spotify environment variables.");
    process.exit(1);
}

async function getAccessToken() {
    const response = await fetch(
        "https://accounts.spotify.com/api/token",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded",

                Authorization:
                    "Basic " +
                    Buffer.from(
                        `${CLIENT_ID}:${CLIENT_SECRET}`
                    ).toString("base64")
            },

            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: REFRESH_TOKEN
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(data);
        throw new Error("Failed to refresh Spotify token.");
    }

    return data.access_token;
}

async function spotifyRequest(endpoint, accessToken) {
    const response = await fetch(
        `https://api.spotify.com/v1${endpoint}`,
        {
            headers: {
                Authorization:
                    `Bearer ${accessToken}`
            }
        }
    );

    if (response.status === 204) {
        return null;
    }

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

async function getAlbumArt(url) {
    if (!url) {
        return null;
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.log("Could not download album artwork.");
            return null;
        }

        const buffer = Buffer.from(
            await response.arrayBuffer()
        );

        return buffer.toString("base64");

    } catch (error) {
        console.log(
            "Album artwork download failed:",
            error.message
        );

        return null;
    }
}

function escapeXml(text = "") {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function truncate(text, length) {
    return text.length > length
        ? text.slice(0, length - 1) + "..."
        : text;
}

function generateSvg(
    track,
    isPlaying,
    albumArt
) {

    const title = escapeXml(
        truncate(track.name, 38)
    );

    const artist = escapeXml(
        truncate(
            track.artists
                .map(artist => artist.name)
                .join(", "),
            45
        )
    );

    const status = isPlaying
        ? "NOW PLAYING"
        : "LAST PLAYED";

    const image = albumArt
        ? `
        <image
            href="data:image/jpeg;base64,${albumArt}"
            x="15"
            y="15"
            width="120"
            height="120"
            preserveAspectRatio="xMidYMid slice"
        />
        `
        : `
        <rect
            x="15"
            y="15"
            width="120"
            height="120"
            fill="#222222"
        />

        <text
            x="75"
            y="82"
            text-anchor="middle"
            fill="#777777"
            font-family="monospace"
            font-size="12"
        >
            NO ART
        </text>
        `;

    return `
<svg
    width="500"
    height="150"
    viewBox="0 0 500 150"
    xmlns="http://www.w3.org/2000/svg"
>

    <rect
        width="500"
        height="150"
        rx="12"
        fill="#111111"
    />

    ${image}

    <text
        x="160"
        y="40"
        fill="#777777"
        font-family="monospace"
        font-size="12"
        letter-spacing="2"
    >
        ▶ ${status}
    </text>

    <text
        x="160"
        y="75"
        fill="#ffffff"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="bold"
    >
        ${title}
    </text>

    <text
        x="160"
        y="105"
        fill="#aaaaaa"
        font-family="Arial, sans-serif"
        font-size="15"
    >
        ${artist}
    </text>

    <rect
        x="160"
        y="122"
        width="300"
        height="4"
        rx="2"
        fill="#333333"
    />

    <rect
        x="160"
        y="122"
        width="${isPlaying ? 180 : 300}"
        height="4"
        rx="2"
        fill="#ffffff"
    />

</svg>
`;
}

async function main() {

    const accessToken =
        await getAccessToken();

    let data =
        await spotifyRequest(
            "/me/player/currently-playing",
            accessToken
        );

    let track;
    let isPlaying = false;

    if (data?.item) {

        track = data.item;
        isPlaying = true;

    } else {

        const recent =
            await spotifyRequest(
                "/me/player/recently-played?limit=1",
                accessToken
            );

        track =
            recent.items?.[0]?.track;
    }

    if (!track) {

        track = {
            name: "nothing playing",

            artists: [
                {
                    name: "probably debugging"
                }
            ],

            album: {
                images: []
            }
        };
    }

    console.log(
        `${isPlaying ? "Now playing" : "Last played"}:`,
        track.name
    );

    const albumUrl =
        track.album?.images?.[0]?.url;

    console.log(
        "Album artwork:",
        albumUrl || "none"
    );

    const albumArt =
        await getAlbumArt(albumUrl);

    console.log(
        "Album artwork embedded:",
        albumArt ? "YES" : "NO"
    );

    const svg =
        generateSvg(
            track,
            isPlaying,
            albumArt
        );

    fs.mkdirSync(
        "assets",
        {
            recursive: true
        }
    );

    fs.writeFileSync(
        "assets/spotify-now-playing.svg",
        svg.trim()
    );

    console.log(
        "Spotify card generated successfully."
    );
}

main().catch(error => {

    console.error(error);

    process.exit(1);
});
