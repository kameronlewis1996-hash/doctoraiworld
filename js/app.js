// Lyric Sync — vanilla JS app. No build step, no external dependencies.
// Persists songs (audio blob + synced lyric timestamps) in IndexedDB so
// they survive page reloads.

(() => {
  'use strict';

  // ---------- IndexedDB helpers ----------

  const DB_NAME = 'lyric-sync-db';
  const STORE = 'songs';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbPut(song) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(song);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- Time helpers ----------

  function formatTime(sec) {
    if (sec == null || isNaN(sec)) return '--:--';
    // Round to the nearest tenth up front so the rounding toFixed(1) does
    // internally can't push the seconds portion to "60.0" (e.g. a raw
    // 59.96 would otherwise render as "1:60.0" instead of "2:00.0").
    const rounded = Math.round(Math.max(0, sec) * 10) / 10;
    const m = Math.floor(rounded / 60);
    const s = (rounded - m * 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  }

  // Accepts "1:23.4", "83.4", "83"
  function parseTime(str) {
    str = str.trim();
    if (!str) return null;
    if (str.includes(':')) {
      const [m, s] = str.split(':');
      const mins = parseFloat(m);
      const secs = parseFloat(s);
      if (isNaN(mins) || isNaN(secs)) return null;
      return mins * 60 + secs;
    }
    const v = parseFloat(str);
    return isNaN(v) ? null : v;
  }

  // ---------- App state ----------

  const state = {
    songs: [],        // metadata list {id, title, createdAt}
    currentSong: null, // full record {id, title, lyrics:[{time,text}], audioBlob, createdAt}
    audio: new Audio(),
    audioUrl: null,
    syncPointer: 0,   // index of next unsynced line
    loopRange: null,  // { start, end } in seconds — the section to loop
    looping: false,
    loopTimer: null,
    loopRepeatsLeft: 0,
  };

  // ---------- DOM refs ----------

  const el = (id) => document.getElementById(id);
  const songListEl = el('songList');
  const emptyState = el('emptyState');
  const setupPanel = el('setupPanel');
  const workspace = el('workspace');

  const titleInput = el('titleInput');
  const audioInput = el('audioInput');
  const lyricsInput = el('lyricsInput');
  const lrcInput = el('lrcInput');

  const songTitleEl = el('songTitle');
  const songMetaEl = el('songMeta');

  const playBtn = el('playBtn');
  const curTimeEl = el('curTime');
  const durTimeEl = el('durTime');
  const seekBar = el('seekBar');
  const speedSelect = el('speedSelect');

  const syncList = el('syncList');
  const tapBtn = el('tapBtn');
  const autoSyncBtn = el('autoSyncBtn');
  const resetSyncBtn = el('resetSyncBtn');
  const syncProgress = el('syncProgress');

  const practiceList = el('practiceList');
  const loopBtn = el('loopBtn');
  const stopLoopBtn = el('stopLoopBtn');
  const gapSelect = el('gapSelect');
  const repeatSelect = el('repeatSelect');
  const rangeTrack = el('rangeTrack');
  const rangeFill = el('rangeFill');
  const rangeHandleStart = el('rangeHandleStart');
  const rangeHandleEnd = el('rangeHandleEnd');
  const rangeStartLabel = el('rangeStartLabel');
  const rangeEndLabel = el('rangeEndLabel');
  const loopStatus = el('loopStatus');

  // ---------- View switching ----------

  function showView(name) {
    emptyState.classList.toggle('hidden', name !== 'empty');
    setupPanel.classList.toggle('hidden', name !== 'setup');
    workspace.classList.toggle('hidden', name !== 'workspace');
  }

  // ---------- Library ----------

  async function refreshLibrary() {
    let all;
    try {
      all = await dbGetAll();
    } catch (err) {
      console.error('Could not read song library from storage', err);
      all = [];
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    // Drop the audio blob from the sidebar's in-memory snapshot — only
    // title/lyrics/createdAt are ever read from state.songs, and holding
    // every song's full audio in memory just to render a list scales badly
    // with library size.
    state.songs = all.map(({ audioBlob, ...meta }) => meta);
    renderLibrary();
  }

  function renderLibrary() {
    songListEl.innerHTML = '';
    if (state.songs.length === 0) {
      songListEl.innerHTML = '<p class="empty-hint">No songs yet — import an MP3 and its lyrics to get started.</p>';
      return;
    }
    for (const meta of state.songs) {
      const item = document.createElement('div');
      const isCurrent = state.currentSong && state.currentSong.id === meta.id;
      item.className = 'song-item' + (isCurrent ? ' active' : '');
      // Use the live in-memory lyrics for the open song, since state.songs
      // holds a snapshot fetched at load time that mutations don't touch.
      const lyrics = isCurrent ? state.currentSong.lyrics : (meta.lyrics || []);
      const syncedCount = lyrics.filter(l => l.time != null).length;
      const total = lyrics.length;
      item.innerHTML = `${escapeHtml(meta.title)}<span class="song-sub">${syncedCount}/${total} synced</span>`;
      item.addEventListener('click', () => loadSong(meta.id));
      songListEl.appendChild(item);
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- Create song ----------

  el('newSongBtn').addEventListener('click', openSetup);
  el('emptyNewSongBtn').addEventListener('click', openSetup);
  el('cancelSetupBtn').addEventListener('click', () => {
    showView(state.currentSong ? 'workspace' : 'empty');
  });

  const audioFileBtn = el('audioFileBtn');
  const lrcFileBtn = el('lrcFileBtn');
  const audioFileBtnDefault = audioFileBtn.textContent;
  const lrcFileBtnDefault = lrcFileBtn.textContent;

  // Hidden <input type="file"> elements are driven from these buttons —
  // styling a file input directly makes it unreliable to tap on mobile.
  audioFileBtn.addEventListener('click', () => audioInput.click());
  lrcFileBtn.addEventListener('click', () => lrcInput.click());
  audioInput.addEventListener('change', () => {
    const f = audioInput.files[0];
    audioFileBtn.textContent = f ? '🎵 ' + f.name : audioFileBtnDefault;
  });
  lrcInput.addEventListener('change', () => {
    const f = lrcInput.files[0];
    lrcFileBtn.textContent = f ? '📄 ' + f.name : lrcFileBtnDefault;
  });

  function openSetup() {
    titleInput.value = '';
    audioInput.value = '';
    lyricsInput.value = '';
    lrcInput.value = '';
    audioFileBtn.textContent = audioFileBtnDefault;
    lrcFileBtn.textContent = lrcFileBtnDefault;
    showView('setup');
  }

  el('createSongBtn').addEventListener('click', async () => {
    const title = titleInput.value.trim() || 'Untitled song';
    const file = audioInput.files[0];
    if (!file) {
      alert('Please choose an MP3 (or other audio) file to import.');
      return;
    }
    const rawLyrics = lyricsInput.value;
    let lyrics = rawLyrics
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(text => ({ time: null, text }));

    // Optional pre-synced import (.lrc or exported .json)
    const lrcFile = lrcInput.files[0];
    if (lrcFile) {
      const text = await lrcFile.text();
      const imported = parseImportedSync(text, lrcFile.name);
      if (imported && imported.length) lyrics = imported;
    }

    if (lyrics.length === 0) {
      alert('Please paste in the lyrics (or import a synced file) before creating the song.');
      return;
    }

    const song = {
      id: 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title,
      lyrics,
      audioBlob: file,
      audioName: file.name,
      createdAt: Date.now(),
    };

    const createBtn = el('createSongBtn');
    const originalLabel = createBtn.textContent;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
    try {
      await dbPut(song);
      await refreshLibrary();
      await loadSong(song.id);
    } catch (err) {
      console.error('Could not save song to browser storage', err);
      alert(
        "Couldn't save this song to your browser's storage, so it won't be here next time you open " +
        "this page. This usually happens in Private/Incognito browsing, or when a browser blocks local " +
        "storage. You can still use it for now — it just won't persist.\n\n(" + (err && err.message ? err.message : err) + ")"
      );
      state.songs = [song, ...state.songs];
      await openSong(song);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = originalLabel;
    }
  });

  function parseImportedSync(text, filename) {
    if (filename.endsWith('.json')) {
      try {
        const data = JSON.parse(text);
        const lyrics = data.lyrics || data;
        if (Array.isArray(lyrics)) {
          return lyrics.map(l => ({ time: typeof l.time === 'number' ? l.time : null, text: l.text || '' }));
        }
      } catch (e) { /* fall through */ }
      return null;
    }
    // Basic .lrc parser: [mm:ss.xx]lyric text — a line can carry more than
    // one leading time tag (LRC's standard way to repeat a line, e.g. a
    // chorus: "[00:12.00][00:45.00]Chorus line"), so pull out every tag on
    // the line rather than just the first, and emit one entry per tag.
    const lines = text.split('\n');
    const out = [];
    const lrcTagRe = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    for (const line of lines) {
      const tags = [...line.matchAll(lrcTagRe)];
      if (tags.length === 0) continue;
      const t = line.replace(lrcTagRe, '').trim();
      if (!t) continue;
      for (const m of tags) {
        const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
        out.push({ time, text: t });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  // ---------- Load / manage song ----------

  async function loadSong(id) {
    const song = await dbGet(id);
    if (!song) return;
    await openSong(song);
  }

  async function openSong(song) {
    stopLoop();
    state.currentSong = song;
    state.syncPointer = song.lyrics.findIndex(l => l.time == null);
    if (state.syncPointer === -1) state.syncPointer = song.lyrics.length;
    state.loopRange = null;

    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(song.audioBlob);
    state.audio.src = state.audioUrl;
    state.audio.playbackRate = parseFloat(speedSelect.value);

    songTitleEl.textContent = song.title;
    songMetaEl.textContent = song.audioName || '';

    renderLibrary();
    renderSyncList();
    renderPracticeList();
    renderRangePicker();
    updateLoopButtonState();
    showView('workspace');
  }

  el('renameBtn').addEventListener('click', async () => {
    if (!state.currentSong) return;
    const next = prompt('Song title:', state.currentSong.title);
    if (next && next.trim()) {
      state.currentSong.title = next.trim();
      songTitleEl.textContent = state.currentSong.title;
      await dbPut(state.currentSong);
      await refreshLibrary();
    }
  });

  el('deleteSongBtn').addEventListener('click', async () => {
    if (!state.currentSong) return;
    if (!confirm(`Delete "${state.currentSong.title}"? This can't be undone.`)) return;
    stopLoop();
    await dbDelete(state.currentSong.id);
    state.currentSong = null;
    state.audio.pause();
    await refreshLibrary();
    showView('empty');
  });

  el('exportBtn').addEventListener('click', () => {
    if (!state.currentSong) return;
    const data = { title: state.currentSong.title, lyrics: state.currentSong.lyrics };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const filename = `${state.currentSong.title.replace(/[^a-z0-9]+/gi, '_')}.sync.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  let storageWarned = false;

  async function persistCurrentSong() {
    if (!state.currentSong) return;
    try {
      await dbPut(state.currentSong);
    } catch (err) {
      console.error('Could not persist song', err);
      if (!storageWarned) {
        storageWarned = true;
        alert("Heads up: this browser isn't letting the app save your progress here (often due to " +
          "Private/Incognito browsing). Your work will keep going for this session but won't be saved " +
          "once you leave the page.");
      }
    }
  }

  // ---------- Player controls ----------

  playBtn.addEventListener('click', togglePlay);

  function togglePlay() {
    if (!state.currentSong) return;
    if (state.audio.paused) state.audio.play();
    else state.audio.pause();
  }

  state.audio.addEventListener('play', () => { playBtn.textContent = '❚❚'; document.body.classList.add('is-playing'); });
  state.audio.addEventListener('pause', () => { playBtn.textContent = '▶'; document.body.classList.remove('is-playing'); });

  state.audio.addEventListener('loadedmetadata', () => {
    seekBar.max = state.audio.duration;
    durTimeEl.textContent = formatTime(state.audio.duration);
    // Default the loop range to the whole song once its length is known,
    // so the slider is immediately usable.
    state.loopRange = { start: 0, end: state.audio.duration };
    renderRangePicker();
    renderPracticeList();
    updateLoopButtonState();
  });

  state.audio.addEventListener('timeupdate', () => {
    curTimeEl.textContent = formatTime(state.audio.currentTime);
    if (!seekBar.matches(':active')) seekBar.value = state.audio.currentTime;
    updateActiveLine();
    checkLoopBoundary();
  });

  seekBar.addEventListener('input', () => { state.audio.currentTime = parseFloat(seekBar.value); });
  speedSelect.addEventListener('change', () => { state.audio.playbackRate = parseFloat(speedSelect.value); });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code !== 'Space') return;
    if (!state.currentSong) return;
    e.preventDefault();
    const syncActive = document.getElementById('syncTab').classList.contains('active');
    if (syncActive && !state.audio.paused) tapNextLine();
    else togglePlay();
  });

  // ---------- Tabs ----------

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
    });
  });

  // ---------- Sync tab ----------

  function renderSyncList() {
    syncList.innerHTML = '';
    const lyrics = state.currentSong.lyrics;
    lyrics.forEach((line, i) => {
      const li = document.createElement('li');
      li.className = 'lyric-line';
      if (i === state.syncPointer) li.classList.add('next-up');

      const timeSpan = document.createElement('span');
      timeSpan.className = 'line-time' + (line.time == null ? ' unset' : '');
      timeSpan.textContent = formatTime(line.time);
      timeSpan.title = 'Tap to edit timestamp manually';
      timeSpan.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const input = prompt('Timestamp (m:ss.s or seconds):', line.time != null ? formatTime(line.time) : '');
        if (input == null) return;
        const t = parseTime(input);
        if (t != null) {
          line.time = t;
          persistCurrentSong();
          renderSyncList();
          renderPracticeList();
        }
      });

      const textSpan = document.createElement('span');
      textSpan.className = 'line-text';
      textSpan.textContent = line.text;

      li.addEventListener('click', () => {
        if (line.time != null) state.audio.currentTime = line.time;
      });

      li.appendChild(timeSpan);
      li.appendChild(textSpan);
      syncList.appendChild(li);
    });
    updateSyncProgress();
  }

  function updateSyncProgress() {
    const lyrics = state.currentSong.lyrics;
    const synced = lyrics.filter(l => l.time != null).length;
    syncProgress.textContent = `${synced}/${lyrics.length} lines timestamped`;
  }

  tapBtn.addEventListener('click', tapNextLine);

  function tapNextLine() {
    const lyrics = state.currentSong.lyrics;
    if (state.syncPointer >= lyrics.length) return;
    lyrics[state.syncPointer].time = state.audio.currentTime;
    state.syncPointer++;
    persistCurrentSong();
    renderSyncList();
    renderPracticeList();
    renderLibrary();
    // auto-scroll next-up line into view
    const nextEl = syncList.querySelector('.next-up');
    if (nextEl) nextEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  resetSyncBtn.addEventListener('click', () => {
    if (!confirm('Clear all timestamps for this song?')) return;
    state.currentSong.lyrics.forEach(l => { l.time = null; });
    state.syncPointer = 0;
    persistCurrentSong();
    renderSyncList();
    renderPracticeList();
    renderLibrary();
  });

  // Decode the song and measure short-window loudness to find where the
  // track actually starts and stops making sound, so auto-sync doesn't
  // burn time on a silent/instrumental intro or outro.
  async function detectActiveSpan(blob, fallbackDuration) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioCtx();
    let audioBuffer;
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } finally {
      ctx.close();
    }
    const sr = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const hop = Math.max(1, Math.floor(sr * 0.05)); // 50ms windows
    const frameCount = Math.ceil(length / hop);
    const channelData = [];
    for (let c = 0; c < numChannels; c++) channelData.push(audioBuffer.getChannelData(c));

    const energies = new Float32Array(frameCount);
    let max = 0;
    for (let f = 0; f < frameCount; f++) {
      const start = f * hop;
      const end = Math.min(start + hop, length);
      let sum = 0;
      for (let c = 0; c < numChannels; c++) {
        const data = channelData[c];
        for (let i = start; i < end; i++) sum += data[i] * data[i];
      }
      const e = Math.sqrt(sum / Math.max(1, (end - start) * numChannels));
      energies[f] = e;
      if (e > max) max = e;
    }
    if (max <= 0) return { start: 0, end: audioBuffer.duration || fallbackDuration };

    const threshold = max * 0.06; // ~6% of peak = audibly "sound present"
    let firstActive = -1, lastActive = -1;
    for (let f = 0; f < frameCount; f++) {
      if (energies[f] > threshold) {
        if (firstActive === -1) firstActive = f;
        lastActive = f;
      }
    }
    if (firstActive === -1) return { start: 0, end: audioBuffer.duration || fallbackDuration };
    return {
      start: (firstActive * hop) / sr,
      end: Math.min(audioBuffer.duration || fallbackDuration, ((lastActive + 1) * hop) / sr),
    };
  }

  autoSyncBtn.addEventListener('click', async () => {
    const duration = state.audio.duration;
    if (!duration || !isFinite(duration)) {
      alert('Play the song for a moment first so its length is known, then try Auto-sync again.');
      return;
    }
    if (!confirm('Auto-sync analyzes the track to line up with where the sound actually starts and stops (skipping a silent intro/outro), then spaces lines evenly in between. It overwrites any existing timestamps. Continue?')) return;

    // Analysis below is a real async decode that can take a noticeable
    // moment — remember which song this run is for so that switching to a
    // different song, or deleting this one, while it's in flight can't
    // apply the result to the wrong song (or crash on a null currentSong).
    const targetSongId = state.currentSong.id;
    const originalLabel = autoSyncBtn.textContent;
    autoSyncBtn.disabled = true;
    autoSyncBtn.textContent = 'Analyzing…';

    let span = { start: duration * 0.02, end: duration * 0.98 };
    try {
      const detected = await detectActiveSpan(state.currentSong.audioBlob, duration);
      if (detected && detected.end > detected.start) span = detected;
    } catch (err) {
      console.error('Auto-sync audio analysis failed, falling back to even spacing across the full track', err);
    }

    if (!state.currentSong || state.currentSong.id !== targetSongId) {
      // The user navigated away from (or deleted) this song while the
      // analysis was running — discard the result instead of misapplying
      // it to whatever song is open now.
      autoSyncBtn.disabled = false;
      autoSyncBtn.textContent = originalLabel;
      return;
    }

    const lyrics = state.currentSong.lyrics;
    const spanLen = Math.max(0, span.end - span.start);
    lyrics.forEach((line, i) => {
      line.time = lyrics.length > 1 ? span.start + spanLen * (i / (lyrics.length - 1)) : span.start;
    });
    state.syncPointer = lyrics.length;
    persistCurrentSong();
    renderSyncList();
    renderPracticeList();
    renderLibrary();

    autoSyncBtn.disabled = false;
    autoSyncBtn.textContent = originalLabel;
  });

  // Highlight the currently playing line across both tabs
  function updateActiveLine() {
    // Guard against a stray 'timeupdate' firing after the song was closed
    // (e.g. deleted) but before playback fully stopped.
    if (!state.currentSong) return;
    const lyrics = state.currentSong.lyrics;
    const t = state.audio.currentTime;
    // Pick whichever timestamped line has the latest time at or before
    // now — not just "the last one in list order" — so a manually
    // corrected, out-of-order timestamp can't make this stop early and
    // freeze the highlight on the wrong line.
    let activeIdx = -1;
    let bestTime = -Infinity;
    for (let i = 0; i < lyrics.length; i++) {
      const lt = lyrics[i].time;
      if (lt != null && lt <= t && lt > bestTime) {
        bestTime = lt;
        activeIdx = i;
      }
    }
    [syncList, practiceList].forEach(listEl => {
      Array.from(listEl.children).forEach((li, i) => {
        li.classList.toggle('active', i === activeIdx);
      });
    });
  }

  // ---------- Practice / loop tab ----------

  function renderPracticeList() {
    practiceList.innerHTML = '';
    const lyrics = state.currentSong.lyrics;
    const range = state.loopRange;
    lyrics.forEach((line, i) => {
      const li = document.createElement('li');
      li.className = 'lyric-line';
      if (range && line.time != null && line.time >= range.start - 0.01 && line.time < range.end + 0.01) {
        li.classList.add('selected');
      }

      const timeSpan = document.createElement('span');
      timeSpan.className = 'line-time' + (line.time == null ? ' unset' : '');
      timeSpan.textContent = formatTime(line.time);

      const textSpan = document.createElement('span');
      textSpan.className = 'line-text';
      textSpan.textContent = line.text;

      li.appendChild(timeSpan);
      li.appendChild(textSpan);

      li.addEventListener('click', () => {
        if (line.time == null) {
          alert('This line has no timestamp yet — sync it first in the "Sync lyrics" tab.');
          return;
        }
        // Jump the loop range to this line's span (its start through the
        // next timestamped line, or the end of the song).
        let end = state.audio.duration;
        for (let j = i + 1; j < lyrics.length; j++) {
          if (lyrics[j].time != null) { end = lyrics[j].time; break; }
        }
        state.loopRange = { start: line.time, end: Math.max(end, line.time + 0.1) };
        renderRangePicker();
        renderPracticeList();
        updateLoopButtonState();
      });

      practiceList.appendChild(li);
    });
  }

  function updateLoopButtonState() {
    const r = state.loopRange;
    loopBtn.disabled = !r || !(r.end > r.start);
  }

  // ---------- Drag-to-select range slider ----------

  function renderRangePicker() {
    const duration = state.audio.duration;
    if (!duration || !isFinite(duration) || !state.loopRange) {
      rangeHandleStart.style.left = '0%';
      rangeHandleEnd.style.left = '100%';
      rangeFill.style.left = '0%';
      rangeFill.style.width = '0%';
      rangeStartLabel.textContent = '0:00.0';
      rangeEndLabel.textContent = '0:00.0';
      return;
    }
    const startPct = clampPct(state.loopRange.start / duration);
    const endPct = clampPct(state.loopRange.end / duration);
    rangeHandleStart.style.left = (startPct * 100) + '%';
    rangeHandleEnd.style.left = (endPct * 100) + '%';
    rangeFill.style.left = (startPct * 100) + '%';
    rangeFill.style.width = ((endPct - startPct) * 100) + '%';
    rangeStartLabel.textContent = formatTime(state.loopRange.start);
    rangeEndLabel.textContent = formatTime(state.loopRange.end);
  }

  function clampPct(p) { return Math.min(1, Math.max(0, p)); }

  function timeFromPointer(clientX) {
    const rect = rangeTrack.getBoundingClientRect();
    const pct = clampPct((clientX - rect.left) / rect.width);
    return pct * (state.audio.duration || 0);
  }

  function setupRangeHandle(handleEl, which) {
    handleEl.addEventListener('pointerdown', (ev) => {
      if (!state.audio.duration) return;
      ev.preventDefault();
      handleEl.setPointerCapture(ev.pointerId);

      const onMove = (moveEv) => {
        const t = timeFromPointer(moveEv.clientX);
        if (!state.loopRange) state.loopRange = { start: 0, end: state.audio.duration };
        const MIN_GAP = 0.2;
        if (which === 'start') {
          state.loopRange.start = Math.min(t, state.loopRange.end - MIN_GAP);
        } else {
          state.loopRange.end = Math.max(t, state.loopRange.start + MIN_GAP);
        }
        renderRangePicker();
        renderPracticeList();
        updateLoopButtonState();
      };
      const onUp = (upEv) => {
        handleEl.releasePointerCapture(upEv.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    // Arrow-key nudging for keyboard/accessibility use.
    handleEl.addEventListener('keydown', (ev) => {
      if (!state.loopRange || !state.audio.duration) return;
      const step = ev.shiftKey ? 1 : 0.2;
      let delta = 0;
      if (ev.key === 'ArrowLeft') delta = -step;
      else if (ev.key === 'ArrowRight') delta = step;
      else return;
      ev.preventDefault();
      const MIN_GAP = 0.2;
      if (which === 'start') {
        state.loopRange.start = Math.min(Math.max(0, state.loopRange.start + delta), state.loopRange.end - MIN_GAP);
      } else {
        state.loopRange.end = Math.max(Math.min(state.audio.duration, state.loopRange.end + delta), state.loopRange.start + MIN_GAP);
      }
      renderRangePicker();
      renderPracticeList();
      updateLoopButtonState();
    });
  }

  setupRangeHandle(rangeHandleStart, 'start');
  setupRangeHandle(rangeHandleEnd, 'end');

  loopBtn.addEventListener('click', startLoop);
  stopLoopBtn.addEventListener('click', stopLoop);

  function startLoop() {
    if (!state.loopRange || !(state.loopRange.end > state.loopRange.start)) return;
    state.looping = true;
    const target = parseInt(repeatSelect.value, 10);
    state.loopRepeatsLeft = target; // 0 means infinite
    loopBtn.classList.add('hidden');
    stopLoopBtn.classList.remove('hidden');
    state.audio.currentTime = state.loopRange.start;
    state.audio.play();
    updateLoopStatus();
  }

  function stopLoop() {
    state.looping = false;
    if (state.loopTimer) { clearTimeout(state.loopTimer); state.loopTimer = null; }
    loopBtn.classList.remove('hidden');
    stopLoopBtn.classList.add('hidden');
    loopStatus.textContent = '';
  }

  function updateLoopStatus() {
    if (!state.looping) return;
    const target = parseInt(repeatSelect.value, 10);
    loopStatus.textContent = target === 0 ? 'Looping…' : `Repeats left: ${state.loopRepeatsLeft}`;
  }

  function checkLoopBoundary() {
    if (!state.looping || !state.loopRange) return;
    const { start, end } = state.loopRange;
    if (state.audio.currentTime >= end - 0.03) {
      state.audio.pause();
      const target = parseInt(repeatSelect.value, 10);
      if (target !== 0) {
        state.loopRepeatsLeft--;
        if (state.loopRepeatsLeft <= 0) { stopLoop(); return; }
      }
      updateLoopStatus();
      const gap = parseFloat(gapSelect.value) * 1000;
      state.loopTimer = setTimeout(() => {
        if (!state.looping) return;
        state.audio.currentTime = start;
        state.audio.play();
      }, gap);
    }
  }

  // ---------- Boot ----------

  refreshLibrary().then(() => {
    showView('empty');
  });

})();
