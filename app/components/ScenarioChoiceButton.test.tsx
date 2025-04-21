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

const mockScenarioMinimal: z.infer<typeof StoryChoiceSchema> = {
  text: 'Minimal Scenario Text',
};

describe('ScenarioChoiceButton', () => {
  const baseClasses = 'base-class';
  const choiceClasses = 'choice-class';

  it('renders the scenario text correctly', () => {
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
  });

  it('displays genre, tone, and visual style when provided', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );
    expect(screen.getByText(`Genre: ${mockScenario.genre}`)).toBeInTheDocument();
    expect(screen.getByText(`Tone: ${mockScenario.tone}`)).toBeInTheDocument();
    expect(screen.getByText(`Style: ${mockScenario.visualStyle}`)).toBeInTheDocument();
  });

  it('does not display genre, tone, and visual style when not provided', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenarioMinimal}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );
    expect(screen.queryByText(/Genre:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tone:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Style:/)).not.toBeInTheDocument();
  });

  it('calls onClick handler with the correct scenario when clicked', () => {
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

    const button = screen.getByTestId('scenario-choice-button');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockScenario);
  });

  it('is disabled and styled correctly when isLoading is true', () => {
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

    const button = screen.getByTestId('scenario-choice-button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-60');
    expect(button).toHaveClass('cursor-wait');

    // Try clicking the disabled button
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies base and choice classes correctly', () => {
    render(
      <ScenarioChoiceButton
        scenario={mockScenario}
        onClick={vi.fn()}
        isLoading={false}
        baseClasses={baseClasses}
        choiceClasses={choiceClasses}
      />
    );
    const button = screen.getByTestId('scenario-choice-button');
    expect(button).toHaveClass(baseClasses);
    expect(button).toHaveClass(choiceClasses);
  });
});
