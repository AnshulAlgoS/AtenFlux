import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search, User } from 'lucide-react';
import AtenLogo from '@/assets/Aten.png';

export const Header = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
    { name: 'Top Journalists', path: '/top-journalists' },
    { name: 'Topics', path: '/topics' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-primary/20 backdrop-blur-sm shadow-md">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <NavLink to="/" className="flex items-center space-x-2">
            <img src={AtenLogo} alt="ATENFLUX" className="w-14 h-14 object-contain" />
            <span className="text-2xl font-bold text-primary font-mono tracking-tight">
              ATENFLUX
            </span>
          </NavLink>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-mono transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`
                }
              >
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center space-x-4">
            {/* Animated Search */}
            <div className="relative">
              <button
                onClick={() => setShowSearch((prev) => !prev)}
                className="p-2 rounded hover:bg-primary/20 transition-colors"
              >
                <Search className="w-5 h-5 text-primary" />
              </button>
              {showSearch && (
                <Input
                  type="text"
                  placeholder="Search journalist or outlet"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="absolute right-0 top-full mt-2 w-64 pl-10 bg-muted border border-primary/40 text-foreground placeholder:text-muted-foreground shadow-lg rounded-none"
                />
              )}
            </div>

            {/* Mini Live Stats */}
            <div className="flex items-center px-3 py-1 bg-muted border border-primary/30 text-sm font-mono rounded-none animate-pulse-glow">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
              <span>Top Influencer: Jane D.</span>
            </div>

            {/* Profile Dropdown */}
            <div className="relative group">
              <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-card hover:scale-105 transition-transform">
                <User className="w-5 h-5" />
              </button>
              <div className="absolute right-0 mt-2 w-44 bg-card border border-primary/20 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <NavLink
                  to="/dashboard"
                  className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono"
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/settings"
                  className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono"
                >
                  Settings
                </NavLink>
                <NavLink
                  to="/logout"
                  className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono"
                >
                  Logout
                </NavLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
