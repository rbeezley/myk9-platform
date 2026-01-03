import React from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/common/Progress";
import { Users, ClipboardList, ListChecks, Medal } from "lucide-react";

export interface TrialStatisticsData {
  judges: {
    total: number;
    active: number;
    onBreak: number;
    percentChange: number;
  };
  classes: {
    total: number;
    upcoming: number;
    completed: number;
    percentChange: number;
  };
  entries: {
    total: number;
    upcoming: number;
    completed: number;
    percentChange: number;
  };
  qualifiedRate: {
    percent: number;
    qualified: number;
    total: number;
    percentChange: number;
  };
}

interface TrialStatisticsProps {
  data: TrialStatisticsData;
}

const TrialStatistics: React.FC<TrialStatisticsProps> = ({ data }) => {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-4 text-foreground">Trial Statistics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 [&_.bg-card]:rounded-xl">
        {/* Judges */}
        <Card className="p-4 flex flex-col gap-2 bg-card text-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Judges</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.judges.total}</div>
          <div className="flex gap-2 text-xs text-green-600 dark:text-green-400">
            <span>{data.judges.percentChange > 0 ? `+${data.judges.percentChange}%` : `${data.judges.percentChange}%`}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Active: {data.judges.active}</span>
            <span>On Break: {data.judges.onBreak}</span>
          </div>
        </Card>
        {/* Total Classes */}
        <Card className="p-4 flex flex-col gap-2 bg-card text-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Total Classes</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.classes.total}</div>
<Progress value={(data.classes.completed / data.classes.total) * 100} color="bg-blue-500" className="my-1" />
          <div className="flex gap-2 text-xs text-green-600 dark:text-green-400">
            <span>{data.classes.percentChange > 0 ? `+${data.classes.percentChange}%` : `${data.classes.percentChange}%`}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Upcoming: {data.classes.upcoming}</span>
            <span>Completed: {data.classes.completed}</span>
          </div>
        </Card>
        {/* Total Entries */}
        <Card className="p-4 flex flex-col gap-2 bg-card text-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListChecks className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Total Entries</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.entries.total}</div>
<Progress value={(data.entries.completed / data.entries.total) * 100} color="bg-purple-500" className="my-1" />
          <div className="flex gap-2 text-xs text-green-600 dark:text-green-400">
            <span>{data.entries.percentChange > 0 ? `+${data.entries.percentChange}%` : `${data.entries.percentChange}%`}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Upcoming: {data.entries.upcoming}</span>
            <span>Completed: {data.entries.completed}</span>
          </div>
        </Card>
        {/* Qualified Rate */}
        <Card className="p-4 flex flex-col gap-2 bg-card text-foreground">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Medal className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Qualified Rate</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.qualifiedRate.percent}%</div>
<Progress value={data.qualifiedRate.percent} color="bg-green-500" className="my-1" />
          <div className="flex gap-2 text-xs text-green-600 dark:text-green-400">
            <span>{data.qualifiedRate.percentChange > 0 ? `+${data.qualifiedRate.percentChange}%` : `${data.qualifiedRate.percentChange}%`}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Qualified: {data.qualifiedRate.qualified}</span>
            <span>Total: {data.qualifiedRate.total}</span>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default TrialStatistics;
