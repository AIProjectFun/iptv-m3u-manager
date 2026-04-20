# IPTV Manager

A lightweight, self-hosted Node.js web app for managing IPTV streams from any **Xtream Codes** compatible provider. Browse your full channel library, hand-pick streams across Live TV, Movies, and Series, generate custom M3U playlists, and edit existing M3U files — all from a clean dark-themed browser interface.

## Features

- 🔌 **Connect** to any Xtream Codes IPTV provider with your host, username, and password
- 📥 **Download & cache** your full library locally (Live TV, Movies, Series) so browsing is instant
- 🔍 **Global search** across all streams without having to browse category by category
- ⚡ **Quick filters** — one-click to show only US channels or English movies
- ✅ **Pick and choose** streams across multiple categories and tabs, then export a single M3U
- ✏️ **M3U Editor** — open any existing `.m3u` file, rename channels, assign channel numbers, reorder via drag-and-drop, delete entries, and save as a new file
- 💾 **Saved libraries** — cached libraries are saved to disk and can be reopened instantly without re-downloading
- 🌑 Clean dark UI, no dependencies beyond Node.js

## Requirements

- [Node.js](https://nodejs.org/) v16 or higher
- An active Xtream Codes IPTV subscription (host URL, username, password)

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/AIProjectFun/iptv-m3u-manager.git
cd iptv-manager

# 2. Install dependencies
npm install

# 3. Start the server
node server.js
```

Then open your browser and go to:

```
http://localhost:4446
```

## How to Use

### Connecting & Building a Playlist

1. Enter your IPTV provider's **Host URL**, **Username**, and **Password** and click **Connect & Download**
2. The app will automatically download your full channel library and save it to disk
3. Browse **Live TV**, **Movies**, or **Series** tabs — use the sidebar to pick categories or use the **global search bar** to search across everything at once
4. Check the streams you want — selected count appears in the bottom bar
5. Click **Download M3U** to generate and save your custom playlist file

### Reopening a Saved Library

On the home page, your previously downloaded libraries appear under **Saved Libraries**. Click **Open Library** to jump straight back in without re-downloading anything.

### Editing an Existing M3U File

1. On the home page, click **Browse for .m3u…** under **Edit M3U Playlist**
2. Select any `.m3u` or `.m3u8` file from your computer
3. In the editor you can:
   - ✏️ Click any channel name to rename it
   - 🔢 Type a channel number in the `#` box
   - ⠿ Drag rows by the handle on the left to reorder
   - ✕ Hover a row and click **✕** to delete it
   - 🔍 Use the search bar to filter while editing
   - ⟳ Click **Auto-number** to assign sequential numbers to all channels
4. Enter a filename and click **Save M3U** to download the edited playlist

## Project Structure

```
iptv-manager/
├── server.js          # Express backend — API routes and M3U parsing
├── package.json
└── public/
    └── index.html     # Full single-page frontend (vanilla JS, no framework)
```

## Notes

- The app runs entirely on your local machine — no data is sent anywhere except directly to your IPTV provider
- Downloaded library cache files are stored in the project folder as `.json` files — these contain your credentials and are excluded from git via `.gitignore`
- The server runs on port **4446** by default

## License

MIT
