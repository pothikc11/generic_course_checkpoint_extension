
type VideoPlatform =
  | "youtube"
  | "programming-hero"
  | "phitron"
  | "generic";

interface VideoAdapter {
  platform: VideoPlatform;
  matches: () => boolean;
  getVideo: () => HTMLVideoElement | null;
}

const adapters: VideoAdapter[] = [
  {
    platform: "youtube",
    matches: () => {
      const host = window.location.hostname;

      return (
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be"
      );
    },
    getVideo: () =>
      document.querySelector<HTMLVideoElement>(
        "video.html5-main-video"
      ) ??
      document.querySelector<HTMLVideoElement>("video")
  },
  {
    platform: "programming-hero",
    matches: () =>
      window.location.hostname === "web.programming-hero.com",
    getVideo: () =>
      document.querySelector<HTMLVideoElement>(
        "video.shaka-video"
      )
  },
  {
    platform: "phitron",
    matches: () => {
      const host = window.location.hostname;

      return (
        host === "phitron.io" ||
        host.endsWith(".phitron.io")
      );
    },
    getVideo: () =>
      document.querySelector<HTMLVideoElement>(
        "video.shaka-video"
      )
  },
  {
    platform: "generic",
    matches: () => true,
    getVideo: () =>
      document.querySelector<HTMLVideoElement>("video")
  }
];

function getActiveAdapter(): VideoAdapter {
  return (
    adapters.find(
      (adapter) =>
        adapter.platform !== "generic" && adapter.matches()
    ) ??
    adapters[adapters.length - 1]
  )!;
}

function getVideo(): HTMLVideoElement | null {
  return getActiveAdapter().getVideo();
}

function getCurrentTime(): number | null {
  const video = getVideo();

  if (!video || !Number.isFinite(video.currentTime)) {
    return null;
  }

  return video.currentTime;
}

function seekVideoTo(timestamp: number): boolean {
  const video = getVideo();

  if (
    !video ||
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    return false;
  }

  try {
    video.currentTime = timestamp;
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: {
      type: string;
      timestamp?: number;
    },
    _sender,
    sendResponse
  ) => {
    if (message.type === "GET_CURRENT_TIME") {
      sendResponse({
        success: true,
        currentTime: getCurrentTime()
      });

      return true;
    }

    if (
      message.type === "SEEK_TO" &&
      typeof message.timestamp === "number"
    ) {
      sendResponse({
        success: seekVideoTo(message.timestamp)
      });

      return true;
    }

    return false;
  }
);