'use client';

import React, { useState, useEffect } from 'react';
import { getTableNames } from '../actions';
import { primaryButtonClass, secondaryButtonClass } from '../constants';

interface TableSelectorProps {
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
}

const TableSelector: React.FC<TableSelectorProps> = ({ selectedTable, onTableSelect }) => {
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTableNames = async () => {
      setIsLoadingTables(true);
      setError(null);

      try {
        const result = await getTableNames();

        if (result.error) {
          setError(result.error);
        } else if (result.data) {
          setTableNames(result.data);
        }
      } catch (err) {
        console.error('Error fetching table names:', err);

        setError('Failed to load tables');
      } finally {
        setIsLoadingTables(false);
      }
    };

    void fetchTableNames();
  }, []);

  if (isLoadingTables) {
    return <p>Loading table names...</p>;
  }

  if (error) {
    return <p className="text-red-500 mb-4">Error loading tables: {error}</p>;
  }

  if (tableNames.length === 0) {
    return <p className="text-gray-500 mb-4">No tables found.</p>;
  }

  return (
    <div className="mb-6">
      <div className="flex gap-3 overflow-x-auto whitespace-nowrap py-2">
        {tableNames.map((name) => (
          <button
            key={name}
            onClick={() => {
              onTableSelect(name);
            }}
            className={selectedTable === name ? primaryButtonClass : secondaryButtonClass}
            aria-pressed={selectedTable === name}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TableSelector;
