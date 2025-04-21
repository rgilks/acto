'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTableNames, getTableData } from './actions';
import {
  ArrowPathIcon as HeroRefreshIcon,
  ChevronLeftIcon as HeroChevronLeftIcon,
  ChevronRightIcon as HeroChevronRightIcon,
} from '@heroicons/react/24/solid';
import { useSession } from 'next-auth/react';

// Type guard to check for non-null objects
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [selectedRowData, setSelectedRowData] = useState<Record<string, unknown> | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [totalRows, setTotalRows] = useState<number>(0);

  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchTableNames = async () => {
      if (!isMounted) return;

      setIsLoadingTables(true);
      setError(null);

      try {
        const result = await getTableNames();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isMounted) {
          if (result.error) {
            setError(result.error);
          } else if (result.data) {
            setTableNames(result.data);
          }
        }
      } catch (err) {
        console.error('Error fetching table names:', err);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isMounted) {
          setError('Failed to load tables');
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isMounted) {
          setIsLoadingTables(false);
        }
      }
    };

    void fetchTableNames();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchDataForTable = useCallback(async (tableName: string, page: number, limit: number) => {
    setIsLoadingData(true);
    setError(null);

    try {
      const result = await getTableData(tableName, page, limit);

      if (result.error) {
        setError(result.error);
        setTableData([]);
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
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  const handleTableSelect = async (tableName: string) => {
    setSelectedTable(tableName);
    setSelectedRowData(null);
    setCurrentPage(1);

    try {
      await fetchDataForTable(tableName, 1, rowsPerPage);
    } catch (error) {
      console.error('Error selecting table:', error);
    }
  };

  const handlePreviousPage = async () => {
    if (selectedTable && currentPage > 1) {
      try {
        await fetchDataForTable(selectedTable, currentPage - 1, rowsPerPage);
      } catch (error) {
        console.error('Error navigating to previous page:', error);
      }
    }
  };

  const handleNextPage = async () => {
    if (selectedTable && currentPage < Math.ceil(totalRows / rowsPerPage)) {
      try {
        await fetchDataForTable(selectedTable, currentPage + 1, rowsPerPage);
      } catch (error) {
        console.error('Error navigating to next page:', error);
      }
    }
  };

  const handleRefresh = async () => {
    if (selectedTable) {
      setCurrentPage(1);
      try {
        await fetchDataForTable(selectedTable, 1, rowsPerPage);
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    }
  };

  const handleBackFromDetail = () => {
    setSelectedRowData(null);
  };

  const totalPages = Math.ceil(totalRows / rowsPerPage);

  const estimatedRowHeight = 41;
  const minBodyHeight = rowsPerPage * estimatedRowHeight;

  const buttonBaseClass =
    'px-4 py-2 inline-flex items-center gap-2 border border-transparent rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const primaryButtonClass = `${buttonBaseClass} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
  const secondaryButtonClass = `${buttonBaseClass} text-gray-700 bg-gray-200 hover:bg-gray-300 focus:ring-indigo-500`;
  const refreshButtonClass = `${buttonBaseClass} text-white bg-green-600 hover:bg-green-700 focus:ring-green-500`;

  const RowDetailView = ({
    rowData,
    onBack,
  }: {
    rowData: Record<string, unknown>;
    onBack: () => void;
  }) => {
    const renderValue = (key: string, value: unknown) => {
      if (value === null || value === undefined) {
        return <span className="text-gray-500 italic">NULL</span>;
      }

      if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
      }

      if (typeof value === 'string' && (key === 'created_at' || key === 'updated_at')) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'medium',
            });
          }
        } catch (e) {
          console.info('Info: Could not parse date string:', value, e);
        }
      }

      if (typeof value === 'string') {
        const jsonMatch =
          value.match(/^.*?({\[\\s\\S]*?}).*?$/) || value.match(/^.*?(\\[[\\s\\S]*?\\]).*?$/);
        const potentialJson = jsonMatch ? jsonMatch[1] : value;
        try {
          const parsedJson = JSON.parse(potentialJson) as Record<string, unknown>;
          return (
            <pre className="bg-gray-100 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
              {JSON.stringify(parsedJson, null, 2)}
            </pre>
          );
        } catch (e) {
          console.info('Info: Could not parse potential JSON:', potentialJson, e);
        }
        return value;
      }

      if (isNonNullObject(value)) {
        return (
          <pre className="bg-gray-100 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
            {JSON.stringify(value, null, 2)}
          </pre>
        );
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }

      return '[Complex Value]';
    };

    return (
      <div>
        <button
          onClick={onBack}
          className={`${secondaryButtonClass} mb-4 px-3 py-1 sm:px-4 sm:py-2 flex items-center`}
        >
          <HeroChevronLeftIcon className="h-4 w-4 mr-1" aria-hidden="true" />
          Back to {selectedTable || 'Table'}
        </button>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
          <dl>
            {Object.entries(rowData).map(([key, value], index) => (
              <div
                key={key}
                className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} px-4 py-3 sm:px-6`}
              >
                <dt className="text-sm font-medium text-gray-600 break-words mb-1">{key}</dt>
                <dd className="text-sm text-gray-900 break-words">{renderValue(key, value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    );
  };

  const handleTableSelectClick = (tableName: string) => {
    void handleTableSelect(tableName);
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

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">acto admin</h1>
        <div className="mb-4">
          <Link href="/" className="text-blue-600 hover:underline">
            &larr; Back to App
          </Link>
        </div>

        {status === 'loading' ? (
          <p>Loading authentication status...</p>
        ) : status === 'unauthenticated' || !session?.user ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <h2 className="font-bold">Unauthorized</h2>
            <p>You must be logged in to access the admin area.</p>
          </div>
        ) : !(session.user as { isAdmin?: boolean }).isAdmin ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <h2 className="font-bold">Unauthorized</h2>
            <p>You do not have admin permissions.</p>
          </div>
        ) : (
          <>
            {selectedRowData ? (
              <RowDetailView rowData={selectedRowData} onBack={handleBackFromDetail} />
            ) : (
              <>
                {isLoadingTables && <p>Loading table names...</p>}
                {error && !selectedTable && (
                  <p className="text-red-500">Error loading tables: {error}</p>
                )}

                {!isLoadingTables && tableNames.length > 0 && (
                  <div className="mb-6">
                    <div className="flex gap-3 overflow-x-auto whitespace-nowrap py-2">
                      {tableNames.map((name) => (
                        <button
                          key={name}
                          onClick={() => {
                            handleTableSelectClick(name);
                          }}
                          className={`${buttonBaseClass} ${selectedTable === name ? primaryButtonClass : secondaryButtonClass}`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTable && (
                  <div className="min-h-[340px]">
                    {error && (
                      <p className="text-red-500 mb-4">
                        Error loading data for {selectedTable}: {error}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 mb-4 text-sm min-h-[38px]">
                      {currentPage === 1 ? (
                        <button
                          onClick={handleRefreshClick}
                          disabled={isLoadingData || !!error}
                          className={`${refreshButtonClass} ${totalRows === 0 || !!error ? 'invisible' : ''} px-3 py-1 sm:px-4 sm:py-2`}
                        >
                          <HeroRefreshIcon className="h-4 w-4" aria-hidden="true" />
                          <span>{isLoadingData ? 'Refreshing...' : 'Refresh'}</span>{' '}
                        </button>
                      ) : (
                        <button
                          onClick={handlePreviousPageClick}
                          disabled={currentPage <= 1 || isLoadingData}
                          className={secondaryButtonClass}
                        >
                          <HeroChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}

                      <span
                        className={`text-gray-300 ${totalRows === 0 || !!error ? 'invisible' : ''}`}
                      >
                        Page {currentPage} of {totalPages} (Total: {totalRows} rows)
                      </span>
                      <button
                        onClick={handleNextPageClick}
                        disabled={currentPage >= totalPages || isLoadingData}
                        className={secondaryButtonClass}
                      >
                        <HeroChevronRightIcon className="h-4 w-4" aria-hidden="true" />
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
                                      setSelectedRowData(row);
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
                                            : isNonNullObject(value)
                                              ? JSON.stringify(value)
                                              : typeof value === 'number' ||
                                                  typeof value === 'boolean'
                                                ? String(value)
                                                : '[Complex Value]'}
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              : !error && (
                                  <tr>
                                    <td
                                      colSpan={
                                        tableData.length > 0 ? Object.keys(tableData[0]).length : 1
                                      }
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
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
