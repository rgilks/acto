'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getTableData } from '../actions';
import {
  ArrowPathIcon as HeroRefreshIcon,
  ChevronLeftIcon as HeroChevronLeftIcon,
  ChevronRightIcon as HeroChevronRightIcon,
} from '@heroicons/react/24/solid';
import { refreshButtonClass, secondaryButtonClass } from '../constants';
import { nonNullObjectOrArraySchema } from '../schemas';

interface DataTableProps {
  tableName: string;
  onRowSelect: (row: Record<string, unknown>) => void;
}

const DataTable: React.FC<DataTableProps> = ({ tableName, onRowSelect }) => {
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDataForTable = useCallback(
    async (page: number, limit: number) => {
      setIsLoadingData(true);
      setError(null);

      try {
        const result = await getTableData(tableName, page, limit);

        if (result.error) {
          setError(result.error);
          setTableData([]);
          setTotalRows(0);
        } else if (result.data) {
          setTableData(result.data.data);
          setTotalRows(result.data.totalRows);
          setCurrentPage(result.data.page);
          setRowsPerPage(result.data.limit);
        }
      } catch (err) {
        console.error('Error fetching table data:', err);
        setError('Failed to load table data');
        setTableData([]);
        setTotalRows(0);
      } finally {
        setIsLoadingData(false);
      }
    },
    [tableName]
  );

  useEffect(() => {
    setCurrentPage(1);
    setTableData([]);
    setTotalRows(0);
    void fetchDataForTable(1, rowsPerPage);
  }, [tableName, fetchDataForTable, rowsPerPage]);

  const handlePreviousPage = async () => {
    if (currentPage > 1) {
      try {
        await fetchDataForTable(currentPage - 1, rowsPerPage);
      } catch (error) {
        console.error('Error navigating to previous page:', error);
      }
    }
  };

  const handleNextPage = async () => {
    if (currentPage < Math.ceil(totalRows / rowsPerPage)) {
      try {
        await fetchDataForTable(currentPage + 1, rowsPerPage);
      } catch (error) {
        console.error('Error navigating to next page:', error);
      }
    }
  };

  const handleRefresh = async () => {
    setCurrentPage(1);
    try {
      await fetchDataForTable(1, rowsPerPage);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const handlePreviousPageClick = () => {
    void handlePreviousPage();
  };

  const handleNextPageClick = () => {
    void handleNextPage();
  };

  const handleRefreshClick = () => {
    void handleRefresh();
  };

  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const estimatedRowHeight = 41;
  const minBodyHeight = rowsPerPage * estimatedRowHeight;

  return (
    <div className="min-h-[340px]">
      {error && (
        <p className="text-red-500 mb-4">
          Error loading data for {tableName}: {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 mb-4 text-sm min-h-[38px]">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousPageClick}
            disabled={currentPage <= 1 || isLoadingData}
            className={secondaryButtonClass}
          >
            <HeroChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={handleNextPageClick}
            disabled={currentPage >= totalPages || isLoadingData || totalRows === 0}
            className={secondaryButtonClass}
          >
            <HeroChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <span className={`text-gray-300 ${totalRows === 0 || !!error ? 'invisible' : ''}`}>
          Page {currentPage} of {totalPages} (Total: {totalRows} rows)
        </span>

        <button
          onClick={handleRefreshClick}
          disabled={isLoadingData || !!error}
          className={`${refreshButtonClass} ${totalRows === 0 || !!error ? 'invisible' : ''} px-3 py-1 sm:px-4 sm:py-2`}
        >
          <HeroRefreshIcon className="h-4 w-4" aria-hidden="true" />
          <span>{isLoadingData ? 'Refreshing...' : 'Refresh'}</span>{' '}
        </button>
      </div>

      <div
        className={`overflow-x-auto relative ${isLoadingData ? 'opacity-60' : ''} transition-opacity duration-200`}
      >
        {!error && (
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                {tableData.length > 0 ? (
                  Object.keys(tableData[0]).map((key) => (
                    <th
                      key={key}
                      className="py-1 px-2 sm:py-2 sm:px-4 border-b text-left text-gray-900 font-semibold"
                    >
                      {key}
                    </th>
                  ))
                ) : (
                  <th className="py-1 px-2 sm:py-2 sm:px-4 border-b text-left text-gray-900 font-semibold">
                    &nbsp;
                  </th>
                )}
              </tr>
            </thead>
            <tbody style={{ minHeight: `${minBodyHeight}px` }}>
              {!isLoadingData && tableData.length > 0
                ? tableData.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        onRowSelect(row);
                      }}
                    >
                      {Object.values(row).map((value, colIndex) => (
                        <td
                          key={colIndex}
                          className="py-1 px-2 sm:py-2 sm:px-4 border-b text-gray-900 text-sm"
                        >
                          {typeof value === 'string'
                            ? value.length > 100
                              ? `${value.substring(0, 100)}...`
                              : value
                            : value === null || value === undefined
                              ? 'NULL'
                              : nonNullObjectOrArraySchema.safeParse(value).success
                                ? JSON.stringify(value)
                                : typeof value === 'number' || typeof value === 'boolean'
                                  ? String(value)
                                  : '[Complex Value]'}
                        </td>
                      ))}
                    </tr>
                  ))
                : !error && (
                    <tr>
                      <td
                        colSpan={tableData.length > 0 ? Object.keys(tableData[0]).length : 1}
                        className="py-4 px-4 text-center text-gray-500"
                      >
                        {isLoadingData ? '' : 'No data found in this table.'}
                      </td>
                    </tr>
                  )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DataTable;
