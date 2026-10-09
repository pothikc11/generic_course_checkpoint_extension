function getBackgroundLessonKeyFromUrl(url: URL): string | null {
  const host = url.hostname;

  if (host === "web.programming-hero.com") {
    return `${url.hostname}${url.pathname}`;
  }

  if (host === "phitron.io" || host === "www.phitron.io") {
    return `${url.hostname}${url.pathname}`;
  }

  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return videoId ? `youtube.com/watch?v=${videoId}` : null;
  }

  if (host === "youtube.com" || host === "www.youtube.com") {
    const videoId = url.searchParams.get("v");

    if (videoId) {
      return `youtube.com/watch?v=${videoId}`;
    }

    const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);

    return shortsMatch ? `youtube.com/shorts/${shortsMatch[1]}` : null;
  }

  return null;
}

const SUPPORTED_VIDEO_URL_PATTERNS = [
  "https://www.youtube.com/*",
  "https://youtube.com/*",
  "https://youtu.be/*",
  "https://web.programming-hero.com/*",
  "https://phitron.io/*",
  "https://www.phitron.io/*"
];

async function getShortcutVideoTab(): Promise<chrome.tabs.Tab | null> {
  const currentWindowTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const currentTab = currentWindowTabs[0];

  if (currentTab?.url) {
    try {
      if (getBackgroundLessonKeyFromUrl(new URL(currentTab.url))) {
        return currentTab;
      }
    } catch {
      // Continue searching supported tabs.
    }
  }

  const tabs = await chrome.tabs.query({
    url: SUPPORTED_VIDEO_URL_PATTERNS
  });

  return tabs.find((tab) => tab.active) ?? tabs[0] ?? null;
}



chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "add-checkpoint") {
    return;
  }

  const tab = await getShortcutVideoTab();

  if (!tab?.id || !tab.url) {
    return;
  }

  try {
    const url = new URL(tab.url);

    const lessonKey = getBackgroundLessonKeyFromUrl(url);

    if (!lessonKey) {
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

    const result = await chrome.storage.local.get(lessonKey);

    const checkpoints = Array.isArray(result[lessonKey])
      ? result[lessonKey]
      : [];

    // Prevent duplicate checkpoints within the same displayed second.
    const isDuplicate = checkpoints.some(
      (checkpoint: { timestamp: number }) =>
        Math.floor(checkpoint.timestamp) === Math.floor(timestamp)
    );

    if (isDuplicate) {
      return;
    }



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
