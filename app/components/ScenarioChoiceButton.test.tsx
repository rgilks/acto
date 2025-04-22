import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ScenarioChoiceButton from './ScenarioChoiceButton';
import { StoryChoiceSchema } from '@/lib/domain/schemas';
import { z } from 'zod';

// Mock data based on the schema
const mockScenario: z.infer<typeof StoryChoiceSchema> = {
  text: 'Test Scenario Text',
  genre: 'Fantasy',
  tone: 'Epic',
  visualStyle: 'Realistic',
};

describe('ScenarioChoiceButton', () => {
  const baseClasses = 'base-class';
  const choiceClasses = 'choice-class';

  it('renders the scenario text initially', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );
    expect(screen.getByText(mockScenario.text)).toBeInTheDocument();
    // Details should not be visible initially
    expect(screen.queryByText(/Genre:/)).not.toBeInTheDocument();
  });

  it('displays details and hides description when info button is clicked', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );

    // Ensure text is visible and details are not initially
    expect(screen.getByText(mockScenario.text)).toBeInTheDocument();
    expect(screen.queryByText(/Genre:/)).not.toBeInTheDocument();

    // Click the info button
    const infoButton = screen.getByTestId('scenario-info-button');
    fireEvent.click(infoButton);

    // Now details should be visible, and description text should be gone
    expect(screen.queryByText(mockScenario.text)).not.toBeInTheDocument();
    expect(screen.getByText(/Genre:/)).toBeInTheDocument();
    expect(screen.getByText(mockScenario.genre as string)).toBeInTheDocument(); // Check value
    expect(screen.getByText(/Tone:/)).toBeInTheDocument();
    expect(screen.getByText(mockScenario.tone as string)).toBeInTheDocument();
    expect(screen.getByText(/Style:/)).toBeInTheDocument();
    expect(screen.getByText(mockScenario.visualStyle as string)).toBeInTheDocument();
  });

  it('hides details and shows description when info button is clicked again', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );

    const infoButton = screen.getByTestId('scenario-info-button');
    // Click once to show details
    fireEvent.click(infoButton);
    expect(screen.queryByText(mockScenario.text)).not.toBeInTheDocument();
    expect(screen.getByText(/Genre:/)).toBeInTheDocument();

    // Click again to hide details
    fireEvent.click(infoButton);
    expect(screen.getByText(mockScenario.text)).toBeInTheDocument();
    expect(screen.queryByText(/Genre:/)).not.toBeInTheDocument();
  });

  it('calls onClick handler with the correct scenario when the card is clicked', () => {
    const handleClick = vi.fn();
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={handleClick}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );

    const card = screen.getByTestId('scenario-card'); // Target the card div
    fireEvent.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockScenario);
  });

  it('does not call onClick handler when the info button is clicked', () => {
    const handleClick = vi.fn();
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={handleClick}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );

    const infoButton = screen.getByTestId('scenario-info-button');
    fireEvent.click(infoButton);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('is styled correctly when isLoading is true', () => {
    const handleClick = vi.fn();
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={handleClick}
        isLoading={true}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );

    const card = screen.getByTestId('scenario-card'); // Target the card div
    // Check for loading styles on the card
    expect(card).toHaveClass('opacity-60');
    expect(card).toHaveClass('cursor-wait');

    // Try clicking the card while loading
    fireEvent.click(card);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies base and choice classes correctly to the card', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );
    const card = screen.getByTestId('scenario-card'); // Target the card div
    expect(card).toHaveClass(baseClasses);
    expect(card).toHaveClass(choiceClasses);
  });
});
