import React from 'react';
import { ChevronLeftIcon as HeroChevronLeftIcon } from '@heroicons/react/24/solid';
import { secondaryButtonClass } from '../constants';
import { nonNullObjectOrArraySchema } from '../schemas';

const RowDetailView = ({
  rowData,
  onBack,
  selectedTable,
}: {
  rowData: Record<string, unknown>;
  onBack: () => void;
  selectedTable: string | null;
}) => {
  const renderValue = (key: string, value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-500 italic">NULL</span>;
    }

    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }

    if (typeof value === 'string') {
      if (key === 'created_at' || key === 'updated_at') {
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

      try {
        const parsedJson: unknown = JSON.parse(value);
        if (nonNullObjectOrArraySchema.safeParse(parsedJson).success) {
          return (
            <pre className="bg-gray-100 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
              {JSON.stringify(parsedJson, null, 2)}
            </pre>
          );
        }
      } catch (e) {
        console.info('Info: Could not parse string as JSON object/array:', value, e);
      }

      return value;
    }

    if (nonNullObjectOrArraySchema.safeParse(value).success) {
      return (
        <pre className="bg-gray-100 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    if (typeof value === 'number') {
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

export default RowDetailView;
