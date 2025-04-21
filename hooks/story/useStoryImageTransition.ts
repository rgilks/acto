import { useState, useCallback, useEffect } from 'react';

interface UseStoryImageTransitionProps {
  // The URL of the image for the *new* node
  targetImageUrl: string | null;
  // Callback to trigger audio playback when appropriate (after image load/transition)
  onImageReadyForAudio?: () => void;
  // Optional: Initial image URL for hydration
  initialImageUrl?: string | null;
}

export function useStoryImageTransition({
  targetImageUrl,
  onImageReadyForAudio,
  initialImageUrl = null,
}: UseStoryImageTransitionProps) {
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(initialImageUrl);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(initialImageUrl);
  const [isTransitioningImage, setIsTransitioningImage] = useState<boolean>(false);
  const [isCurrentImageLoading, setIsCurrentImageLoading] = useState<boolean>(!!initialImageUrl);

  // Effect to update image URLs when the target image changes
  useEffect(() => {
    // Only update if the target URL is actually different from the current one
    if (targetImageUrl !== currentImageUrl) {
      setPreviousImageUrl(currentImageUrl); // Store the old URL
      setCurrentImageUrl(targetImageUrl); // Set the new target URL
      setIsCurrentImageLoading(!!targetImageUrl); // Start loading spinner if there's a new image
      setIsTransitioningImage(false); // Ensure transition starts clean
    } else if (targetImageUrl === null && currentImageUrl !== null) {
      // Handle case where new node has NO image, fading out the old one
      setPreviousImageUrl(currentImageUrl);
      setCurrentImageUrl(null);
      setIsCurrentImageLoading(false); // No image to load
      setIsTransitioningImage(true); // Trigger fade out of old image
      setTimeout(() => {
        setPreviousImageUrl(null);
        setIsTransitioningImage(false);
      }, 1000); // Match CSS transition duration

      // If no new image, but we might have audio, trigger audio callback immediately
      onImageReadyForAudio?.();
    }
  }, [targetImageUrl, currentImageUrl, onImageReadyForAudio]);

  const handleImageLoad = useCallback(
    (loadedImageUrl?: string) => {
      // Verify the loaded image is the one we are currently expecting
      if (loadedImageUrl && loadedImageUrl === currentImageUrl) {
        setIsCurrentImageLoading(false); // Mark loading complete for the *new* image
        setIsTransitioningImage(true); // Trigger the opacity swap (fade in)

        // After the transition duration, update the previous image URL state
        // and reset the transitioning flag
        setTimeout(() => {
          setPreviousImageUrl(loadedImageUrl);
          setIsTransitioningImage(false); // Reset transition state
        }, 1000); // Match CSS transition duration

        // Trigger the audio callback now that the image is loaded and transition started
        onImageReadyForAudio?.();
      }
    },
    [currentImageUrl, onImageReadyForAudio] // Dependencies: current URL and the callback
  );

  const handleImageError = useCallback(() => {
    console.error('Image failed to load:', currentImageUrl);
    setIsCurrentImageLoading(false);
    // Still trigger the transition to potentially fade out the old image
    // and make the state consistent.
    setIsTransitioningImage(true);
    setTimeout(() => {
      setPreviousImageUrl(currentImageUrl); // Treat as stable, even if failed
      setIsTransitioningImage(false);
    }, 1000);
    // Trigger audio callback even on error, as the image step is complete (though failed)
    onImageReadyForAudio?.();
  }, [currentImageUrl, onImageReadyForAudio]);

  return {
    previousImageUrl,
    currentImageUrl,
    isTransitioningImage,
    isCurrentImageLoading,
    handleImageLoad,
    handleImageError,
  };
}
