import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ScenarioErrorDisplay from './ScenarioErrorDisplay';
import type { ErrorState } from '@/app/store/storyStore';

describe('ScenarioErrorDisplay', () => {
  const genericErrorMessage = 'Failed to fetch scenarios.';
  const rateLimitMessage = 'API rate limit exceeded.';

  beforeEach(() => {
    // Use fake timers to control Date.now()
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();
  });

  it('should render generic error message when fetchError is a string', () => {
    render(<ScenarioErrorDisplay fetchError={genericErrorMessage} />);

    expect(screen.getByText('Error Loading Scenarios')).toBeInTheDocument();
    expect(screen.getByText(genericErrorMessage)).toBeInTheDocument();
    expect(screen.queryByText('Time for a Break?')).not.toBeInTheDocument();
  });

  it('should render rate limit error message when fetchError is an object', () => {
    const now = Date.now();
    const resetTimestamp = now + 5 * 60 * 1000; // 5 minutes from now
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);

    expect(screen.getByText('Time for a Break?')).toBeInTheDocument();
    expect(screen.getByText(rateLimitMessage, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Try again in about 5 minutes?/)).toBeInTheDocument();
    expect(screen.queryByText('Error Loading Scenarios')).not.toBeInTheDocument();
  });

  it('should display "shortly" when reset time is in the past or now', () => {
    const now = Date.now();
    const resetTimestamp = now - 1000; // 1 second ago
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    expect(screen.getByText(/Try again shortly?/)).toBeInTheDocument();
  });

  it('should display time in seconds when reset time is less than a minute away', () => {
    const now = Date.now();
    const resetTimestamp = now + 30 * 1000; // 30 seconds from now
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    expect(screen.getByText(/Try again in 30 seconds?/)).toBeInTheDocument();
  });

  it('should display time in singular second when reset time is 1 second away', () => {
    const now = Date.now();
    const resetTimestamp = now + 1 * 1000; // 1 second from now
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    expect(screen.getByText(/Try again in 1 second?/)).toBeInTheDocument();
  });

  it('should display time in minutes when reset time is less than an hour away', () => {
    const now = Date.now();
    const resetTimestamp = now + 15 * 60 * 1000; // 15 minutes from now
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    expect(screen.getByText(/Try again in about 15 minutes?/)).toBeInTheDocument();
  });

  it('should display time in singular minute when reset time is around 1 minute away', () => {
    const now = Date.now();
    // Use 61 seconds to test the ceiling function for minutes
    const resetTimestamp = now + 61 * 1000; // 61 seconds from now
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    // Because formatResetTime uses Math.ceil for minutes, 61 seconds becomes 2 minutes
    expect(screen.getByText(/Try again in about 2 minutes?/)).toBeInTheDocument();
  });

  it('should display the specific time when reset time is an hour or more away', () => {
    const now = new Date(2024, 5, 15, 10, 30, 0); // June 15, 2024 10:30:00 AM
    const resetTimestamp = now.getTime() + 2 * 60 * 60 * 1000; // 2 hours from now (12:30:00 PM)
    const fetchError: ErrorState = {
      rateLimitError: {
        message: rateLimitMessage,
        resetTimestamp: resetTimestamp,
        apiType: 'text',
      },
    };
    vi.setSystemTime(now);

    // Mock toLocaleTimeString for consistent output across environments
    const resetDate = new Date(resetTimestamp);
    const expectedTime = resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    render(<ScenarioErrorDisplay fetchError={fetchError} />);
    // Check for the presence of "at" and the formatted time
    expect(screen.getByText(new RegExp(`Try again at ${expectedTime}?`))).toBeInTheDocument();
  });

  it('should render default generic error message if fetchError is null or undefined', () => {
    // Test with null
    const { rerender } = render(<ScenarioErrorDisplay fetchError={null} />);
    expect(screen.getByText('Error Loading Scenarios')).toBeInTheDocument();
    expect(screen.getByText('An unknown error occurred.')).toBeInTheDocument();

    // Test with undefined
    rerender(<ScenarioErrorDisplay fetchError={undefined} />);
    expect(screen.getByText('Error Loading Scenarios')).toBeInTheDocument();
    expect(screen.getByText('An unknown error occurred.')).toBeInTheDocument();
  });
});
