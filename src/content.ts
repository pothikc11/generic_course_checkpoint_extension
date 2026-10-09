

const VIDEO_SELECTOR = "video.shaka-video";

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
}

function getCurrentTime(): number | null {
  const video = getVideo();

  if (!video) {
    return null;
  }

  return video.currentTime;
}

function seekVideoTo(timestamp: number): boolean {
  const video = getVideo();

  if (!video) {
    return false;
  }

  video.currentTime = timestamp;

  return true;
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
      const success = seekVideoTo(message.timestamp);

      sendResponse({
        success
      });

      return true;
    }

    return false;
  }
);