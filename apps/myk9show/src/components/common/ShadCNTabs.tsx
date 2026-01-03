import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps extends React.ComponentProps<"div"> {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function Tabs({ children, className, ...props }: Omit<TabsProps, 'value' | 'onValueChange'>) {
  return (
    <div className={cn("w-full", className)} {...props}>
      {children}
    </div>
  );
}

interface TabsListProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

export function TabsList({ children, className, ...props }: TabsListProps) {
  return (
    <div className={cn("flex gap-2 border-b mb-4", className)} {...props}>
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

export function TabsTrigger({ children, className, ...props }: Omit<TabsTriggerProps, 'value'>) {
  return (
    <button
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 border-transparent hover:border-primary focus:outline-none",
        className
      )}
      {...props}
      data-value={""}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.ComponentProps<"div"> {
  value: string;
  children: React.ReactNode;
}

export function TabsContent({ children, className, ...props }: Omit<TabsContentProps, 'value'>) {
  return (
    <div className={cn("py-4", className)} data-value={""} {...props}>
      {children}
    </div>
  );
}
