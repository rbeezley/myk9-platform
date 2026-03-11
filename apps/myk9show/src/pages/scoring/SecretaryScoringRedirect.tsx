/**
 * SecretaryScoringRedirect
 *
 * Redirect component that loads entries for a class and navigates
 * to the first unscored entry's SecretaryScoringPage.
 * If all entries are scored, shows a completion message.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

export function SecretaryScoringRedirect() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [allScored, setAllScored] = useState(false);

  useEffect(() => {
    async function findFirstUnscored() {
      if (!classId) return;

      const entries = await replicatedEntriesTable.getEntriesByClass(classId);
      const sorted = [...entries].sort((a, b) => (a.runOrder ?? 0) - (b.runOrder ?? 0));

      const unscored = sorted.find(e => !e.isScored);
      if (unscored) {
        navigate(`/scoring/secretary/classes/${classId}/entries/${unscored.id}`, { replace: true });
      } else if (sorted.length > 0) {
        // All scored — navigate to first entry for review
        setAllScored(true);
      } else {
        navigate(-1);
      }
    }

    findFirstUnscored();
  }, [classId, navigate]);

  if (allScored) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="text-lg font-medium">All entries have been scored</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default SecretaryScoringRedirect;
