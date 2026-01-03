import React from "react";
import ThreeDotMenu from "@/components/common/ThreeDotMenu";
import { Badge } from "@/components/ui/badge";

interface ShowMainCardProps {
  showData: { 
    name: string; 
    dates?: string; 
    location?: string; 
    status?: string;
    type?: string;
    date?: string;
    endDate?: string;
    clubName?: string;
    clubAddress?: string;
    clubEmail?: string;
    chairman?: string;
    secretary?: string;
    chiefSteward?: string;
    entryOpenDate?: string;
    entryCloseDate?: string;
    preEntryFee?: string;
    dayOfShowFee?: string;
    assignedJudges?: Array<{
      judgeId: string;
      judgeName: string;
      assignedClasses?: string[];
    }>;
  };
  handleEditShow: () => void;
  setShowDeleteDialog: () => void;
}

const ShowMainCard: React.FC<ShowMainCardProps> = ({ showData, handleEditShow, setShowDeleteDialog }) => (
  <div className="relative">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-6 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{showData.name}</h2>
          <Badge variant="outline" className="ml-2 capitalize px-3 py-1 text-sm font-medium dark:bg-zinc-800 dark:text-gray-100 dark:border-zinc-600">
            {showData.status}
          </Badge>
        </div>
        <div className="z-10">
          <ThreeDotMenu
            onEdit={handleEditShow}
            onDelete={setShowDeleteDialog}
            editLabel="Edit Show"
          />
        </div>
      </div>

    {/* Show Info Grid */}
      {/* Show Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Show Type</div>
          <div className="text-gray-900 dark:text-gray-100 font-medium">{showData.type}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-4 mb-1">Location</div>
          <div className="text-gray-900 dark:text-gray-100 font-medium">{showData.location}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Start Date</div>
          <div className="text-gray-900 dark:text-gray-100 font-medium">{showData.date}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-4 mb-1">End Date</div>
          <div className="text-gray-900 dark:text-gray-100 font-medium">{showData.endDate}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Club</div>
          <div className="text-gray-900 dark:text-gray-100 font-medium">{showData.clubName || 'National Kennel Club'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">{showData.clubAddress || '123 Kennel Drive, Dogtown, CA 94123'}</div>
          <a href={`mailto:${showData.clubEmail || 'contact@nationalkennelclub.com'}`} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1 flex items-center gap-1 break-all">
            <i className="fas fa-envelope text-xs flex-shrink-0"></i>
            {showData.clubEmail || 'contact@nationalkennelclub.com'}
          </a>
        </div>
      </div>

      <hr className="my-6" />

      {/* Key Personnel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Chairman</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.chairman}</div>
          <a href="mailto:thomas.green@nationalkennelclub.com" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 mt-1 break-all">
            <i className="fas fa-envelope text-xs flex-shrink-0"></i>
            thomas.green@nationalkennelclub.com
          </a>
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Secretary</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.secretary}</div>
          <a href="mailto:jennifer.white@nationalkennelclub.com" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 mt-1 break-all">
            <i className="fas fa-envelope text-xs flex-shrink-0"></i>
            jennifer.white@nationalkennelclub.com
          </a>
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Chief Steward</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.chiefSteward}</div>
          <a href="mailto:david.miller@nationalkennelclub.com" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 mt-1 break-all">
            <i className="fas fa-envelope text-xs flex-shrink-0"></i>
            david.miller@nationalkennelclub.com
          </a>
        </div>
      </div>

      <hr className="my-6" />

      {/* Entry Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-2">
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Entry Open Date</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.entryOpenDate}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Entry Close Date</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.entryCloseDate}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pre-Entry Fee</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.preEntryFee}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Day of Show Fee</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{showData.dayOfShowFee || showData.preEntryFee}</div>
        </div>
      </div>

      {/* Assigned Judges Section */}
      {showData.assignedJudges && showData.assignedJudges.length > 0 && (
        <>
          <hr className="my-6" />
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Assigned Judges</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showData.assignedJudges.map((judge) => (
                <div key={judge.judgeId} className="p-4 border rounded-lg dark:border-zinc-600">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{judge.judgeName}</div>
                  {judge.assignedClasses && judge.assignedClasses.length > 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Assigned to {judge.assignedClasses.length} class{judge.assignedClasses.length !== 1 ? 'es' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
  </div>
);

export default ShowMainCard;
