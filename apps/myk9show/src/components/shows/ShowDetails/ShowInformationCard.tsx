import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import type { ShowFormData } from "./dialogs/EditShowDialog";

interface ShowInformationCardProps {
  showData: ShowFormData;
  handleEditShow: () => void;
  setShowDeleteDialog: () => void;
}

const ShowInformationCard: React.FC<ShowInformationCardProps> = ({ showData, handleEditShow, setShowDeleteDialog }) => (
  <div className="col-span-1 lg:col-span-2 w-full">
    <div className="p-6 bg-card dark:bg-card rounded-xl shadow-sm">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-muted-foreground">{showData.name}</h2>
          <Badge className="px-3 py-1 rounded-full text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
            {showData.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 !rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 focus:ring-2 focus:ring-primary/60 focus:outline-none cursor-pointer z-10">
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-0">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  className="flex items-center justify-start h-9 px-3 gap-2 hover:bg-muted dark:hover:bg-zinc-800 cursor-pointer"
                  onClick={handleEditShow}
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="flex items-center justify-start h-9 px-3 gap-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 cursor-pointer"
                  onClick={setShowDeleteDialog}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  Delete
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Show Type</h3>
          <p className="text-muted-foreground">{showData.type}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Location</h3>
          <p className="text-muted-foreground">Central Exhibition Center, Dogtown</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Start Date</h3>
          <p className="text-muted-foreground">{showData.startDate ? new Date(showData.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">End Date</h3>
          <p className="text-muted-foreground">{showData.endDate ? new Date(showData.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</p>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-6 mb-8">
        <h3 className="text-lg font-semibold text-muted-foreground mb-4">Key Personnel</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Chairman</h4>
            <p className="text-muted-foreground">{showData.chairman}</p>
            <a href="mailto:thomas.green@nationalkennelclub.com" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1 flex items-center gap-1 break-all">
              <i className="fas fa-envelope text-xs flex-shrink-0"></i>
              thomas.green@nationalkennelclub.com
            </a>
          </div>
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Secretary</h4>
            <p className="text-muted-foreground">{showData.secretary}</p>
            <a href="mailto:jennifer.white@nationalkennelclub.com" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1 flex items-center gap-1 break-all">
              <i className="fas fa-envelope text-xs flex-shrink-0"></i>
              jennifer.white@nationalkennelclub.com
            </a>
          </div>
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Chief Steward</h4>
            <p className="text-muted-foreground">{showData.chiefSteward}</p>
            <a href="mailto:david.miller@nationalkennelclub.com" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1 flex items-center gap-1 break-all">
              <i className="fas fa-envelope text-xs flex-shrink-0"></i>
              david.miller@nationalkennelclub.com
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
        <h3 className="text-lg font-semibold text-muted-foreground mb-4">Entry Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Entry Open Date</h4>
            <p className="text-muted-foreground">{showData.entryOpenDate ? new Date(showData.entryOpenDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</p>
          </div>
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Entry Close Date</h4>
            <p className="text-muted-foreground">{showData.entryCloseDate ? new Date(showData.entryCloseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}</p>
          </div>
          <div className="bg-card-secondary p-4 rounded-xl">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Pre-Entry Fee</h4>
            <p className="text-muted-foreground">{showData.preEntryFee}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ShowInformationCard;
