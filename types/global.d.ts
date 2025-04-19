interface KofiWidgetOverlay {
  draw(id: string, config: Record<string, unknown>): void;
  // Add other methods if needed
}

declare global {
  interface Window {
    kofiWidgetOverlay?: KofiWidgetOverlay;
  }
}

export {}; // Required to make this a module
