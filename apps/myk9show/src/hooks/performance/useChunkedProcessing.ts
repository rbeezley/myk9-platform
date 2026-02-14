import { useState, useCallback } from 'react';

export function useChunkedProcessing<T, R>() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<R[]>([]);

  const processInChunks = useCallback(async (
    data: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 100
  ) => {
    setProcessing(true);
    setProgress(0);
    setResults([]);

    try {
      const allResults: R[] = [];
      const totalChunks = Math.ceil(data.length / chunkSize);

      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const chunkResults = await processor(chunk);
        allResults.push(...chunkResults);

        const currentChunk = Math.floor(i / chunkSize) + 1;
        setProgress((currentChunk / totalChunks) * 100);

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setResults(allResults);
      return allResults;
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    processing,
    progress,
    results,
    processInChunks
  };
}
