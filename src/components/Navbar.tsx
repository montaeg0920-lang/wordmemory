import React from 'react';
import { BarChart3, BookOpen, Home, Plus, Settings } from 'lucide-react';

export type TabType = 'home' | 'library' | 'import' | 'stats' | 'settings';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'home', label: '오늘', icon: Home },
  { id: 'library', label: '단어장', icon: BookOpen },
  { id: 'import', label: '추가', icon: Plus },
  { id: 'stats', label: '기록', icon: BarChart3 },
  { id: 'settings', label: '설정', icon: Settings },
];

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => (
  <nav className="fixed bottom-0 inset-x-0 z-40 bg-paper/95 backdrop-blur border-t border-line safe-bottom" aria-label="주요 메뉴">
    <div className="max-w-md mx-auto flex justify-around pt-1.5">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = currentTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 w-16 py-1 rounded-lg ${active ? 'text-ink' : 'text-muted'}`}
          >
            <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.1 : 1.7} />
            <span className={`text-[12px] ${active ? 'font-semibold' : ''}`}>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
