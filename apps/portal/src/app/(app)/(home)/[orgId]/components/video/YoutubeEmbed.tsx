'use client';

import type { EmployeeTrainingVideoCompletion } from '@db';
import { Button, Spinner } from '@trycompai/design-system';
import { ArrowRight, Checkmark } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { useVideoEnded } from './use-video-ended';

// Define our own TrainingVideo interface since we can't find the import
interface TrainingVideo {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  url: string;
}

// Define interface for the merged video object
interface MergedVideo extends TrainingVideo {
  completionStatus?: EmployeeTrainingVideoCompletion;
  isCompleted: boolean;
}

interface YoutubeEmbedProps {
  video: MergedVideo;
  isCompleted: boolean;
  onComplete: () => void;
  onNext?: () => void;
  allVideosCompleted: boolean;
  isMarkingComplete: boolean;
}

export function YoutubeEmbed({
  video,
  isCompleted,
  onComplete,
  onNext,
  allVideosCompleted,
  isMarkingComplete,
}: YoutubeEmbedProps) {
  const [isRewatching, setIsRewatching] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ended = useVideoEnded({ iframeRef, videoId: video.id });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!allVideosCompleted && (
          <Button
            variant={isCompleted ? 'secondary' : 'default'}
            onClick={onComplete}
            disabled={isCompleted || !ended || isMarkingComplete}
            title={!isCompleted && !ended ? 'Watch the video to the end to complete it' : undefined}
          >
            {isMarkingComplete ? (
              <>
                <Spinner size="sm" />
                Marking as Complete...
              </>
            ) : (
              <>
                <Checkmark size={16} />
                {isCompleted ? 'Completed' : ended ? 'Mark as Complete' : 'Watch to the end to complete'}
              </>
            )}
          </Button>
        )}
      </div>
      <div className="relative aspect-video w-full">
        {isCompleted && !isRewatching && (
          <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-xs">
            <div className="space-y-4 text-center">
              <div className="text-primary mx-auto"><Checkmark size={48} /></div>
              <h3 className="text-xl font-semibold">Video Completed</h3>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setIsRewatching(true)}>
                  Watch Again
                </Button>
                {onNext && (
                  <Button onClick={onNext}>
                    Next Video
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        <iframe
          key={video.id}
          ref={iframeRef}
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
