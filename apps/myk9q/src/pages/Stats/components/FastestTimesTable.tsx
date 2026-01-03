import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Medal, Award } from 'lucide-react';
import type { FastestTimeEntry } from '../types/stats.types';

interface FastestTimesTableProps {
  data: FastestTimeEntry[];
  onDogClick?: (armbandNumber: string) => void;
}

const FastestTimesTable: React.FC<FastestTimesTableProps> = ({ data, onDogClick }) => {
  const isMobile = window.innerWidth < 640;
  const pageSize = isMobile ? 10 : 20;
  const [currentPage, setCurrentPage] = useState(0);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
  }, [data, currentPage, pageSize]);

  const totalPages = Math.ceil(data.length / pageSize);

  // Get rank icon
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-4 w-4" style={{ color: '#FFD700' }} />;
    if (rank === 2) return <Medal className="h-4 w-4" style={{ color: '#C0C0C0' }} />;
    if (rank === 3) return <Award className="h-4 w-4" style={{ color: '#CD7F32' }} />;
    return null;
  };

  return (
    <div className="fastest-times-table">
      {/* Table Container with horizontal scroll on mobile */}
      <div style={{
        overflowX: 'auto',
        borderRadius: 'var(--token-space-lg)',
        border: '1px solid var(--border)'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: isMobile ? '600px' : 'auto'
        }}>
          <thead>
            <tr style={{
              backgroundColor: 'var(--muted)',
              borderBottom: '2px solid var(--border)'
            }}>
              <th style={{
                padding: 'var(--token-space-lg)',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                width: '60px'
              }}>
                Rank
              </th>
              <th style={{
                padding: 'var(--token-space-lg)',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Dog
              </th>
              <th style={{
                padding: 'var(--token-space-lg)',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Handler
              </th>
              <th style={{
                padding: 'var(--token-space-lg)',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Breed
              </th>
              <th style={{
                padding: 'var(--token-space-lg)',
                textAlign: 'right',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((entry, index) => {
              const prevEntry = index > 0 ? paginatedData[index - 1] : null;
              const showRank = !prevEntry || prevEntry.timeRank !== entry.timeRank;

              return (
                <tr
                  key={entry.entryId}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    transition: 'background-color 0.2s ease',
                    cursor: onDogClick ? 'pointer' : 'default'
                  }}
                  onClick={() => onDogClick && onDogClick(entry.armbandNumber)}
                  onMouseEnter={(e) => {
                    if (onDogClick) {
                      e.currentTarget.style.backgroundColor = 'var(--accent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{
                    padding: 'var(--token-space-xl)',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '0.9375rem'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'var(--token-space-sm)'
                    }}>
                      {getRankIcon(entry.timeRank)}
                      {showRank ? entry.timeRank : '-'}
                    </div>
                  </td>
                  <td style={{
                    padding: 'var(--token-space-xl)',
                    fontSize: '0.9375rem',
                    color: 'var(--foreground)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{entry.dogCallName}</div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted-foreground)'
                      }}>
                        #{entry.armbandNumber}
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: 'var(--token-space-xl)',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)'
                  }}>
                    {entry.handlerName}
                  </td>
                  <td style={{
                    padding: 'var(--token-space-xl)',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)'
                  }}>
                    {entry.dogBreed}
                  </td>
                  <td style={{
                    padding: 'var(--token-space-xl)',
                    textAlign: 'right',
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--primary)'
                  }}>
                    {entry.searchTimeSeconds.toFixed(2)}s
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--token-space-xl) 0',
          marginTop: 'var(--token-space-xl)'
        }}>
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--token-space-sm)',
              padding: 'var(--token-space-md) var(--token-space-lg)',
              backgroundColor: currentPage === 0 ? 'var(--muted)' : 'var(--primary)',
              color: currentPage === 0 ? 'var(--muted-foreground)' : 'white',
              border: 'none',
              borderRadius: 'var(--token-space-md)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 'var(--min-touch-target)'
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <span style={{
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)'
          }}>
            Page {currentPage + 1} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--token-space-sm)',
              padding: 'var(--token-space-md) var(--token-space-lg)',
              backgroundColor: currentPage === totalPages - 1 ? 'var(--muted)' : 'var(--primary)',
              color: currentPage === totalPages - 1 ? 'var(--muted-foreground)' : 'white',
              border: 'none',
              borderRadius: 'var(--token-space-md)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 'var(--min-touch-target)'
            }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FastestTimesTable;