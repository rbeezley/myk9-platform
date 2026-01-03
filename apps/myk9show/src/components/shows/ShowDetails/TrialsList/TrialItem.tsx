import React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Trial } from "./index";

interface TrialItemProps {
  trial: Trial;
  setSelectedTrial: (id: string) => void;
  setEditTrial: (trial: Partial<Trial>) => void;
  setShowEditTrialPanel: (open: boolean) => void;
}

const TrialItem: React.FC<TrialItemProps> = ({
  trial,
  setSelectedTrial,
  setEditTrial,
  setShowEditTrialPanel,
}) => {
  const navigate = useNavigate();

  const handleViewTrial = () => {
    navigate(`/trials/${trial.id}`);
  };

  return (
  <tr>
    <td className="font-medium">{trial.name}</td>
    <td>{trial.date}</td>
    <td>{trial.trialNumber}</td>
    <td>
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100">
        {trial.status}
      </Badge>
    </td>
    <td className="text-right">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 !rounded-full hover:bg-gray-100 cursor-pointer">
            <i className="fas fa-ellipsis-v text-gray-600"></i>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-0">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              className="flex items-center justify-start h-9 px-3 gap-2 hover:bg-gray-100 cursor-pointer"
              onClick={handleViewTrial}
            >
              <i className="fas fa-eye text-gray-600 w-4"></i>
              View Details
            </Button>
            <Button
              variant="ghost"
              className="flex items-center justify-start h-9 px-3 gap-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => {
                setSelectedTrial(trial.id);
                setEditTrial({
                  name: trial.name,
                  date: trial.date,
                  trialNumber: trial.trialNumber,
                  status: trial.status,
                  type: trial.type || "",
                  judge: trial.judge || "",
                  entryFee: trial.entryFee || "",
                });
                setShowEditTrialPanel(true);
              }}
            >
              <i className="fas fa-edit text-gray-600 w-4"></i>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="flex items-center justify-start h-9 px-3 gap-2 hover:bg-gray-100 text-red-600 cursor-pointer"
            >
              <i className="fas fa-trash-alt w-4"></i>
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </td>
  </tr>
  );
};

export default TrialItem;
