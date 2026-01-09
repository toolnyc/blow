# Custom MP3 Player Plan

## Goal
Replace the SoundCloud iframe embed with a custom MP3 player for 4-10 mixes (~1.5 hrs each).

## Features Required
- Play/pause
- Progress bar with seeking
- Volume control
- Track navigation (prev/next)
- Track list display

## File Storage
MP3s are ~100-150MB each (400MB-1.5GB total). Options:
1. **Vercel Blob Storage** - Best for this use case, integrates with existing Vercel deployment
2. **External hosting** - S3, Cloudflare R2, or similar
3. **Direct URLs** - If already hosted somewhere

## Implementation Approach

### 1. Create Track Data Structure
```typescript
interface Track {
  id: string;
  title: string;
  artist?: string;
  url: string; // URL to MP3 file
  duration?: number; // Optional, can be read from audio element
}

const tracks: Track[] = [
  { id: '1', title: 'Mix Name 1', url: 'https://...' },
  // ...
];
```

### 2. Build Custom Audio Player Component
Replace the SoundCloud iframe in the Mixtapes window with:

**HTML Structure:**
```html
<div class="audio-player">
  <!-- Track List -->
  <div class="track-list">
    <div class="track-item active">Track 1</div>
    <div class="track-item">Track 2</div>
    ...
  </div>

  <!-- Now Playing Info -->
  <div class="now-playing">
    <span class="track-title">Track Name</span>
  </div>

  <!-- Progress Bar -->
  <div class="progress-container">
    <span class="time-current">0:00</span>
    <input type="range" class="progress-bar" min="0" max="100" value="0">
    <span class="time-total">0:00</span>
  </div>

  <!-- Controls -->
  <div class="controls">
    <button class="btn-prev">⏮</button>
    <button class="btn-play">▶</button>
    <button class="btn-next">⏭</button>
    <input type="range" class="volume-slider" min="0" max="100" value="100">
  </div>
</div>

<audio id="audio-element"></audio>
```

### 3. Styling with 98.css
- Use native 98.css button styles for controls
- Use 98.css range input styling for progress/volume
- Track list uses 98.css list styling
- Match existing site colors (#ff2845 for accents)

### 4. JavaScript Player Logic
Add to existing script block in index.astro:

```javascript
// Player state
let currentTrackIndex = 0;
let isPlaying = false;
const audio = document.getElementById('audio-element');

// Core functions
function loadTrack(index) { ... }
function togglePlay() { ... }
function nextTrack() { ... }
function prevTrack() { ... }
function seek(time) { ... }
function setVolume(level) { ... }
function formatTime(seconds) { ... }

// Event listeners
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('ended', nextTrack);
audio.addEventListener('loadedmetadata', updateDuration);
```

### 5. Mobile Considerations
- Larger touch targets for controls
- Volume control may need alternative on iOS (system volume)
- Test autoplay restrictions

## Files to Modify
- `src/pages/index.astro` - Replace SoundCloud iframe, add player JS
- `public/icons/` - May need play/pause/etc icons (or use text/emoji)

## Files to Create
- None required if keeping everything in index.astro
- Optional: `src/components/AudioPlayer.astro` if we want to extract it

## Open Questions
1. Where will MP3s be hosted? (Need URLs before implementation)
2. Track metadata - do you have titles/artists for each mix?
3. Any album art to display?

## Existing Patterns to Reuse
- Window component wrapper (already in place)
- Draggable window system
- 98.css button/input styling
- Mobile responsive breakpoint (600px)
- Brand color (#ff2845)

## References
- Current Mixtapes window: `src/pages/index.astro:40-54`
- Window management JS: `src/pages/index.astro:194-511`
- 98.css docs: https://jdan.github.io/98.css/
