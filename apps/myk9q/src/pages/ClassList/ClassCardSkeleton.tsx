import React from 'react';
import './ClassCardSkeleton.css';

export const ClassCardSkeleton: React.FC = () => {
  return (
    <div className="class-card skeleton">
      <div className="class-content">
        <div className="class-header">
          <div className="class-actions">
            <div className="skeleton-icon shimmer" />
            <div className="skeleton-icon shimmer" />
          </div>

          <div className="class-title-section">
            <div className="skeleton-class-name shimmer" />
            <div className="skeleton-judge-name shimmer" />
          </div>
        </div>

        <div className="class-info">
          <div className="class-info-row">
            <div className="skeleton-info-item shimmer" />
            <div className="skeleton-info-item shimmer" />
            <div className="skeleton-info-item shimmer" />
          </div>
        </div>

        <div className="class-status-section">
          <div className="skeleton-status-badge shimmer" />
          <div className="skeleton-preview shimmer" />
        </div>
      </div>
    </div>
  );
};

interface ClassCardSkeletonListProps {
  count?: number;
}

export const ClassCardSkeletonList: React.FC<ClassCardSkeletonListProps> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ClassCardSkeleton key={i} />
      ))}
    </>
  );
};
