import React from 'react';
import Image from 'next/image';
import { FullScreenHandle } from 'react-full-screen';
import {
  ArrowPathIcon,
  PauseIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/solid';

// Props expected by the StoryImageDisplay component
interface StoryImageDisplayProps {
  // Image state from useStoryImageTransition
  previousImageUrl: string | null;
  currentImageUrl: string | null;
  isTransitioningImage: boolean;
  isCurrentImageLoading: boolean;
  handleImageLoad: (loadedImageUrl?: string) => void;
  handleImageError: () => void;

  // Audio state/controls from useStoryAudio
  userPaused: boolean;
  togglePlayPause: () => void;
  currentAudioData: string | null;
  ttsPlayerError: string | null;

  // Volume state/controls (passed from parent or another hook)
  localVolume: number;
  handleVolumeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

  // Fullscreen state/controls
  fullscreenHandle: FullScreenHandle;
  isTouchDevice: boolean;
  showFullscreenControls: boolean; // From useStoryFullscreenControls

  // Choices component (passed as children or prop)
  children?: React.ReactNode; // To render StoryChoices inside
}

const StoryImageDisplay: React.FC<StoryImageDisplayProps> = ({
  previousImageUrl,
  currentImageUrl,
  isTransitioningImage,
  isCurrentImageLoading,
  handleImageLoad,
  handleImageError,
  userPaused,
  togglePlayPause,
  currentAudioData,
  ttsPlayerError,
  localVolume,
  handleVolumeChange,
  fullscreenHandle,
  isTouchDevice,
  showFullscreenControls,
  children, // Render choices here
}) => {
  const imageWrapperClasses = fullscreenHandle.active
    ? 'bg-black h-full w-full'
    : 'min-h-[200px] aspect-[16/10] rounded shadow-md bg-slate-700 flex items-center justify-center shadow-xl shadow-amber-300/20 story-image-wrapper';

  const imageSizes = fullscreenHandle.active
    ? '100vw'
    : '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw';

  return (
    <div
      className={`
        relative group overflow-hidden w-full flex-grow
        ${imageWrapperClasses}
      `}
    >
      {/* Previous Image (Bottom Layer) */}
      {previousImageUrl && (
        <Image
          key={`prev-${previousImageUrl}`}
          src={previousImageUrl}
          alt="Previous story scene"
          fill
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
            isTransitioningImage ? 'opacity-0' : 'opacity-100'
          }`}
          priority
          sizes={imageSizes}
        />
      )}

      {/* Current Image (Top Layer) - Loads and Fades In */}
      {currentImageUrl && (
        <Image
          key={`curr-${currentImageUrl}`}
          src={currentImageUrl}
          alt="Story scene"
          fill
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
            isTransitioningImage ? 'opacity-100' : 'opacity-0'
          }`}
          priority
          sizes={imageSizes}
          onLoad={() => {
            handleImageLoad(currentImageUrl);
          }}
          onError={handleImageError}
        />
      )}

      {/* Loading Spinner */}
      {isCurrentImageLoading && (
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-10">
          <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
        </div>
      )}

      {/* Pause Icon */}
      {userPaused && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <PauseIcon className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 text-white/75" />
        </div>
      )}

      {/* Fullscreen Toggle Button */}
      {!isTouchDevice && (
        <button
          onClick={fullscreenHandle.active ? fullscreenHandle.exit : fullscreenHandle.enter}
          className={`absolute top-2 left-2 z-20 p-1.5 bg-black/40 rounded-full text-white/80 hover:text-white transition-all
            ${
              fullscreenHandle.active
                ? showFullscreenControls
                  ? 'opacity-100 pointer-events-auto duration-200'
                  : 'opacity-0 pointer-events-none duration-300'
                : 'opacity-50 hover:opacity-100'
            }
          `}
          aria-label={fullscreenHandle.active ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {fullscreenHandle.active ? (
            <ArrowsPointingInIcon className="h-5 w-5" />
          ) : (
            <ArrowsPointingOutIcon className="h-5 w-5" />
          )}
        </button>
      )}

      {/* Click handler overlay for Play/Pause */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={currentAudioData ? togglePlayPause : undefined}
      ></div>

      {/* Volume Slider */}
      {currentAudioData && (
        <div
          className={`absolute top-2 right-2 z-20 flex items-center space-x-2 bg-black/40 rounded-full px-2 py-1 transition-all
              ${
                fullscreenHandle.active
                  ? showFullscreenControls && !isTouchDevice
                    ? 'opacity-100 pointer-events-auto duration-200'
                    : 'opacity-0 pointer-events-none duration-300'
                  : !isTouchDevice
                    ? 'opacity-50 hover:opacity-100 transition-opacity duration-200'
                    : 'opacity-0 pointer-events-none'
              }
            `}
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localVolume}
            onChange={handleVolumeChange}
            className="w-16 h-1 bg-slate-500 rounded-full appearance-none cursor-pointer accent-amber-300"
            aria-label="Narration volume"
          />
          {ttsPlayerError && (
            <span className="ml-2 text-xs text-red-400 bg-black/50 px-1.5 py-0.5 rounded">
              Audio Error
            </span>
          )}
        </div>
      )}

      {/* Render Choices passed as children */}
      {children}
    </div>
  );
};

export default StoryImageDisplay;
