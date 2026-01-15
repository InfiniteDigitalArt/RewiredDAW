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

/**
 * Get current snap value in bars
 * @returns {number} snap value in bars
 */
window.getSnapValue = function() {
  const snapSelect = document.getElementById("snapValue");
  return snapSelect ? parseFloat(snapSelect.value) : 1;
};

/**
 * Snap a bar position to the grid
 * @param {number} bars - position in bars
 * @returns {number} snapped position in bars
 */
window.snapToGrid = function(bars) {
  const snapValue = window.getSnapValue();
  return Math.round(bars / snapValue) * snapValue;
};

/**
 * Snap a delta (change) to the grid
 * @param {number} deltaBars - change in bars
 * @returns {number} snapped delta in bars
 */
window.snapDeltaToGrid = function(deltaBars) {
  const snapValue = window.getSnapValue();
  return Math.round(deltaBars / snapValue) * snapValue;
};
