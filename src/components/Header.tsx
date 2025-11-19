import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search, User, X, Loader2 } from 'lucide-react';
import AtenLogo from '@/assets/Aten.png';
import axios from 'axios';
import { getFallbackUrls, API_ENDPOINTS } from '../config/api';

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
  const [outletName, setOutletName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<AuthorProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
    { name: 'Top Journalists', path: '/top-journalists' },
    { name: 'Topics', path: '/topics' },
    { name: 'Contact', path: '/contact' },
  ];

  // Close search dropdown when clicking outside
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

  const searchInDatabase = async (outlet: string, author: string) => {
    setLoading(true);
    setMessage('Searching in database...');
    
    try {
      const urls = getFallbackUrls(API_ENDPOINTS.AUTHOR_PROFILES);
      
      let response;
      for (const url of urls) {
        try {
          response = await axios.get(url, {
            params: { outlet: outlet.toLowerCase(), limit: 500 },
            timeout: 10000
          });
          break;
        } catch (err) {
          continue;
        }
      }

      if (!response) {
        return null;
      }

      const profiles = response.data.profiles || [];
      
      // Find exact match by name
      const found = profiles.find((p: AuthorProfile) => 
        p.name.toLowerCase().trim() === author.toLowerCase().trim()
      );

      return found || null;
    } catch (error) {
      console.error('Database search error:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const scrapeAuthor = async (outlet: string, author: string) => {
    setScraping(true);
    setMessage(`🔍 Scraping ${outlet} for ${author}...`);
    
    try {
      const urls = getFallbackUrls('/api/authors/scrape-specific');
      
      let response;
      for (const url of urls) {
        try {
          response = await axios.post(url, 
            { outlet, authorName: author },
            { timeout: 120000 } // 2 minutes
          );
          break;
        } catch (err) {
          continue;
        }
      }

      if (!response) {
        setMessage('❌ Failed to scrape. Backend not responding.');
        return false;
      }

      if (response.data.error) {
        setMessage(`❌ ${response.data.error}`);
        return false;
      }

      // The backend returns success immediately and scrapes in background
      // So we need to wait and poll for the result
      if (response.data.success) {
        setMessage(`⏳ Scraping started... Checking database every 3 seconds...`);
        
        // Wait for scraping to complete (up to 2 minutes)
        let attempts = 0;
        const maxAttempts = 40; // 2 minutes (40 * 3 seconds)
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
          attempts++;
          
          const elapsed = attempts * 3;
          setMessage(`⏳ Scraping in progress... (${elapsed}s elapsed, checking database...)`);
          
          // Try to find in database
          const found = await searchInDatabase(outlet, author);
          if (found) {
            setMessage('✅ Author scraped and found in database!');
            setScraping(false);
            setSelectedProfile(found);
            setShowModal(true);
            setShowSearch(false);
            return true;
          }
        }
        
        setMessage('⏰ Scraping is taking longer than expected. Please search again in 30 seconds.');
        return false;
      }

      setMessage('❌ Unexpected response from server');
      return false;
    } catch (error: any) {
      console.error('Scraping error:', error);
      setMessage(`❌ Scraping failed: ${error.message}`);
      return false;
    } finally {
      setScraping(false);
    }
  };

  const handleSearch = async () => {
    if (!outletName.trim() || !authorName.trim()) {
      setMessage('⚠️ Please enter both outlet and author name');
      return;
    }

    // Step 1: Search in database
    const found = await searchInDatabase(outletName, authorName);

    if (found) {
      setMessage('✅ Found in database!');
      setSelectedProfile(found);
      setShowModal(true);
      setShowSearch(false);
      setOutletName('');
      setAuthorName('');
      setMessage('');
      return;
    }

    // Step 2: Not found, trigger specific author scraping
    setMessage(`❌ Author not found in database. Starting scraping...`);
    
    const scraped = await scrapeAuthor(outletName, authorName);

    if (scraped) {
      // Success handled in scrapeAuthor function
      setOutletName('');
      setAuthorName('');
      setMessage('');
    } else {
      // Show helpful message
      setMessage('💡 Tip: The scraper may still be running. Try searching again in 30 seconds.');
    }
  };

  const clearSearch = () => {
    setOutletName('');
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
                    {/* Search Inputs */}
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-mono text-muted-foreground mb-1">
                          Outlet Name *
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g., The Hindu, Indian Express"
                          value={outletName}
                          onChange={(e) => setOutletName(e.target.value)}
                          className="w-full bg-muted border border-primary/30 text-foreground placeholder:text-muted-foreground font-mono"
                          disabled={loading || scraping}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-muted-foreground mb-1">
                          Author Name *
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g., Prakriti Deb"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          className="w-full bg-muted border border-primary/30 text-foreground placeholder:text-muted-foreground font-mono"
                          disabled={loading || scraping}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSearch}
                          disabled={loading || scraping}
                          className="flex-1 px-4 py-2 bg-primary text-primary-foreground font-mono text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {(loading || scraping) && <Loader2 className="w-4 h-4 animate-spin" />}
                          {loading ? 'Searching...' : scraping ? 'Scraping...' : 'Search'}
                        </button>
                        
                        <button
                          onClick={clearSearch}
                          disabled={loading || scraping}
                          className="px-4 py-2 bg-muted text-foreground font-mono text-sm hover:bg-muted/80 transition-colors disabled:opacity-50 border border-border"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Status Message */}
                    {message && (
                      <div className="px-4 pb-4">
                        <div className="p-3 bg-muted border border-primary/30 text-xs font-mono text-foreground">
                          {message}
                        </div>
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="p-4 text-xs text-muted-foreground font-mono border-t border-border">
                      <div className="mb-2 text-primary font-bold">💡 How it works:</div>
                      <ul className="space-y-1 ml-4">
                        <li>1. Enter outlet name and author name</li>
                        <li>2. We search our database first</li>
                        <li>3. If not found, we scrape the outlet</li>
                        <li>4. View the author's profile!</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Mini Live Stats */}
              <div className="hidden lg:flex items-center px-3 py-1 bg-muted border border-primary/30 text-sm font-mono animate-pulse-glow">
                <span className="w-2 h-2 bg-success rounded-full mr-2 animate-pulse"></span>
                <span className="text-foreground">Live Tracking Active</span>
              </div>

              {/* Profile Dropdown */}
              <div className="relative group">
                <button className="w-10 h-10 bg-primary flex items-center justify-center text-card hover:scale-105 transition-transform border border-primary">
                  <User className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-2 w-44 bg-card border-2 border-primary/30 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <NavLink
                    to="/dashboard"
                    className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono border-b border-border"
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/settings"
                    className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono border-b border-border"
                  >
                    Settings
                  </NavLink>
                  <NavLink
                    to="/logout"
                    className="block px-4 py-2 text-sm hover:bg-primary/20 font-mono text-destructive"
                  >
                    Logout
                  </NavLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Author Profile Modal */}
      {showModal && selectedProfile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border-2 border-primary/30 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col glow-cyan">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-primary/20 via-secondary/10 to-primary/20 border-b-2 border-primary/50 p-8 relative overflow-hidden">
              {/* Animated background grid */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                  backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 255, .1) 25%, rgba(0, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, .1) 75%, rgba(0, 255, 255, .1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 255, .1) 25%, rgba(0, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, .1) 75%, rgba(0, 255, 255, .1) 76%, transparent 77%, transparent)',
                  backgroundSize: '50px 50px'
                }}></div>
              </div>

              {/* Close Button */}
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 w-10 h-10 bg-muted/80 hover:bg-primary/20 border border-primary/30 hover:border-primary flex items-center justify-center transition-all duration-200 hover:glow-cyan group"
              >
                <span className="text-2xl text-primary group-hover:rotate-90 transition-transform duration-200">×</span>
              </button>

              {/* Author Info */}
              <div className="relative flex items-start gap-6">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 bg-muted border-2 border-primary flex items-center justify-center glow-cyan">
                    <span className="text-5xl font-bold text-primary font-mono">
                      {selectedProfile.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-3xl font-bold mb-3 break-words text-foreground font-mono">
                    {selectedProfile.name}
                  </h2>
                  <div className="flex flex-wrap gap-3 mb-4">
                    <span className="px-4 py-1.5 bg-primary/10 border border-primary text-primary text-sm font-mono">
                      📰 {selectedProfile.outlet}
                    </span>
                    <span className="px-4 py-1.5 bg-secondary/10 border border-secondary text-secondary text-sm font-mono">
                      📝 {selectedProfile.articles} articles
                    </span>
                    {selectedProfile.role && (
                      <span className="px-4 py-1.5 bg-accent/10 border border-accent text-accent text-sm font-mono">
                        👤 {selectedProfile.role}
                      </span>
                    )}
                  </div>
                  {selectedProfile.profileLink && (
                    <a
                      href={selectedProfile.profileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/20 text-primary border border-primary font-medium font-mono hover:bg-primary hover:text-primary-foreground transition-all duration-200 glow-cyan"
                    >
                      <span>View Profile</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-card/50">
              {/* Bio */}
              {selectedProfile.bio && (
                <div className="mb-6 p-4 bg-muted/30 border border-border">
                  <h3 className="text-lg font-semibold text-primary mb-2 font-mono flex items-center gap-2">
                    <span>📝</span> Bio
                  </h3>
                  <p className="text-muted-foreground font-mono text-sm leading-relaxed">{selectedProfile.bio}</p>
                </div>
              )}

              {/* Topics & Keywords */}
              {selectedProfile.topics && selectedProfile.topics.length > 0 && (
                <div className="mb-6 p-4 bg-muted/30 border border-border">
                  <h3 className="text-lg font-semibold text-secondary mb-3 font-mono flex items-center gap-2">
                    <span>🏷️</span> Coverage Topics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.topics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-primary/10 border border-primary text-primary text-sm font-mono"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Articles */}
              {selectedProfile.articleData && selectedProfile.articleData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-success mb-4 font-mono flex items-center gap-2">
                    <span>📚</span> Recent Articles ({selectedProfile.articleData.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {selectedProfile.articleData.slice(0, 20).map((article, idx) => (
                      <a
                        key={idx}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="p-4 bg-muted/30 border border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-primary/10 border border-primary text-primary flex items-center justify-center font-bold text-sm font-mono">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-foreground group-hover:text-primary transition-colors font-mono text-sm leading-relaxed line-clamp-2 mb-2">
                                {article.title}
                              </h4>
                              <div className="flex gap-3 flex-wrap text-xs">
                                {article.section && (
                                  <span className="px-2 py-1 bg-accent/10 border border-accent/50 text-accent font-mono">
                                    {article.section}
                                  </span>
                                )}
                                {article.publishDate && (
                                  <span className="text-muted-foreground font-mono">📅 {article.publishDate}</span>
                                )}
                              </div>
                            </div>
                            <svg 
                              className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
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
