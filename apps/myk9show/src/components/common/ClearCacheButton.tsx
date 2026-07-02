import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';

export const ClearCacheButton: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    const didClear = await clearDevelopmentCache();
    if (!didClear) {
      setIsClearing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClearCache}
      disabled={isClearing}
      className="w-full justify-start text-xs"
    >
      {isClearing ? (
        <>
          <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
          Clearing...
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3 mr-2" />
          Clear Cache
        </>
      )}
    </Button>
  );
};
