"use client";

import React, { useState } from "react";
import axios from "axios";
import { getFallbackUrls, API_ENDPOINTS } from "../config/api";

interface Article {
  title: string;
  url: string;
  publishDate?: string;
  section?: string;
}

interface AuthorProfile {
  _id: string;
  name: string;
  outlet: string;
  profileUrl: string;
  role?: string;
  bio?: string;
  email?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
  };
  profilePicture?: string;
  articles: Article[];
  totalArticles: number;
  scrapedAt: Date;
}

export default function AuthorsFetcher() {
  const [outlet, setOutlet] = useState<string>("");
  const [authors, setAuthors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<AuthorProfile | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Logs
  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Fetch authors AND their full profiles
  const fetchAuthorsWithProfiles = async () => {
    if (!outlet.trim()) {
      setError("Please enter a news outlet name");
      addLog("❌ No outlet name entered");
      return;
    }

    setLoading(true);
    setError("");
    setAuthors([]);
    setLogs([]);

    addLog(`🚀 Discovering journalists from: "${outlet}"`);
    addLog(`📊 This will scrape up to 30 authors with full profiles`);

    const urls = getFallbackUrls(API_ENDPOINTS.DISCOVER_AND_SCRAPE);
    
    addLog(`📡 Trying URLs: ${urls.join(', ')}`);

    try {
      let res;
      for (const url of urls) {
        try {
          addLog(`⏳ Attempting: ${url}`);
          res = await axios.post(
            url,
            { outlet, maxAuthors: 30 },
            { 
              headers: { "Cache-Control": "no-cache" }, 
              timeout: 300000 // 5 minutes for full scraping
            }
          );
          addLog(`✅ Successfully scraped from ${url}`);
          break;
        } catch (err: any) {
          addLog(`⚠️ Failed: ${err.message}`);
        }
      }

      if (!res) {
        setError("❌ All backend endpoints failed. Make sure backend is running.");
        addLog("❌ Failed to scrape from all endpoints");
        return;
      }

      const result = res.data;
      
      console.log('📊 API Response:', result);
      console.log('👥 Authors array:', result.authors);
      console.log('📈 Authors count:', result.authorsCount);
      
      if (!result.authors || result.authors.length === 0) {
        setError("No authors found for this outlet");
        addLog("⚠️ No authors discovered");
        return;
      }

      setAuthors(result.authors);
      addLog(`✅ Discovered ${result.authorsCount} journalists!`);
      addLog(`💾 Saved ${result.savedToDatabase} profiles to database`);
      addLog(`📰 Total articles scraped: ${result.authors.reduce((sum, a) => sum + a.totalArticles, 0)}`);

    } catch (err: any) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
        addLog(`❌ Backend error: ${err.response.data.error}`);
      } else if (err.message) {
        setError(err.message);
        addLog(`❌ Error: ${err.message}`);
      } else {
        setError("Failed to discover authors");
        addLog("❌ Unknown error");
      }
    } finally {
      setLoading(false);
      addLog("🏁 Process finished");
    }
  };

  // View profile in modal
  const viewProfile = (author: any) => {
    setSelectedProfile(author);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedProfile(null);
  };

  return (
    <div className="max-w-7xl mx-auto mt-16 p-8 rounded-xl shadow-xl font-sans bg-card/80 backdrop-blur-md text-card-foreground animate-fadeIn">
      <h1 className="text-3xl font-bold text-primary font-mono mb-6">
        🔍 Discover Journalists
      </h1>
      
      <p className="text-muted-foreground mb-6">
        Enter any news outlet name. We'll automatically discover journalists, scrape their profiles and articles, and save everything to the database.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Enter news outlet name (e.g., Amar Ujala, The Hindu)"
          value={outlet}
          onChange={(e) => setOutlet(e.target.value)}
          className="flex-1 px-4 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={fetchAuthorsWithProfiles}
          disabled={loading}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Discovering..." : "Discover & Scrape"}
        </button>
      </div>

      {error && (
        <p className="text-destructive mb-4 border border-destructive bg-destructive/20 rounded-md p-3">
          {error}
        </p>
      )}

      {authors.length > 0 && (
        <div className="overflow-x-auto rounded-lg shadow-md border border-border mb-6 bg-card/90 backdrop-blur-sm">
          <div className="p-4 bg-muted border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              ✅ Discovered {authors.length} Journalists
            </h2>
            <p className="text-sm text-muted-foreground">
              Total Articles: {authors.reduce((sum, a) => sum + a.totalArticles, 0)}
            </p>
          </div>
          
          <table className="w-full border-collapse table-auto">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 border border-border text-left font-mono">Name</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Role</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Articles</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card text-card-foreground">
              {authors.map((author, idx) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2 border border-border font-medium">{author.name}</td>
                  <td className="px-4 py-2 border border-border text-sm text-muted-foreground">
                    {author.role || "Not specified"}
                  </td>
                  <td className="px-4 py-2 border border-border text-center">
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                      {author.totalArticles}
                    </span>
                  </td>
                  <td className="px-4 py-2 border border-border">
                    <button
                      onClick={() => viewProfile(author)}
                      className="px-4 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Live Logs */}
      <div className="mt-8 border border-border rounded-md p-4 max-h-80 overflow-y-auto font-mono text-sm bg-card/80 backdrop-blur-sm text-card-foreground">
        <h2 className="font-semibold mb-2 text-primary">📋 Live Logs:</h2>
        {logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={idx} className="whitespace-pre-wrap mb-1">
              {log}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No logs yet. Start by entering an outlet name above.</p>
        )}
      </div>

      {/* Profile Modal */}
      {showModal && selectedProfile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-2xl border-2 border-primary/30 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col glow-cyan">
            {/* Header */}
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
                    <span className="px-4 py-1.5 bg-primary/10 border border-primary text-primary text-sm font-medium font-mono">
                      📰 {selectedProfile.outlet}
                    </span>
                    <span className="px-4 py-1.5 bg-secondary/10 border border-secondary text-secondary text-sm font-medium font-mono">
                      📝 {selectedProfile.totalArticles} articles
                    </span>
                    {selectedProfile.role && (
                      <span className="px-4 py-1.5 bg-accent/10 border border-accent text-accent text-sm font-medium font-mono">
                        👤 {selectedProfile.role}
                      </span>
                    )}
                  </div>
                  {selectedProfile.profileUrl && (
                    <a
                      href={selectedProfile.profileUrl}
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

              {/* Contact Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {selectedProfile.email && (
                  <div className="p-4 bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                    <h3 className="text-sm font-semibold text-primary mb-2 font-mono">📧 Email</h3>
                    <a href={`mailto:${selectedProfile.email}`} className="text-foreground hover:text-primary transition-colors font-mono text-sm break-all">
                      {selectedProfile.email}
                    </a>
                  </div>
                )}
                
                <div className="p-4 bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                  <h3 className="text-sm font-semibold text-primary mb-2 font-mono">🔗 Profile URL</h3>
                  <a 
                    href={selectedProfile.profileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-primary transition-colors font-mono text-sm break-all"
                  >
                    View Original Profile →
                  </a>
                </div>
              </div>

              {/* Social Links */}
              {selectedProfile.socialLinks && Object.keys(selectedProfile.socialLinks).length > 0 && (
                <div className="mb-6 p-4 bg-muted/30 border border-border">
                  <h3 className="text-lg font-semibold text-secondary mb-4 font-mono flex items-center gap-2">
                    <span>🌐</span> Social Media
                  </h3>
                  <div className="flex gap-3 flex-wrap">
                    {selectedProfile.socialLinks.twitter && (
                      <a
                        href={selectedProfile.socialLinks.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-primary/20 text-primary border border-primary font-mono text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                      >
                        Twitter
                      </a>
                    )}
                    {selectedProfile.socialLinks.linkedin && (
                      <a
                        href={selectedProfile.socialLinks.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-primary/20 text-primary border border-primary font-mono text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                      >
                        LinkedIn
                      </a>
                    )}
                    {selectedProfile.socialLinks.facebook && (
                      <a
                        href={selectedProfile.socialLinks.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-primary/20 text-primary border border-primary font-mono text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                      >
                        Facebook
                      </a>
                    )}
                    {selectedProfile.socialLinks.instagram && (
                      <a
                        href={selectedProfile.socialLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-secondary/20 text-secondary border border-secondary font-mono text-sm hover:bg-secondary hover:text-secondary-foreground transition-all duration-200"
                      >
                        Instagram
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Articles */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-success mb-4 font-mono flex items-center gap-2">
                  <span>📚</span> Articles ({selectedProfile.totalArticles})
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {selectedProfile.articles.slice(0, 20).map((article, idx) => (
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
                {selectedProfile.totalArticles > 20 && (
                  <p className="text-sm text-muted-foreground mt-3 text-center font-mono">
                    Showing 20 of {selectedProfile.totalArticles} articles
                  </p>
                )}
              </div>

              {/* Database Info */}
              <div className="p-4 bg-muted/30 border-2 border-success/30">
                <h3 className="text-sm font-semibold text-success mb-3 font-mono flex items-center gap-2">
                  <span>💾</span> Database Info
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-success font-semibold">✅ Saved</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scraped:</span>
                    <span className="text-foreground">{new Date(selectedProfile.scrapedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex justify-between col-span-1 md:col-span-2">
                    <span className="text-muted-foreground">ID:</span>
                    <span className="text-foreground text-xs break-all">{selectedProfile._id}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
