import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { CheckInStatus } from '@myk9/core';
import type { CheckInRequest } from '@/types/exhibitor-types';
import { useClassCheckInData } from '@/hooks/queries/useClassCheckInData';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { ClassCheckIn } from '@/components/exhibitor/ClassCheckIn';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function toCheckInStatus(s: 'present' | 'scratch'): CheckInStatus {
  return s === 'present' ? 'checked-in' : 'pulled';
}

const ClassCheckInPage: React.FC = () => {
  const { entryId = '' } = useParams<{ entryId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useClassCheckInData(entryId);
  const checkInMutation = useCheckInMutation();

  const handleCheckIn = async (req: CheckInRequest): Promise<void> => {
    await checkInMutation.mutateAsync({
      entryId: req.entryId,
      newStatus: toCheckInStatus(req.status),
    });
  };

  const handleBack = () => {
    navigate('/exhibitor/show-day');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Unable to load check-in. Please try again.</p>
            <Button onClick={() => navigate(0)} variant="outline" className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data == null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Entry not found.</p>
            <Button onClick={handleBack} variant="outline" className="mt-4">
              Back to Show Day
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ClassCheckIn
      classInfo={data}
      availableHandlers={[]}
      onCheckIn={handleCheckIn}
      onBack={handleBack}
    />
  );
};

export default ClassCheckInPage;
