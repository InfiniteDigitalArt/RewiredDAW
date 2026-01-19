window.parseLoopMetadata = function(filename) {
  // Remove extension
  const originalName = filename.replace(/\.[^/.]+$/, "");

  // Create a display name with sharps (for UI only)
  const displayName = originalName
    .replace(/([A-G])-/g, "$1#")   // F- → F#
    .replace(/sharp/gi, "#");

  // Extract BPM
  const bpmMatch = originalName.match(/(\d+)bpm/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1]) : 175;

  // Default bars (you can expand this later)
  const bars = 1;

  return {
    loopId: originalName,   // STABLE KEY — used for DROPBOX_LOOPS and save/load
    displayName,            // PRETTY NAME — used for sidebar + clip labels
    bpm,
    bars
  };
};

window.refreshClipInTimeline = function (clip) {
  const el = document.querySelector(`[data-clip-id="${clip.id}"]`);
  if (!el) return;

  const parent = el.parentElement;
  if (!parent) return;

  // Remove old element
  el.remove();

  // Render fresh
  window.renderClip(clip, parent);
};