import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import ScenarioListDisplay from './ScenarioListDisplay';

vi.mock('./ScenarioChoiceButton', () => {
  return {
    default: vi.fn(({ scenario, onClick, baseClasses, choiceClasses }) => (
      <button
        data-testid={`scenario-button-${scenario.text.substring(0, 10)}`}
        onClick={() => onClick(scenario)}
        className={`${baseClasses} ${choiceClasses}`}
      >
        {scenario.text}
      </button>
    )),
  };
});

vi.mock('@heroicons/react/24/solid', async (/* importOriginal */) => {
  return {
    ArrowPathIcon: (props: any) => <svg {...props} data-testid="arrow-path-icon" />,
  };
});

type Scenario = z.infer<typeof StoryChoiceSchema>;

const mockScenario1: Scenario = {
  text: 'Scenario 1',
  genre: 'Fantasy',
};
const mockScenario2: Scenario = {
  text: 'Scenario 2',
  genre: 'Sci-Fi',
};
const mockScenarios: Scenario[] = [mockScenario1, mockScenario2];

const mockOnScenarioSelect = vi.fn();
const mockOnFetchNewScenarios = vi.fn();

const defaultProps = {
  scenariosToDisplay: mockScenarios,
  onScenarioSelect: mockOnScenarioSelect,
  isLoadingSelection: false,
  isUserLoggedIn: true,
  onFetchNewScenarios: mockOnFetchNewScenarios,
  isLoadingScenarios: false,
  buttonBaseClasses: 'base-button',
  choiceButtonClasses: 'choice-button',
};

describe('ScenarioListDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    render(<ScenarioListDisplay {...defaultProps} />);
    expect(screen.getByTestId('scenario-selector-heading')).toHaveTextContent('Choose a scenario');
  });

  it('renders the correct number of scenario choice buttons', () => {
    render(<ScenarioListDisplay {...defaultProps} />);
    expect(screen.getAllByRole('button', { name: /Scenario [12]/ })).toHaveLength(2);
    expect(screen.getByText('Scenario 1')).toBeInTheDocument();
    expect(screen.getByText('Scenario 2')).toBeInTheDocument();
  });

  it('calls onScenarioSelect with the correct scenario when a button is clicked', () => {
    render(<ScenarioListDisplay {...defaultProps} />);
    const button1 = screen.getByText('Scenario 1');
    fireEvent.click(button1);
    expect(mockOnScenarioSelect).toHaveBeenCalledTimes(1);
    expect(mockOnScenarioSelect).toHaveBeenCalledWith(mockScenario1);
  });

  it('renders the "Generate New Scenarios" button when user is logged in', () => {
    render(<ScenarioListDisplay {...defaultProps} />);
    expect(screen.getByTestId('scenario-generate-new-button')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-generate-new-button')).toHaveTextContent(
      'Generate New Scenarios'
    );
  });

  it('does not render the "Generate New Scenarios" button when user is not logged in', () => {
    render(<ScenarioListDisplay {...defaultProps} isUserLoggedIn={false} />);
    expect(screen.queryByTestId('scenario-generate-new-button')).not.toBeInTheDocument();
  });

  it('calls onFetchNewScenarios when the "Generate New Scenarios" button is clicked', () => {
    render(<ScenarioListDisplay {...defaultProps} />);
    const generateButton = screen.getByTestId('scenario-generate-new-button');
    fireEvent.click(generateButton);
    expect(mockOnFetchNewScenarios).toHaveBeenCalledTimes(1);
  });

  it('disables the "Generate New Scenarios" button and shows loading state when isLoadingScenarios is true', () => {
    render(<ScenarioListDisplay {...defaultProps} isLoadingScenarios={true} />);
    const generateButton = screen.getByTestId('scenario-generate-new-button');
    expect(generateButton).toBeDisabled();
    expect(generateButton).toHaveTextContent('Generating...');
    expect(screen.getByTestId('arrow-path-icon')).toHaveClass('animate-spin');
  });

  it('does not show loading state when isLoadingScenarios is false', () => {
    render(<ScenarioListDisplay {...defaultProps} isLoadingScenarios={false} />);
    const generateButton = screen.getByTestId('scenario-generate-new-button');
    expect(generateButton).not.toBeDisabled();
    expect(generateButton).toHaveTextContent('Generate New Scenarios');
    expect(screen.getByTestId('arrow-path-icon')).not.toHaveClass('animate-spin');
  });
});
