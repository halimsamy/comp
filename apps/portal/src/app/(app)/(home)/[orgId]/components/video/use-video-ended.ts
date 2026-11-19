'use client';

import { type RefObject, useEffect, useState } from 'react';

interface YTPlayer {
  destroy: () => void;
}
interface YTNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: { events: { onStateChange: (event: { data: number }) => void } },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;
let apiPromise: Promise<YTNamespace> | null = null;

function loadYoutubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube player API unavailable'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** #64: true once the embedded YouTube video has played to the end. */
export function useVideoEnded({ iframeRef, videoId }: { iframeRef: RefObject<HTMLIFrameElement | null>; videoId: string }) {
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setEnded(false);
    let player: YTPlayer | null = null;
    let cancelled = false;
    loadYoutubeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) return;
        player = new YT.Player(iframeRef.current, {
          events: { onStateChange: (event) => event.data === YT_ENDED && setEnded(true) },
        });
      })
      // If the player API is blocked (ad blocker, network policy) the end can't be detected;
      // don't lock the employee out of their training.
      .catch(() => !cancelled && setEnded(true));
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [iframeRef, videoId]);

  return ended;
}
