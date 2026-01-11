window.populateSidebar = function(loops) {
  const container = document.getElementById("sidebar-loops");
  container.innerHTML = ""; // clear only loop items

  loops.forEach(loop => {
    const item = document.createElement("div");
    item.className = "loop-item";
    item.draggable = true;

    item.loopId = loop.id;
    item.loopUrl = loop.url;
    item.loopBpm = loop.bpm;
    item.loopBars = loop.bars;

    item.textContent = `${loop.displayName} (${loop.bars} bars, ${loop.bpm} bpm)`;

    item.addEventListener("dragstart", () => {
      window.draggedLoop = {
        id: item.loopId,
        url: item.loopUrl,
        bpm: item.loopBpm,
        bars: item.loopBars
      };
    });

    item.addEventListener("dragend", () => {
      window.draggedLoop = null;
    });

    container.appendChild(item);
  });
};
