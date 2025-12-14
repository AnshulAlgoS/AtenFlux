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
  lastActiveAt?: string | Date;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    email?: string;
  };
  profilePicture?: string;
  articles: Article[];
  totalArticles: number;
  scrapedAt: Date;
  influence?: number;
  topics?: string[];
  keywords?: string[];
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
      addLog("No outlet name entered");
      return;
    }

    setLoading(true);
    setError("");
    setAuthors([]);
    setLogs([]);

    addLog(`Discovering journalists from: "${outlet}"`);
    addLog(`This will collect 200-400 articles, extract unique authors, then scrape profiles`);

    const urls = getFallbackUrls(API_ENDPOINTS.DISCOVER_AND_SCRAPE);

    addLog(`📡 Trying URLs: ${urls.join(', ')}`);

    try {
      let res;
      let chosenBaseUrl: string | null = null;
      for (const url of urls) {
        try {
          addLog(`Attempting: ${url}`);
          res = await axios.post(
            url,
            { outlet, maxAuthors: 10 },
            {
              headers: { "Cache-Control": "no-cache" },
            }
          );
          addLog(` Scrape job started at ${url}`);
          const parsed = new URL(url);
          chosenBaseUrl = `${parsed.protocol}//${parsed.host}`;

          break;
        } catch (err: any) {
          addLog(` Failed: ${err.message}`);
        }
      }

      if (!res) {
        setError(" All backend endpoints failed. Make sure backend is running.");
        addLog(" Failed to start scrape job on all endpoints");
        return;
      }

      const jobStart = res.data;
      if (!jobStart?.jobId) {
        setError("Unexpected response: missing jobId");
        addLog(`Response did not include jobId: ${JSON.stringify(jobStart)}`);
        return;
      }

      const jobId: string = jobStart.jobId;
      addLog(`Job ID: ${jobId}`);
      addLog("⏳ Scraping in progress... (this may take 2-5 minutes)");

      const statusPath = jobStart.statusEndpoint || `${API_ENDPOINTS.JOB_STATUS}/${jobId}`;
      const statusUrl = `${chosenBaseUrl}${statusPath.startsWith('/') ? statusPath : `/${statusPath}`}`;
      let completedData: any | null = null;

      while (!completedData) {
        try {
          const statusRes = await axios.get(statusUrl);
          const status = statusRes.data;

          // Check for failure
          if (status.status === 'failed') {
            setError(`Scraping failed: ${status.error || 'Unknown error'}`);
            addLog(`❌ Job failed: ${status.error || 'Unknown error'}`);
            return;
          }

          // Check for completion
          if (status.status === 'completed') {
            completedData = status;
            break;
          }
          
          // NO LOGGING - completely silent polling
        } catch (err: any) {
          // Silent retry on network error
        }

        // Wait before next check
        await new Promise((r) => setTimeout(r, 2500));
      }

      const authorsList = completedData.authors || [];
      addLog(` Discovered ${completedData.authorsFound || authorsList.length} journalists!`);
      addLog(` Total articles scraped: ${authorsList.reduce((sum: number, a: any) => sum + (a.totalArticles || 0), 0)}`);

      try {
        const outletParam = outlet.toLowerCase().trim();
        const profilesUrl = `${statusUrl.split('/api/authors/job-status')[0]}${API_ENDPOINTS.PROFILES}?outlet=${encodeURIComponent(outletParam)}&limit=100`;
        addLog(` Fetching saved profiles from ${profilesUrl}`);
        const dbRes = await axios.get(profilesUrl);
        const payload = dbRes.data as any;
        const list = Array.isArray(payload) ? payload : (payload.profiles || []);
        const normalized = list.map((p: any) => ({
          _id: p._id,
          name: p.name,
          outlet: p.outlet,
          profileUrl: p.profileLink,
          totalArticles: p.articles || p.totalArticles || 0,
          articles: p.articleData || [],
          bio: p.bio,
          email: p.email || p.socialLinks?.email || null,
          socialLinks: p.socialLinks || {},
          scrapedAt: p.scrapedAt,
          role: p.role || 'Journalist',
          influence: p.influence || 0,
          topics: p.topics || [],
          keywords: p.keywords || [],
        }));
        setAuthors(normalized);
        addLog(` Loaded ${normalized.length} profiles from database`);
      } catch (e: any) {
        addLog(`⚠️ Failed to load profiles: ${e.message}`);
        setAuthors(authorsList);
      }

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
      addLog(" Process finished");
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

  const downloadCsv = async () => {
    try {
      const outletParam = outlet.trim().toLowerCase();
      const urls = getFallbackUrls(API_ENDPOINTS.EXPORT_CSV).map(u =>
        outletParam ? `${u}?outlet=${encodeURIComponent(outletParam)}` : u
      );
      addLog(` Exporting CSV for ${outletParam || 'all outlets'}`);
      for (const url of urls) {
        try {
          const res = await axios.get(url, { responseType: 'blob' });
          const blob = res.data as Blob;
          const cd = (res.headers && (res.headers["content-disposition"] || res.headers["Content-Disposition"])) || "";
          const m = /filename="?([^";]+)"?/i.exec(cd || "");
          const filename = m?.[1] || `journalists_${outletParam || 'all'}_${Date.now()}.csv`;
          const href = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = href;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(href);
          addLog(` Downloaded CSV from ${url}`);
          return;
        } catch (err: any) {
          addLog(` Failed CSV from ${url}: ${err.message}`);
        }
      }
      setError(" Failed to download CSV from all endpoints");
    } catch (e: any) {
      setError(e.message || " Failed to download CSV");
    }
  };

  return (
    <div className="max-w-7xl mx-auto mt-16 p-8 rounded-xl shadow-xl font-sans bg-card/80 backdrop-blur-md text-card-foreground animate-fadeIn">
      <h1 className="text-3xl font-bold text-primary font-mono mb-6">
        Discover Journalists
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                📰 Discovered {authors.length} Journalists
              </h2>
              <button
                onClick={downloadCsv}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
              >
                Download CSV
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <span className="text-muted-foreground">
                📝 Articles: <span className="text-primary font-semibold">{authors.reduce((sum, a) => sum + a.totalArticles, 0)}</span>
              </span>
              <span className="text-muted-foreground">
                👔 With Roles: <span className="text-accent font-semibold">{authors.filter(a => a.role && a.role !== 'Journalist').length}</span>
              </span>
              <span className="text-muted-foreground">
                🐦 Twitter: <span className="text-blue-400 font-semibold">{authors.filter(a => a.socialLinks?.twitter).length}</span>
              </span>
              <span className="text-muted-foreground">
                💼 LinkedIn: <span className="text-blue-300 font-semibold">{authors.filter(a => a.socialLinks?.linkedin).length}</span>
              </span>
              <span className="text-muted-foreground">
                📧 Email: <span className="text-green-400 font-semibold">{authors.filter(a => a.email).length}</span>
              </span>
            </div>
          </div>

          <table className="w-full border-collapse table-auto">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 border border-border text-left font-mono">Name</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Role</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Articles</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Last Active</th>
                <th className="px-4 py-2 border border-border text-center font-mono">Social</th>
                <th className="px-4 py-2 border border-border text-center font-mono">Email</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card text-card-foreground">
              {authors.map((author, idx) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2 border border-border font-medium">{author.name}</td>
                  <td className="px-4 py-2 border border-border text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      author.role && author.role !== 'Journalist' 
                        ? 'bg-accent/20 text-accent border border-accent/50' 
                        : 'text-muted-foreground'
                    }`}>
                      {author.role || "Journalist"}
                    </span>
                  </td>
                  <td className="px-4 py-2 border border-border text-center">
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                      {author.totalArticles}
                    </span>
                  </td>
                  <td className="px-4 py-2 border border-border text-sm">
                    {author.lastActiveAt ? new Date(author.lastActiveAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 border border-border text-center">
                    <div className="flex gap-1 justify-center">
                      {author.socialLinks?.twitter && (
                        <a href={author.socialLinks.twitter} target="_blank" rel="noopener noreferrer" 
                           className="w-6 h-6 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center hover:bg-blue-500/40 transition-colors text-xs" title="Twitter">
                          𝕏
                        </a>
                      )}
                      {author.socialLinks?.linkedin && (
                        <a href={author.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"
                           className="w-6 h-6 bg-blue-600/20 text-blue-300 rounded flex items-center justify-center hover:bg-blue-600/40 transition-colors text-xs" title="LinkedIn">
                          in
                        </a>
                      )}
                      {!author.socialLinks?.twitter && !author.socialLinks?.linkedin && (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 border border-border text-center">
                    {author.email ? (
                      <a href={`mailto:${author.email}`} className="text-primary hover:underline text-xs" title={author.email}>
                        ✓
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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
                       {selectedProfile.outlet}
                    </span>
                    <span className="px-4 py-1.5 bg-secondary/10 border border-secondary text-secondary text-sm font-medium font-mono">
                       {selectedProfile.totalArticles} articles
                    </span>
                    {selectedProfile.lastActiveAt && (
                      <span className="px-4 py-1.5 bg-muted/20 border border-border text-muted-foreground text-sm font-medium font-mono">
                        Last Active: {new Date(selectedProfile.lastActiveAt).toLocaleDateString()}
                      </span>
                    )}
                    {selectedProfile.role && (
                      <span className="px-4 py-1.5 bg-accent/10 border border-accent text-accent text-sm font-medium font-mono">
                         {selectedProfile.role}
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
                    <span></span> Bio
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

              {/* Topics */}
              {selectedProfile.topics && selectedProfile.topics.length > 0 && (
                <div className="mb-6 p-4 bg-muted/30 border border-border">
                  <h3 className="text-lg font-semibold text-accent mb-4 font-mono flex items-center gap-2">
                    <span>🏷️</span> Topics Covered
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {selectedProfile.topics.map((topic, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-accent/10 border border-accent/50 text-accent text-sm font-mono rounded">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {selectedProfile.socialLinks && (selectedProfile.socialLinks.twitter || selectedProfile.socialLinks.linkedin || selectedProfile.socialLinks.facebook || selectedProfile.socialLinks.instagram || selectedProfile.socialLinks.youtube) && (
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
                        className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/50 font-mono text-sm hover:bg-blue-500 hover:text-white transition-all duration-200 flex items-center gap-2"
                      >
                        <span>𝕏</span> Twitter
                      </a>
                    )}
                    {selectedProfile.socialLinks.linkedin && (
                      <a
                        href={selectedProfile.socialLinks.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600/20 text-blue-300 border border-blue-600/50 font-mono text-sm hover:bg-blue-600 hover:text-white transition-all duration-200 flex items-center gap-2"
                      >
                        <span>in</span> LinkedIn
                      </a>
                    )}
                    {selectedProfile.socialLinks.facebook && (
                      <a
                        href={selectedProfile.socialLinks.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-700/20 text-blue-200 border border-blue-700/50 font-mono text-sm hover:bg-blue-700 hover:text-white transition-all duration-200 flex items-center gap-2"
                      >
                        <span>f</span> Facebook
                      </a>
                    )}
                    {selectedProfile.socialLinks.instagram && (
                      <a
                        href={selectedProfile.socialLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-pink-500/20 text-pink-400 border border-pink-500/50 font-mono text-sm hover:bg-pink-500 hover:text-white transition-all duration-200 flex items-center gap-2"
                      >
                        <span>📷</span> Instagram
                      </a>
                    )}
                    {selectedProfile.socialLinks.youtube && (
                      <a
                        href={selectedProfile.socialLinks.youtube}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 font-mono text-sm hover:bg-red-500 hover:text-white transition-all duration-200 flex items-center gap-2"
                      >
                        <span>▶</span> YouTube
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
                    <span className="text-success font-semibold"> Saved</span>
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
