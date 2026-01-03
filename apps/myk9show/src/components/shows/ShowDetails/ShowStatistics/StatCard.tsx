import React from "react";
import { Stat } from "./index";

interface StatCardProps {
  stat: Stat;
}

const StatCard: React.FC<StatCardProps> = ({ stat }) => (
  <div className="p-5 bg-card-secondary rounded-xl transition-all duration-300 ease-in-out">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">{stat.title}</h3>
      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${stat.iconBg}`}>
        <i className={`${stat.iconClass} ${stat.iconColor} text-xl`}></i>
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</span>
        <span className={`text-sm ${stat.trendColor}`}>
          <i className={`${stat.trendIcon} mr-1`}></i>
          {stat.trend}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">{stat.detail1}</span>
        <span className="text-gray-600 dark:text-gray-400">{stat.detail2}</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${stat.progressColor}`} style={{ width: stat.progress }}></div>
      </div>
    </div>
  </div>
);

export default StatCard;
