import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Clock, Zap, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/stories', label: 'Stories', icon: BookOpen },
  { to: '/clip-forge', label: 'Clip Forge', icon: Scissors },
  { to: '/scheduler', label: 'Pipeline', icon: Clock },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Zap className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">StoryForge AI</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 p-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
