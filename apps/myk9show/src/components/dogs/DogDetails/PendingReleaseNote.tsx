import React from 'react';

/** MYK9-1178: one quiet line saying preliminary results will count once released. */
const PendingReleaseNote: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {count === 1
        ? '1 result is waiting for the secretary to release it, and will count once released.'
        : `${count} results are waiting for the secretary to release them, and will count once released.`}
    </p>
  );
};

export default PendingReleaseNote;
