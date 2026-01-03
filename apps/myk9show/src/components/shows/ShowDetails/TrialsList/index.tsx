import React from "react";
import { Button } from "@/components/ui/button";

import TrialItem from "./TrialItem";

export interface Trial {
  id: string;
  name: string;
  date: string;
  trialNumber: string;
  status: string;
  type?: string;
  judge?: string;
  entryFee?: string;
}

interface TrialsListProps {
  trials: Trial[];
  setShowAddTrialDialog: (open: boolean) => void;
  setSelectedTrial: (id: string) => void;
  setEditTrial: (trial: Partial<Trial>) => void;
  setShowEditTrialPanel: (open: boolean) => void;
}

const TrialsList: React.FC<TrialsListProps> = ({
  trials,
  setShowAddTrialDialog,
  setSelectedTrial,
  setEditTrial,
  setShowEditTrialPanel,
}) => (
  <div className="mb-12">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-card-foreground">Associated Trials</h2>
      <Button
        className="!rounded-button whitespace-nowrap cursor-pointer"
        onClick={() => setShowAddTrialDialog(true)}
      >
        <i className="fas fa-plus mr-2"></i>
        Add Trial
      </Button>
    </div>
    <div className="card dark:text-card-foreground">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th>Trial Name</th>
            <th>Date</th>
            <th>Trial Number</th>
            <th>Status</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {trials.map((trial) => (
            <TrialItem
              key={trial.id}
              trial={trial}
              setSelectedTrial={setSelectedTrial}
              setEditTrial={setEditTrial}
              setShowEditTrialPanel={setShowEditTrialPanel}
            />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default TrialsList;
