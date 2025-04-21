import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import ScenarioSelector from './ScenarioSelector';
import { StoryChoiceSchema } from '@/lib/domain/schemas';

// Mock child components
vi.mock('./ScenarioLoadingIndicator', () => ({
  default: () => <div data-testid="loading-indicator">Loading...</div>,
}));
vi.mock('./ScenarioErrorDisplay', () => ({
  default: ({ fetchError }: { fetchError: any }) => (
    <div data-testid="error-display">
      Error: {typeof fetchError === 'string' ? fetchError : fetchError.message}
    </div>
  ),
}));
vi.mock('./NoScenariosMessage', () => ({
  default: () => <div data-testid="no-scenarios">No scenarios available.</div>,
}));
vi.mock('./ScenarioListDisplay', () => ({
  default: ({
    scenariosToDisplay,
    onScenarioSelect,
    isLoadingSelection,
    onFetchNewScenarios,
  }: any) => (
    <div data-testid="scenario-list">
      <span>{scenariosToDisplay.length} scenarios</span>
      <button
        data-testid="select-scenario-btn"
        onClick={() => onScenarioSelect(scenariosToDisplay[0])}
      >
        Select First
      </button>
      <button
        data-testid="fetch-new-scenarios-btn"
        onClick={onFetchNewScenarios}
        disabled={isLoadingSelection}
      >
        Fetch New
      </button>
    </div>
  ),
}));

const mockScenarios = [
  { text: 'Scenario 1', genre: 'Fantasy' },
  { text: 'Scenario 2', genre: 'Sci-Fi' },
];

describe('ScenarioSelector', () => {
  const mockOnScenarioSelect = vi.fn();
  const mockOnFetchNewScenarios = vi.fn();
  const defaultProps = {
    onScenarioSelect: mockOnScenarioSelect,
    isLoadingSelection: false,
    scenariosToDisplay: null,
    isLoadingScenarios: false,
    fetchError: null,
    onFetchNewScenarios: mockOnFetchNewScenarios,
    isUserLoggedIn: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading indicator when isLoadingScenarios is true', () => {
    render(<ScenarioSelector {...defaultProps} isLoadingScenarios={true} />);
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-scenarios')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scenario-list')).not.toBeInTheDocument();
  });

  it('renders error display when fetchError is present', () => {
    const error: string = 'Failed to fetch';
    render(<ScenarioSelector {...defaultProps} fetchError={error} />);
    expect(screen.getByTestId('error-display')).toBeInTheDocument();
    expect(screen.getByText('Error: Failed to fetch')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-scenarios')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scenario-list')).not.toBeInTheDocument();
  });

  it('renders no scenarios message when scenariosToDisplay is null', () => {
    render(<ScenarioSelector {...defaultProps} scenariosToDisplay={null} />);
    expect(screen.getByTestId('no-scenarios')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scenario-list')).not.toBeInTheDocument();
  });

  it('renders no scenarios message when scenariosToDisplay is an empty array', () => {
    render(<ScenarioSelector {...defaultProps} scenariosToDisplay={[]} />);
    expect(screen.getByTestId('no-scenarios')).toBeInTheDocument();
    expect(screen.queryByTestId('scenario-list')).not.toBeInTheDocument();
  });

  it('renders scenario list when scenarios are available', () => {
    render(<ScenarioSelector {...defaultProps} scenariosToDisplay={mockScenarios} />);
    expect(screen.getByTestId('scenario-list')).toBeInTheDocument();
    expect(screen.getByText('2 scenarios')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-scenarios')).not.toBeInTheDocument();
  });

  it('calls onScenarioSelect when a scenario is selected in the list', () => {
    render(<ScenarioSelector {...defaultProps} scenariosToDisplay={mockScenarios} />);
    const selectButton = screen.getByTestId('select-scenario-btn');
    fireEvent.click(selectButton);
    expect(mockOnScenarioSelect).toHaveBeenCalledTimes(1);
    // Check if it's called with the Zod-parsed schema object
    const parsedScenario = StoryChoiceSchema.parse(mockScenarios[0]);
    expect(mockOnScenarioSelect).toHaveBeenCalledWith(parsedScenario);
  });

  it('calls onFetchNewScenarios when the fetch button is clicked in the list (mocked)', () => {
    render(<ScenarioSelector {...defaultProps} scenariosToDisplay={mockScenarios} />);
    const fetchButton = screen.getByTestId('fetch-new-scenarios-btn');
    fireEvent.click(fetchButton);
    expect(mockOnFetchNewScenarios).toHaveBeenCalledTimes(1);
  });
});
