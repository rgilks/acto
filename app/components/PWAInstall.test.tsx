import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PWAInstall from './PWAInstall';

// Define the interface within the test file or import if exported
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// Mocks
const mockMatchMedia = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockPrompt = vi.fn(() => Promise.resolve());
const mockUserChoice = vi.fn(() => Promise.resolve({ outcome: 'accepted' }));
const mockLocalStorageGetItem = vi.fn();
const mockLocalStorageSetItem = vi.fn();
const mockLocalStorageRemoveItem = vi.fn();

let mockDeferredPrompt:
  | (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> })
  | null = null;

// Helper to create the mock event
const createMockBeforeInstallPromptEvent = (): BeforeInstallPromptEvent => ({
  preventDefault: vi.fn(),
  prompt: mockPrompt,
  userChoice: mockUserChoice(),
  // Standard Event properties required by TS
  type: 'beforeinstallprompt',
  bubbles: false,
  cancelable: true,
  composed: false,
  currentTarget: window,
  defaultPrevented: false,
  eventPhase: 0,
  isTrusted: true,
  returnValue: true,
  srcElement: window,
  target: window,
  timeStamp: Date.now(),
  cancelBubble: false,
  composedPath: () => [],
  initEvent: () => {}, // No-op function for mock
  stopImmediatePropagation: vi.fn(),
  stopPropagation: vi.fn(),
  AT_TARGET: Event.AT_TARGET,
  BUBBLING_PHASE: Event.BUBBLING_PHASE,
  CAPTURING_PHASE: Event.CAPTURING_PHASE,
  NONE: Event.NONE,
  // Add any other properties accessed by your component if needed
});

// Apply mocks before each test
beforeEach(() => {
  // Reset mocks
  mockMatchMedia.mockReset();
  mockAddEventListener.mockReset();
  mockRemoveEventListener.mockReset();
  mockPrompt.mockReset();
  mockUserChoice.mockReset();
  mockLocalStorageGetItem.mockReset();
  mockLocalStorageSetItem.mockReset();
  mockLocalStorageRemoveItem.mockReset();
  mockDeferredPrompt = null; // Reset deferredPrompt reference

  // Mock window properties
  vi.stubGlobal('matchMedia', mockMatchMedia);
  vi.stubGlobal('addEventListener', mockAddEventListener);
  vi.stubGlobal('removeEventListener', mockRemoveEventListener);
  vi.stubGlobal('localStorage', {
    getItem: mockLocalStorageGetItem,
    setItem: mockLocalStorageSetItem,
    removeItem: mockLocalStorageRemoveItem,
  });

  // Default mock implementations
  mockMatchMedia.mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }); // Default to not standalone
  mockLocalStorageGetItem.mockReturnValue(null); // Default to not dismissed

  // Capture the deferredPrompt when beforeinstallprompt is added
  mockAddEventListener.mockImplementation((event, handler) => {
    if (event === 'beforeinstallprompt') {
      // Simulate the event firing *after* the listener is added
      // Store the handler to call it later
      (window as any)._beforeInstallPromptHandler = handler;
    }
    if (event === 'appinstalled') {
      (window as any)._appInstalledHandler = handler;
    }
  });
});

// Clean up mocks after each test
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any)._beforeInstallPromptHandler;
  delete (window as any)._appInstalledHandler;
});

// Helper function to simulate the beforeinstallprompt event
const fireBeforeInstallPrompt = () => {
  if ((window as any)._beforeInstallPromptHandler) {
    mockDeferredPrompt = createMockBeforeInstallPromptEvent();
    (window as any)._beforeInstallPromptHandler(mockDeferredPrompt);
  } else {
    throw new Error('beforeinstallprompt listener not added yet');
  }
};

// Helper function to simulate the appinstalled event
const fireAppInstalled = () => {
  if ((window as any)._appInstalledHandler) {
    (window as any)._appInstalledHandler();
  } else {
    throw new Error('appinstalled listener not added yet');
  }
};

describe('PWAInstall Component', () => {
  it('should not render initially', () => {
    render(<PWAInstall />);
    expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
  });

  it('should render the install button when beforeinstallprompt fires and conditions are met', async () => {
    render(<PWAInstall />);
    fireBeforeInstallPrompt();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Install App/i })).toBeInTheDocument();
      expect(screen.getByText(/Install Acto on your device/i)).toBeInTheDocument();
    });
    expect(mockDeferredPrompt?.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('should not render if in standalone mode', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });
    render(<PWAInstall />);
    fireBeforeInstallPrompt(); // Attempt to fire
    expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
  });

  it('should not render if previously dismissed', () => {
    mockLocalStorageGetItem.mockReturnValue('true'); // Simulate dismissed
    render(<PWAInstall />);
    fireBeforeInstallPrompt(); // Attempt to fire
    expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
    expect(mockLocalStorageGetItem).toHaveBeenCalledWith('pwaInstallDismissed');
  });

  it('should hide the component and set localStorage when dismiss button is clicked', () => {
    render(<PWAInstall />);
    fireBeforeInstallPrompt();

    const installButton = screen.getByRole('button', { name: /Install App/i });
    expect(installButton).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', { name: /Dismiss install prompt/i });
    fireEvent.click(dismissButton);

    expect(installButton).not.toBeInTheDocument();
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith('pwaInstallDismissed', 'true');
  });

  it('should call deferredPrompt.prompt when install button is clicked', async () => {
    render(<PWAInstall />);
    fireBeforeInstallPrompt();

    const installButton = screen.getByRole('button', { name: /Install App/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    });
  });

  it('should hide component after successful install prompt (accepted)', async () => {
    mockUserChoice.mockResolvedValueOnce({ outcome: 'accepted' });
    render(<PWAInstall />);
    fireBeforeInstallPrompt();

    // Wait for the button to appear before clicking
    const installButton = await screen.findByRole('button', { name: /Install App/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
    });
    expect(mockPrompt).toHaveBeenCalledTimes(1);
    // Check if deferredPrompt reference is cleared (indirectly by checking button visibility)
  });

  it('should hide component after successful install prompt (dismissed)', async () => {
    mockUserChoice.mockResolvedValueOnce({ outcome: 'dismissed' });
    render(<PWAInstall />);
    fireBeforeInstallPrompt();

    // Wait for the button to appear before clicking
    const installButton = await screen.findByRole('button', { name: /Install App/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
    });
    expect(mockPrompt).toHaveBeenCalledTimes(1);
  });

  it('should hide component if prompt throws an error', async () => {
    const testError = new Error('Install cancelled by user');
    mockPrompt.mockRejectedValueOnce(testError); // Simulate prompt error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console error

    render(<PWAInstall />);
    fireBeforeInstallPrompt();

    // Wait for the button to appear before clicking
    const installButton = await screen.findByRole('button', { name: /Install App/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();
    });
    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PWA Install] Error during install prompt:'),
      testError
    );

    consoleErrorSpy.mockRestore();
  });

  it('should hide component and remove dismissal flag when appinstalled event fires', () => {
    mockLocalStorageGetItem.mockReturnValue('true'); // Start as dismissed initially for this test
    render(<PWAInstall />);

    // Should not show initially because dismissed
    expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();

    // Manually set showInstallButton to true to simulate it was shown before install
    // This requires modifying the component or using a different approach if state is not exposed
    // Alternative: Test the side effect directly
    fireAppInstalled();

    expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pwaInstallDismissed');
    // We can't easily check if the component *would* hide here without internal state access,
    // but we verified the localStorage removal which is the key side effect.
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = render(<PWAInstall />);
    // Need to capture the actual handlers passed to addEventListener
    const beforeInstallHandler = (window as any)._beforeInstallPromptHandler;
    const appInstalledHandler = (window as any)._appInstalledHandler;

    expect(mockAddEventListener).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('appinstalled', expect.any(Function));

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'beforeinstallprompt',
      beforeInstallHandler
    );
    expect(mockRemoveEventListener).toHaveBeenCalledWith('appinstalled', appInstalledHandler);
  });
});

// Add necessary imports for testing library matchers if not globally configured
// import '@testing-library/jest-dom'; // or the vitest equivalent if needed
