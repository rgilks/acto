import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataTable from './DataTable'; // Updated import path
import { getTableData } from '../actions';

// Mock the server action
vi.mock('../actions', () => ({
  // Updated mock path
  getTableData: vi.fn(),
}));

// Mock Heroicons
vi.mock('@heroicons/react/24/solid', () => ({
  ArrowPathIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} data-testid="refresh-icon" />
  ),
  ChevronLeftIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} data-testid="chevron-left-icon" />
  ),
  ChevronRightIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} data-testid="chevron-right-icon" />
  ),
}));

const mockGetTableData = getTableData as ReturnType<typeof vi.fn>;

describe('DataTable Component', () => {
  const mockOnRowSelect = vi.fn();
  const tableName = 'test_table';

  beforeEach(() => {
    // Reset mocks before each test
    mockGetTableData.mockReset();
    mockOnRowSelect.mockReset();
  });

  it('should initially render and attempt to fetch data', async () => {
    // Arrange
    mockGetTableData.mockResolvedValue({
      data: { data: [], totalRows: 0, page: 1, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Assert
    // Check if the action was called on initial render
    await waitFor(() => {
      expect(mockGetTableData).toHaveBeenCalledTimes(1);
      expect(mockGetTableData).toHaveBeenCalledWith(tableName, 1, 10); // Initial fetch: page 1, default limit 10
    });

    // Check for "No data found" message since the mock returns an empty array
    expect(screen.getByText('No data found in this table.')).toBeInTheDocument();

    // Check that pagination controls are present but potentially disabled/invisible initially
    expect(screen.getByTestId('chevron-left-icon')).toBeInTheDocument();
    expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
  });

  it('should render data correctly when fetched', async () => {
    // Arrange
    const mockData = [
      { id: 1, name: 'Item 1', value: 100 },
      { id: 2, name: 'Item 2', value: 200 },
    ];
    mockGetTableData.mockResolvedValue({
      data: { data: mockData, totalRows: 2, page: 1, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Assert
    await waitFor(() => {
      // Check headers
      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('value')).toBeInTheDocument();
      // Check cell values
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
    });
    expect(screen.queryByText('No data found in this table.')).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument(); // Check pagination text
    expect(screen.getByText(/Total: 2 rows/)).toBeInTheDocument();
  });

  it('should handle pagination: next page', async () => {
    // Arrange: Initial load (page 1)
    const initialData = [{ id: 1, name: 'Page 1 Item' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: initialData, totalRows: 15, page: 1, limit: 10 },
      error: null,
    });

    // Arrange: Data for page 2
    const nextData = [{ id: 11, name: 'Page 2 Item' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: nextData, totalRows: 15, page: 2, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Wait for initial render and data
    await waitFor(() => {
      expect(screen.getByText('Page 1 Item')).toBeInTheDocument();
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    });

    // Click next page
    const nextButton = screen.getByTestId('chevron-right-icon').closest('button');
    expect(nextButton).toBeInTheDocument(); // Check button exists
    if (nextButton) fireEvent.click(nextButton);

    // Assert
    await waitFor(() => {
      // Check getTableData was called for the next page
      expect(mockGetTableData).toHaveBeenCalledTimes(2);
      expect(mockGetTableData).toHaveBeenCalledWith(tableName, 2, 10);
      // Check that page 2 data is displayed
      expect(screen.getByText('Page 2 Item')).toBeInTheDocument();
      // Check pagination text updated
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Page 1 Item')).not.toBeInTheDocument(); // Old data gone
  });

  it('should handle pagination: previous page', async () => {
    // Arrange: Initial load (page 2)
    const initialData = [{ id: 11, name: 'Page 2 Item' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: initialData, totalRows: 15, page: 2, limit: 10 },
      error: null,
    });

    // Arrange: Data for page 1
    const prevData = [{ id: 1, name: 'Page 1 Item' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: prevData, totalRows: 15, page: 1, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Wait for initial render and data (on page 2)
    await waitFor(() => {
      expect(screen.getByText('Page 2 Item')).toBeInTheDocument();
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    });

    // Click previous page
    const prevButton = screen.getByTestId('chevron-left-icon').closest('button');
    expect(prevButton).toBeInTheDocument(); // Check button exists
    if (prevButton) fireEvent.click(prevButton);

    // Assert
    await waitFor(() => {
      // Check getTableData was called for the previous page
      expect(mockGetTableData).toHaveBeenCalledTimes(2);
      expect(mockGetTableData).toHaveBeenCalledWith(tableName, 1, 10);
      // Check that page 1 data is displayed
      expect(screen.getByText('Page 1 Item')).toBeInTheDocument();
      // Check pagination text updated
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Page 2 Item')).not.toBeInTheDocument(); // Old data gone
  });

  it('should handle refresh button click', async () => {
    // Arrange
    const initialData = [{ id: 1, name: 'Initial' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: initialData, totalRows: 1, page: 1, limit: 10 },
      error: null,
    });

    const refreshedData = [{ id: 2, name: 'Refreshed' }];
    mockGetTableData.mockResolvedValueOnce({
      data: { data: refreshedData, totalRows: 1, page: 1, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    // Click refresh
    const refreshButton = screen.getByTestId('refresh-icon').closest('button');
    expect(refreshButton).toBeInTheDocument(); // Check button exists
    if (refreshButton) fireEvent.click(refreshButton);

    // Assert
    await waitFor(() => {
      // Check getTableData was called again for page 1
      expect(mockGetTableData).toHaveBeenCalledTimes(2);
      expect(mockGetTableData).toHaveBeenCalledWith(tableName, 1, 10); // Refresh goes to page 1
      // Check that refreshed data is displayed
      expect(screen.getByText('Refreshed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Initial')).not.toBeInTheDocument();
  });

  it('should display an error message when fetch fails', async () => {
    // Arrange
    const errorMessage = 'Database connection error';
    mockGetTableData.mockResolvedValue({ data: null, error: errorMessage });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Assert
    await waitFor(() => {
      expect(mockGetTableData).toHaveBeenCalledTimes(1);
    });

    // Check for error message
    const errorElement = screen.getByText(
      new RegExp(`Error loading data for ${tableName}: ${errorMessage}`)
    );
    expect(errorElement).toBeInTheDocument();
    expect(errorElement).toHaveClass('text-red-500');

    // Check that table body is not rendered / no data message isn't shown
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No data found in this table.')).not.toBeInTheDocument();
  });

  it('should call onRowSelect when a row is clicked', async () => {
    // Arrange
    const mockData = [
      { id: 1, name: 'Clickable Item' },
      { id: 2, name: 'Another Item' },
    ];
    mockGetTableData.mockResolvedValue({
      data: { data: mockData, totalRows: 2, page: 1, limit: 10 },
      error: null,
    });

    // Act
    render(<DataTable tableName={tableName} onRowSelect={mockOnRowSelect} />);

    // Wait for data to render
    const rowElement = await screen.findByText('Clickable Item');

    // Click the first data row (specifically the cell containing 'Clickable Item')
    fireEvent.click(rowElement);

    // Assert
    expect(mockOnRowSelect).toHaveBeenCalledTimes(1);
    expect(mockOnRowSelect).toHaveBeenCalledWith(mockData[0]); // Check it was called with the correct row data
  });
});
