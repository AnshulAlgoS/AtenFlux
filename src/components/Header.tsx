import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search, User, Loader2 } from 'lucide-react';
import AtenLogo from '@/assets/Aten.png';
import axios from 'axios';
import { getFallbackUrls } from '../config/api';

interface AuthorProfile {
  _id: string;
  name: string;
  outlet: string;
  profileLink: string;
  profilePic?: string;
  bio?: string;
  role?: string;
  email?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
  };
  articles: number;
  articleData?: Array<{
    title: string;
    url: string;
    publishDate?: string;
    section?: string;
  }>;
  topics?: string[];
  keywords?: string[];
  influence?: number;
  scrapedAt: Date;
}

export const Header = () => {
  const [showSearch, setShowSearch] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<AuthorProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
    { name: 'Top Journalists', path: '/top-journalists' },
    { name: 'Topics', path: '/topics' },
    { name: 'Contact', path: '/contact' }
  ];

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
        setMessage('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------- DIRECT DB SEARCH ----------
  const searchAuthor = async (name: string) => {
    setLoading(true);
    setMessage('Searching in database...');

    try {
      const urls = getFallbackUrls('/api/authors/search-by-name');

      let response = null;
      for (const url of urls) {
        try {
          response = await axios.get(url, {
            params: { name },
            timeout: 6000
          });
          break;
        } catch {}
      }

      if (!response) return null;

      return response.data.profile || null;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!authorName.trim()) {
      setMessage('Enter an author name.');
      return;
    }

    const found = await searchAuthor(authorName.trim());

    if (!found) {
      setMessage('❌ Not found in database.');
      return;
    }

    setSelectedProfile(found);
    setShowModal(true);
    setShowSearch(false);
    setMessage('');
    setAuthorName('');
  };

  const clearSearch = () => {
    setAuthorName('');
    setMessage('');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedProfile(null);
  };

  return (
    <>
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
              {/* Search Button */}
              <div className="relative" ref={searchRef}>
                <button
                  onClick={() => setShowSearch((prev) => !prev)}
                  className="p-2 hover:bg-primary/20 transition-colors border border-primary/30"
                >
                  <Search className="w-5 h-5 text-primary" />
                </button>

                {showSearch && (
                  <div className="absolute right-0 top-full mt-2 w-96 bg-card border-2 border-primary/40 shadow-2xl z-50">
                    {/* Input */}
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-mono text-muted-foreground mb-1">
                          Author Name *
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g., Koh Ewe"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          className="w-full bg-muted border border-primary/30 font-mono"
                          disabled={loading}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSearch}
                          disabled={loading}
                          className="flex-1 px-4 py-2 bg-primary text-primary-foreground font-mono text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          {loading ? 'Searching...' : 'Search'}
                        </button>

                        <button
                          onClick={clearSearch}
                          disabled={loading}
                          className="px-4 py-2 bg-muted font-mono text-sm hover:bg-muted/80 border"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Message */}
                    {message && (
                      <div className="px-4 pb-4">
                        <div className="p-3 bg-muted border text-xs font-mono text-foreground">
                          {message}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Profile */}
              <div className="relative group">
                <button className="w-10 h-10 bg-primary flex items-center justify-center text-card border">
                  <User className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-2 w-44 bg-card border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <NavLink to="/dashboard" className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono border-b">
                    Dashboard
                  </NavLink>
                  <NavLink to="/settings" className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono border-b">
                    Settings
                  </NavLink>
                  <NavLink to="/logout" className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono text-destructive">
                    Logout
                  </NavLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Author Modal */}
      {showModal && selectedProfile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border-2 border-primary/30 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-8 border-b border-primary/40">
              <button onClick={closeModal} className="absolute top-4 right-4 text-primary text-2xl">×</button>

              <div className="flex items-start gap-6">
                <div className="w-24 h-24 bg-muted border-2 border-primary flex items-center justify-center">
                  <span className="text-5xl font-bold text-primary">
                    {selectedProfile.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1">
                  <h2 className="text-3xl font-bold mb-3">{selectedProfile.name}</h2>

                  <div className="flex flex-wrap gap-3 mb-4">
                    <span className="px-4 py-1.5 bg-primary/10 border border-primary text-primary text-sm">
                      📰 {selectedProfile.outlet}
                    </span>

                    <span className="px-4 py-1.5 bg-secondary/10 border border-secondary text-secondary text-sm">
                      📝 {selectedProfile.articles} articles
                    </span>
                  </div>

                  {selectedProfile.profileLink && (
                    <a
                      href={selectedProfile.profileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition"
                    >
                      View Full Profile
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-8">
              {selectedProfile.bio && (
                <div className="mb-6 p-4 bg-muted/30 border">
                  <h3 className="text-lg font-semibold mb-2">Bio</h3>
                  <p>{selectedProfile.bio}</p>
                </div>
              )}

              {selectedProfile.topics && selectedProfile.topics.length > 0 && (
                <div className="mb-6 p-4 bg-muted/30 border">
                  <h3 className="text-lg font-semibold mb-3">Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.topics.map((topic, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-primary/10 border border-primary text-primary text-sm">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProfile.articleData && selectedProfile.articleData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Recent Articles</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedProfile.articleData.slice(0, 20).map((article, idx) => (
                      <a
                        key={idx}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 bg-muted/30 border hover:border-primary transition"
                      >
                        <div className="flex gap-3">
                          <div className="w-8 h-8 bg-primary/10 border border-primary flex items-center justify-center text-primary font-bold">
                            {idx + 1}
                          </div>

                          <div className="flex-1">
                            <h4 className="font-semibold mb-2">{article.title}</h4>
                            <div className="flex gap-3 text-xs">
                              {article.section && (
                                <span className="px-2 py-1 bg-accent/10 border border-accent text-accent">
                                  {article.section}
                                </span>
                              )}
                              {article.publishDate && (
                                <span className="text-muted-foreground">📅 {article.publishDate}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
