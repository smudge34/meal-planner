'use client';

interface Props {
  onGenerate: () => void;
  loading: boolean;
  hasWeek: boolean;
  streamProgress: number;
}

export default function GenerateButton({ onGenerate, loading, hasWeek, streamProgress }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onGenerate}
        disabled={loading}
        className={`relative overflow-hidden px-8 py-3.5 rounded-2xl font-semibold text-sm transition-all
          ${loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-900 text-white hover:bg-gray-700 active:scale-[0.98] shadow-sm'
          }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Planning your week…
          </span>
        ) : (
          hasWeek ? 'Generate New Week' : 'Generate This Week\'s Plan'
        )}
        {loading && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-gray-400 transition-all duration-300"
            style={{ width: `${streamProgress}%` }}
          />
        )}
      </button>
      {hasWeek && !loading && (
        <p className="text-xs text-gray-400 text-center">
          This will archive the current week and generate a fresh plan
        </p>
      )}
    </div>
  );
}
