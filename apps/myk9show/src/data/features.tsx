import { Search, MousePointer, User, CreditCard, Calendar as LucideCalendar, BarChart } from "lucide-react";
import type { Feature } from "../types";

const features: Feature[] = [
  {
    icon: <Search className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Browse Shows by Category",
    description: "Discover upcoming dog shows with powerful filtering by breed, location, date, and organization. Browse detailed show information and find competitions that match your dogs' categories."
  },
  {
    icon: <MousePointer className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Streamlined Entry Management",
    description: "Manage show entries efficiently with organized entry tracking, deadline monitoring, and status updates. Keep all your entry information accessible in one professional dashboard."
  },
  {
    icon: <User className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Complete Dog Management",
    description: "Maintain comprehensive profiles for all your dogs including pedigree information, health records, vaccination tracking, competition results, and performance history. Everything organized in one secure platform."
  },
  {
    icon: <LucideCalendar className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Show Organization Tools",
    description: "Create and manage professional dog shows with comprehensive tools for scheduling, class templates, judge assignments, and entry processing. Streamline event administration from start to finish."
  },
  {
    icon: <CreditCard className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Professional Payment Processing",
    description: "Handle entry fees, transactions, and financial records with secure payment processing integration. Track expenses and maintain organized financial records for tax purposes."
  },
  {
    icon: <BarChart className="w-8 h-8 text-primary" width={32} height={32} />,
    title: "Performance Analytics Dashboard",
    description: "View detailed analytics and insights about your dogs' competition performance, success rates, and progress trends. Access comprehensive reporting tools for informed decision-making."
  }
];

export default features;
