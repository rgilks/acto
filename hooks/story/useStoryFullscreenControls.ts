import { useState, useEffect, RefObject } from 'react';
import { FullScreenHandle } from 'react-full-screen';

interface UseStoryFullscreenControlsProps {
  storyContainerRef: RefObject<HTMLDivElement | null>;
  fullscreenHandle: FullScreenHandle;
  isTouchDevice: boolean;
}

export function useStoryFullscreenControls({
  storyContainerRef,
  fullscreenHandle,
  isTouchDevice,
}: UseStoryFullscreenControlsProps): boolean {
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    // Immediately hide controls on touch devices or if API is unavailable
    // Ensure correct disable comment placement

    if (isTouchDevice) {
      setShowControls(false);
      return;
    }

    const container = storyContainerRef.current;
    // Hide controls if not in fullscreen or container ref is not available

    if (!container || !fullscreenHandle.active) {
      setShowControls(false);
      return;
    }

    let hideTimeout: NodeJS.Timeout | null = null;

    const handleMouseMove = (event: MouseEvent) => {
      if (!fullscreenHandle.active) return; // Re-check just in case

      const rect = container.getBoundingClientRect();
      const mouseY = event.clientY - rect.top;
      const threshold = rect.height * 0.2; // Show in top 20%

      if (mouseY <= threshold) {
        setShowControls(true);
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          setShowControls(false);
        }, 2000); // Hide after 2 seconds of inactivity in the zone
      } else {
        if (hideTimeout) clearTimeout(hideTimeout); // Clear timeout if mouse moves below threshold
        setShowControls(false); // Hide immediately when mouse moves below threshold
      }
    };

    const handleMouseLeave = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      setShowControls(false);
    };

    // Add listeners
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    // Initial check shortly after entering fullscreen or component mount in fullscreen
    const initialCheckTimeout = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (fullscreenHandle.active && container) {
        const event = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          // Simulate mouse near top-center
          clientX: container.offsetLeft + container.offsetWidth / 2,
          clientY: container.offsetTop + container.offsetHeight * 0.1,
        });
        container.dispatchEvent(event);
      }
    }, 100);

    // Cleanup
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (hideTimeout) clearTimeout(hideTimeout);
      clearTimeout(initialCheckTimeout);
    };
  }, [
    fullscreenHandle.active, // Dependency: fullscreen state
    isTouchDevice, // Dependency: touch device detection
    storyContainerRef, // Dependency: container ref
  ]);

  // Return the state value
  return showControls;
}
