# Lyric Sync

A small offline-friendly web app for learning song lyrics: import an MP3 and its
lyrics, tap out the timing while the song plays (karaoke-style), then loop any
single line or range of lines on repeat until you've memorized it.

No build step, no server, no external services — plain HTML/CSS/JS. Songs
(audio + synced timestamps) are stored locally in your browser via IndexedDB,
so they persist across reloads on the same device/browser.

## Running it

Just open `index.html` in a browser, or serve the folder with any static
file server for best compatibility, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## How to use it

1. **New Song** — pick an MP3 (or other audio file) and paste in the lyrics,
   one line per row. You can optionally import a previously exported
   `.sync.json` or a standard `.lrc` file to skip syncing.
2. **Sync Lyrics tab** — press Play, then tap **Space** (or the "Tap next
   line" button) exactly when each line starts singing. It automatically
   advances to the next line. Click a line's timestamp to fix it manually,
   or click the line text to jump playback there.
3. **Practice / Loop tab** — click a line to select it, or shift-click a
   second line to select a range. Hit **Loop selection** to play just that
   part on repeat, with a configurable gap between repeats, repeat count,
   and playback speed — perfect for drilling a tricky verse or chorus.
4. **Export** — download the synced lyrics (timestamps + text, no audio) as
   JSON to back up or share your sync work separately from the audio file.

Songs live in the sidebar library and can be renamed, reopened, or deleted at
any time.
