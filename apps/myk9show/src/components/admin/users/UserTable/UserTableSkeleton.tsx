/**
 * UserTableSkeleton - Loading state with Apple-inspired shimmer effect
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DENSITY_CONFIG, APPLE_FONT_STYLE } from './types';
import type { DensityMode } from './types';

interface UserTableSkeletonProps {
  densityMode: DensityMode;
}

export const UserTableSkeleton: React.FC<UserTableSkeletonProps> = ({
  densityMode,
}) => {
  const density = DENSITY_CONFIG[densityMode];

  return (
    <div className="space-y-6" style={APPLE_FONT_STYLE}>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="apple-table-container">
        <Table className="apple-table">
          <TableHeader className="apple-table-header">
            <TableRow className="apple-table-header-row">
              <TableHead className="apple-table-header-cell w-16">
                <Skeleton className="h-5 w-5 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell">
                <Skeleton className="h-4 w-16 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell">
                <Skeleton className="h-4 w-20 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell">
                <Skeleton className="h-4 w-16 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell">
                <Skeleton className="h-4 w-24 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell">
                <Skeleton className="h-4 w-16 rounded-md" />
              </TableHead>
              <TableHead className="apple-table-header-cell w-16">
                <Skeleton className="h-4 w-12 rounded-md" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="apple-table-body">
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow
                key={i}
                className={`apple-table-skeleton-row ${density.rowHeight}`}
              >
                <TableCell className="apple-table-cell">
                  <Skeleton className="h-5 w-5 rounded-md" />
                </TableCell>
                <TableCell className="apple-table-cell">
                  <div className={`flex items-center ${density.spacing}`}>
                    <Skeleton
                      className={`${density.avatarSize} rounded-full ring-2 ring-border/20 ring-offset-2 ring-offset-background`}
                    />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32 rounded-md" />
                      <Skeleton className="h-3 w-20 rounded-md" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="apple-table-cell">
                  <div className="space-y-2">
                    <div
                      className={`flex items-center ${density.spacing}`}
                    >
                      <Skeleton className="h-6 w-6 rounded-lg" />
                      <Skeleton className="h-3 w-40 rounded-md" />
                    </div>
                    <div
                      className={`flex items-center ${density.spacing}`}
                    >
                      <Skeleton className="h-6 w-6 rounded-lg" />
                      <Skeleton className="h-3 w-28 rounded-md" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="apple-table-cell">
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </TableCell>
                <TableCell className="apple-table-cell">
                  <div
                    className={`flex items-center ${density.spacing}`}
                  >
                    <Skeleton className="h-5 w-5 rounded-md" />
                    <Skeleton className="h-3 w-24 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className="apple-table-cell">
                  <Skeleton className="h-6 w-16 rounded-full" />
                </TableCell>
                <TableCell className="apple-table-cell">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <Skeleton className="h-4 w-48 rounded-md" />
        <div className="flex items-center gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-9 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
};
