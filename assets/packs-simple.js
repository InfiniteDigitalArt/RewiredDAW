// Pack files for sidebar
// This contains the static pack structure from assets/packs/
window.PACK_FILES = {
  "Rewired Records - Makina Legends Vol 1": {
    folders: ["Construction Kits", "Effects", "Loops", "Midis", "Samples"],
    audioFiles: [],
    midiFiles: []
  }
};

// Helper to build full file paths
window.getPackFilePath = function(pack, ...pathParts) {
  return `assets/packs/${pack}/${pathParts.join('/')}`;
};

// Load pack structure dynamically based on user selections
window.loadPackFolder = async function(packName, folderPath = "") {
  const basePath = `assets/packs/${packName}/${folderPath}`;
  // This will be populated when user expands folders in the sidebar
  // For now, we'll use the static structure from the packs folder
  return {
    folders: [],
    files: []
  };
};
