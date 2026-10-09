chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "add-checkpoint") {
    return;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tab = tabs[0];

  if (!tab?.id || !tab.url) {
    return;
  }

  try {
    const url = new URL(tab.url);

    if (url.hostname !== "web.programming-hero.com") {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_CURRENT_TIME",
    });

    if (
      !response?.success ||
      typeof response.currentTime !== "number"
    ) {
      return;
    }

    const timestamp = response.currentTime;

    const lessonKey = `${url.hostname}${url.pathname}`;

    const result = await chrome.storage.local.get(lessonKey);

    const checkpoints = Array.isArray(result[lessonKey])
      ? result[lessonKey]
      : [];

    const checkpoint = {
      id: crypto.randomUUID(),
      timestamp,
      name: `Checkpoint ${formatTimestamp(timestamp)}`,
    };

    checkpoints.push(checkpoint);

    checkpoints.sort(
      (a, b) => a.timestamp - b.timestamp
    );

    await chrome.storage.local.set({
      [lessonKey]: checkpoints,
    });

    // The floating popup listens for storage changes and will update immediately.
  } catch (error) {
    console.error(
      "Failed to create checkpoint:",
      error
    );
  }
});

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}
chrome.runtime.onMessage.addListener(
  (message) => {
    if (message.type !== "OPEN_FLOATING_WINDOW") {
      return;
    }

    if (typeof message.lessonKey !== "string") {
      return;
    }

    const lessonKey = encodeURIComponent(message.lessonKey);

    const url = chrome.runtime.getURL(
      `src/popup.html?floating=true&lesson=${lessonKey}`
    );

    void chrome.windows.create({
      url,
      type: "popup",
      width: 500,
      height: 620,
      focused: true
    });
  }
);
