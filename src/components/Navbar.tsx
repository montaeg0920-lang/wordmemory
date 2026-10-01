import React from 'react';
import { BookOpen, PlusCircle, BarChart3, Settings, Sparkles } from 'lucide-react';

export type TabType = 'home' | 'library' | 'import' | 'stats' | 'settings';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { id: 'home' as TabType, label: '홈', icon: Sparkles },
    { id: 'library' as TabType, label: '단어장', icon: BookOpen },
    { id: 'import' as TabType, label: '단어 추가', icon: PlusCircle },
    { id: 'stats' as TabType, label: '기억 통계', icon: BarChart3 },
    { id: 'settings' as TabType, label: '설정', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-2 sm:py-2.5 max-w-md mx-auto">
      <div className="flex justify-around items-center">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-indigo-600 font-semibold scale-105'
                  : 'text-slate-400 hover:text-slate-600 active:scale-95'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className="text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
