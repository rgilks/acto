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
  const isImageUrl = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    // Basic check for image extensions or common image hosting domains
    return (
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(value) ||
      value.includes('googleusercontent.com') ||
      value.includes('discordapp.com') ||
      value.includes('githubusercontent.com')
    );
  };

  const renderValue = (key: string, value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-500 italic">NULL</span>;
    }

    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }

    if (typeof value === 'string') {
      // Check for image URL first
      if (isImageUrl(value)) {
        return <img src={value} alt={key} className="max-w-xs max-h-48 h-auto rounded" />;
      }

      // Date check (expanding beyond created/updated)
      if (key.includes('_at') || key.includes('_login')) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toLocaleString(undefined, {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
            });
          }
        } catch (e) {
          console.info('Info: Could not parse date string:', value, e);
        }
      }
      // JSON Check
      try {
        const parsedJson: unknown = JSON.parse(value);
        if (nonNullObjectOrArraySchema.safeParse(parsedJson).success) {
          return (
            <pre className="bg-gray-700 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
              {' '}
              {/* Darker bg */}
              {JSON.stringify(parsedJson, null, 2)}
            </pre>
          );
        }
      } catch /* ignore if not JSON */ {
        /* ignore if not JSON */
      }

      return value;
    }

    if (nonNullObjectOrArraySchema.safeParse(value).success) {
      return (
        <pre className="bg-gray-700 p-2 rounded overflow-auto text-sm whitespace-pre-wrap break-words">
          {' '}
          {/* Darker bg */}
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
    <div className="p-4">
      {' '}
      {/* Added padding */}
      <button
        onClick={onBack}
        className={`${secondaryButtonClass} mb-6 px-3 py-1 sm:px-4 sm:py-2 flex items-center`} /* Increased mb */
      >
        <HeroChevronLeftIcon className="h-4 w-4 mr-1" aria-hidden="true" />
        Back to {selectedTable || 'Table'}
      </button>
      <div className="bg-gray-800 shadow overflow-hidden sm:rounded-lg border border-gray-600">
        {' '}
        {/* Dark theme */}
        <dl>
          {Object.entries(rowData).map(([key, value], index) => (
            <div
              key={key}
              className={`${index % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800'} px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6`} /* Darker alternating, grid layout */
            >
              <dt className="text-sm font-medium text-gray-400 break-words sm:col-span-1">{key}</dt>{' '}
              {/* Lighter key text */}
              <dd className="mt-1 text-sm text-gray-200 sm:mt-0 sm:col-span-2 break-words">
                {renderValue(key, value)}
              </dd>{' '}
              {/* Lighter value text */}
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};

export default RowDetailView;
