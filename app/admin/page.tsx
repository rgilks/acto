'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import RowDetailView from './components/RowDetailView';
import DataTable from './components/DataTable';
import TableSelector from './components/TableSelector';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedRowData, setSelectedRowData] = useState<Record<string, unknown> | null>(null);

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    setSelectedRowData(null);
  };

  const handleBackFromDetail = () => {
    setSelectedRowData(null);
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
              <RowDetailView
                rowData={selectedRowData}
                onBack={handleBackFromDetail}
                selectedTable={selectedTable}
              />
            ) : (
              <>
                <TableSelector selectedTable={selectedTable} onTableSelect={handleTableSelect} />

                {selectedTable && (
                  <DataTable tableName={selectedTable} onRowSelect={setSelectedRowData} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
