import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import RowDetailView from './RowDetailView'; // Assuming the component is in the same directory

describe('RowDetailView', () => {
  const mockOnBack = vi.fn();
  const defaultProps = {
    rowData: {
      id: 1,
      name: 'Test Item',
      is_active: true,
      count: 100,
      description: null,
      config: { key: 'value', nested: [1, 2] },
      string_json: '{"a": 1, "b": "test"}',
      created_at: '2023-10-27T10:00:00.000Z',
      updated_at: '2023-10-27T11:30:00.000Z',
      complex: new Map([['key', 'value']]), // Example of a complex value
      undef: undefined,
      invalid_date_string: 'not a date',
      invalid_json_string: '{"a": 1, "b": ',
    },
    onBack: mockOnBack,
    selectedTable: 'Items',
  };

  it('renders without crashing', () => {
    render(<RowDetailView {...defaultProps} />);
    expect(screen.getByText('Back to Items')).toBeInTheDocument();
  });

  it('displays the correct table name in the back button', () => {
    render(<RowDetailView {...defaultProps} selectedTable="Users" />);
    expect(screen.getByText('Back to Users')).toBeInTheDocument();
  });

  it('defaults back button text if table name is null', () => {
    render(<RowDetailView {...defaultProps} selectedTable={null} />);
    expect(screen.getByText('Back to Table')).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', () => {
    render(<RowDetailView {...defaultProps} />);
    fireEvent.click(screen.getByText('Back to Items'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it.skip('renders keys and values correctly', () => {
    render(<RowDetailView {...defaultProps} />);

    Object.keys(defaultProps.rowData).forEach((key) => {
      expect(screen.getByText(key)).toBeInTheDocument();
    });

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    expect(screen.getAllByText('NULL')).toHaveLength(2);

    const configDt = screen.getByText('config');
    const configDd = configDt.nextElementSibling;
    expect(configDd).toBeInTheDocument();
    const configPre = configDd?.querySelector('pre');
    expect(configPre).toBeInTheDocument();
    expect(configPre?.textContent).toBe(JSON.stringify({ key: 'value', nested: [1, 2] }, null, 2));

    const stringJsonDt = screen.getByText('string_json');
    const stringJsonDd = stringJsonDt.nextElementSibling;
    expect(stringJsonDd).toBeInTheDocument();
    const stringJsonPre = stringJsonDd?.querySelector('pre');
    expect(stringJsonPre).toBeInTheDocument();
    expect(stringJsonPre?.textContent).toBe(JSON.stringify({ a: 1, b: 'test' }, null, 2));

    expect(screen.getByText(/Oct 27, 2023, (10|11):00:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Oct 27, 2023, (11:30:00 AM|12:30:00 PM)/)).toBeInTheDocument();

    expect(screen.getByText('[Complex Value]')).toBeInTheDocument();
    expect(screen.getByText('not a date')).toBeInTheDocument();
    expect(screen.getByText('{"a": 1, "b": ')).toBeInTheDocument();
  });

  it('applies alternating row background colors', () => {
    const { container } = render(<RowDetailView {...defaultProps} />);
    const dlElement = container.querySelector('dl');
    expect(dlElement).toBeInTheDocument();
    if (!dlElement) return;

    const rows = dlElement.children;
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]).toHaveClass('bg-gray-50');
    expect(rows[1]).toHaveClass('bg-white');
    expect(rows[2]).toHaveClass('bg-gray-50');
  });

  it('renders non-date string values correctly', () => {
    const props = { ...defaultProps, rowData: { regular_string: 'Just a string' } };
    render(<RowDetailView {...props} />);
    expect(screen.getByText('Just a string')).toBeInTheDocument();
  });

  it('renders boolean false correctly', () => {
    const props = { ...defaultProps, rowData: { is_disabled: false } };
    render(<RowDetailView {...props} />);
    expect(screen.getByText('False')).toBeInTheDocument();
  });

  it('handles empty rowData gracefully', () => {
    const props = { ...defaultProps, rowData: {} };
    const { container } = render(<RowDetailView {...props} />);
    expect(screen.getByText('Back to Items')).toBeInTheDocument();
    const dlElement = container.querySelector('dl');
    expect(dlElement).toBeInTheDocument();
    if (!dlElement) return;
    expect(dlElement.children.length).toBe(0);
  });
});
