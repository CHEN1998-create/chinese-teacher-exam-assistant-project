"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

export function Tabs({ tabs, activeTab, onChange, children }: TabsProps) {
  return (
    <div>
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps) {
  if (id !== activeTab) return null;
  return <div>{children}</div>;
}
