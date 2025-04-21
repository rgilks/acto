import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import TableSelector from './TableSelector';
import { getTableNames } from '../actions'; // Adjust path as needed

// Mock the server action
vi.mock('../actions', () => ({
  getTableNames: vi.fn(),
}));

const mockGetTableNames = getTableNames as Mock;

describe('TableSelector', () => {
  const mockOnTableSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    mockGetTableNames.mockResolvedValue({ data: [], error: null }); // Mock a response to avoid immediate error
    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);
    expect(screen.getByText(/loading table names.../i)).toBeInTheDocument();
  });

  it('should render error state if fetching tables fails', async () => {
    const errorMessage = 'Failed to fetch';
    mockGetTableNames.mockResolvedValue({ data: null, error: errorMessage });

    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);

    await waitFor(() => {
      expect(screen.getByText(`Error loading tables: ${errorMessage}`)).toBeInTheDocument();
    });
    expect(screen.queryByText(/loading table names.../i)).not.toBeInTheDocument();
  });

  it('should render error state if fetching throws an error', async () => {
    const errorMessage = 'Network Error';
    mockGetTableNames.mockRejectedValue(new Error(errorMessage));

    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);

    await waitFor(() => {
      // The component catches the error and sets a generic message
      expect(screen.getByText('Error loading tables: Failed to load tables')).toBeInTheDocument();
    });
    expect(screen.queryByText(/loading table names.../i)).not.toBeInTheDocument();
  });

  it('should render "No tables found" if no tables are returned', async () => {
    mockGetTableNames.mockResolvedValue({ data: [], error: null });

    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);

    await waitFor(() => {
      expect(screen.getByText(/no tables found./i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/loading table names.../i)).not.toBeInTheDocument();
  });

  it('should render table buttons when tables are fetched successfully', async () => {
    const tables = ['table1', 'table2'];
    mockGetTableNames.mockResolvedValue({ data: tables, error: null });

    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'table1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'table2' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/loading table names.../i)).not.toBeInTheDocument();
  });

  it('should call onTableSelect with the correct table name when a button is clicked', async () => {
    const tables = ['table1', 'table2'];
    mockGetTableNames.mockResolvedValue({ data: tables, error: null });

    render(<TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />);

    let button1;
    await waitFor(() => {
      button1 = screen.getByRole('button', { name: 'table1' });
      expect(button1).toBeInTheDocument();
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- waitFor should ensure button1 exists, but tsc disagrees
    if (button1) {
      fireEvent.click(button1);
    } else {
      throw new Error('Button table1 not found after wait');
    }

    expect(mockOnTableSelect).toHaveBeenCalledTimes(1);
    expect(mockOnTableSelect).toHaveBeenCalledWith('table1');
  });

  it('should apply correct classes and aria-pressed based on selectedTable prop', async () => {
    const tables = ['users', 'products', 'orders'];
    mockGetTableNames.mockResolvedValue({ data: tables, error: null });
    const selectedTable = 'products'; // Example selected table

    // Import button classes - adjust path if necessary
    const { primaryButtonClass, secondaryButtonClass } = await import('../constants');

    const { rerender } = render(
      <TableSelector selectedTable={null} onTableSelect={mockOnTableSelect} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: tables[0] })).toBeInTheDocument();
    });

    // Rerender with a selected table
    rerender(<TableSelector selectedTable={selectedTable} onTableSelect={mockOnTableSelect} />);

    await waitFor(() => {
      const selectedButton = screen.getByRole('button', { name: selectedTable });
      const otherButton = screen.getByRole('button', { name: 'users' });

      expect(selectedButton).toHaveClass(primaryButtonClass);
      expect(selectedButton).toHaveAttribute('aria-pressed', 'true');

      expect(otherButton).toHaveClass(secondaryButtonClass);
      expect(otherButton).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
