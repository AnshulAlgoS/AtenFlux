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

    addLog(`🚀 Starting discovery for: "${outlet}"`);
    addLog(`📊 This will scrape up to 30 authors with full profiles`);

    const urls = getFallbackUrls(API_ENDPOINTS.DISCOVER_AND_SCRAPE);
    
    try {
      // Start the job
      let startRes;
      for (const url of urls) {
        try {
          addLog(`⏳ Starting job at: ${url}`);
          startRes = await axios.post(
            url,
            { outlet, maxAuthors: 30 },
            { 
              headers: { "Cache-Control": "no-cache" }, 
              timeout: 10000 // Quick timeout for starting job
            }
          );
          addLog(`✅ Job started successfully`);
          break;
        } catch (err: any) {
          addLog(`⚠️ Failed to start: ${err.message}`);
        }
      }

      if (!startRes) {
        setError("❌ All backend endpoints failed. Make sure backend is running.");
        addLog("❌ Failed to start job");
        setLoading(false);
        return;
      }

      const { jobId, statusEndpoint } = startRes.data;
      
      if (!jobId) {
        setError("❌ No job ID received from server");
        addLog("❌ Invalid response from server");
        setLoading(false);
        return;
      }

      addLog(`📋 Job ID: ${jobId}`);
      addLog(`🔄 Polling for progress...`);

      // Poll for job status
      const pollInterval = setInterval(async () => {
        try {
          const statusUrls = getFallbackUrls(`${API_ENDPOINTS.JOB_STATUS}/${jobId}`);
          
          let statusRes;
          for (const url of statusUrls) {
            try {
              statusRes = await axios.get(url, { timeout: 5000 });
              break;
            } catch (err) {
              // Try next URL
            }
          }

          if (!statusRes) {
            addLog(`⚠️ Failed to fetch status, retrying...`);
            return;
          }

          const jobStatus = statusRes.data;
          
          // Update progress
          addLog(`📊 Progress: ${jobStatus.progress}% - ${jobStatus.message}`);
          
          if (jobStatus.authorsFound > 0) {
            addLog(`👥 Authors discovered: ${jobStatus.authorsFound}`);
          }

          if (jobStatus.status === 'completed') {
            clearInterval(pollInterval);
            
            addLog(`✅ Scraping completed!`);
            addLog(`💾 Saved ${jobStatus.authorsSaved} profiles to database`);
            
            if (jobStatus.authors && jobStatus.authors.length > 0) {
              setAuthors(jobStatus.authors);
              addLog(`📰 Total articles scraped: ${jobStatus.authors.reduce((sum: number, a: any) => sum + a.totalArticles, 0)}`);
            } else {
              setError("No authors data in response");
              addLog("⚠️ Job completed but no authors returned");
            }
            
            setLoading(false);
          } else if (jobStatus.status === 'failed') {
            clearInterval(pollInterval);
            
            setError(jobStatus.error || "Scraping failed");
            addLog(`❌ Job failed: ${jobStatus.error || jobStatus.message}`);
            setLoading(false);
          }

        } catch (err: any) {
          addLog(`⚠️ Status check error: ${err.message}`);
        }
      }, 2000); // Poll every 2 seconds

      // Timeout after 15 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (loading) {
          setError("Scraping took too long (>15 min). Check database for results.");
          addLog("⏱️ Timeout reached");
          setLoading(false);
        }
      }, 15 * 60 * 1000);

    } catch (err: any) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
        addLog(`❌ Backend error: ${err.response.data.error}`);
      } else if (err.message) {
        setError(err.message);
        addLog(`❌ Error: ${err.message}`);
      } else {
        setError("Failed to start scraping");
        addLog("❌ Unknown error");
      }
      setLoading(false);
    } finally {
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-border">
            {/* Header */}
            <div className="sticky top-0 bg-primary text-primary-foreground p-6 border-b border-border flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{selectedProfile.name}</h2>
                <p className="text-sm opacity-90 mt-1">{selectedProfile.outlet}</p>
                {selectedProfile.role && (
                  <p className="text-sm opacity-80 mt-1">Role: {selectedProfile.role}</p>
                )}
              </div>
              <button
                onClick={closeModal}
                className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Bio */}
              {selectedProfile.bio && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">📝 Bio</h3>
                  <p className="text-muted-foreground">{selectedProfile.bio}</p>
                </div>
              )}

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedProfile.email && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">📧 Email</h3>
                    <a href={`mailto:${selectedProfile.email}`} className="text-primary hover:underline">
                      {selectedProfile.email}
                    </a>
                  </div>
                )}
                
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">🔗 Profile URL</h3>
                  <a 
                    href={selectedProfile.profileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    View Original Profile →
                  </a>
                </div>
              </div>

              {/* Social Links */}
              {selectedProfile.socialLinks && Object.keys(selectedProfile.socialLinks).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">🌐 Social Media</h3>
                  <div className="flex gap-3 flex-wrap">
                    {selectedProfile.socialLinks.twitter && (
                      <a
                        href={selectedProfile.socialLinks.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                      >
                        Twitter
                      </a>
                    )}
                    {selectedProfile.socialLinks.linkedin && (
                      <a
                        href={selectedProfile.socialLinks.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors text-sm"
                      >
                        LinkedIn
                      </a>
                    )}
                    {selectedProfile.socialLinks.facebook && (
                      <a
                        href={selectedProfile.socialLinks.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                      >
                        Facebook
                      </a>
                    )}
                    {selectedProfile.socialLinks.instagram && (
                      <a
                        href={selectedProfile.socialLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 transition-colors text-sm"
                      >
                        Instagram
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Articles */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  📚 Articles ({selectedProfile.totalArticles})
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedProfile.articles.slice(0, 20).map((article, idx) => (
                    <div key={idx} className="p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        {article.title}
                      </a>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {article.section && (
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                            {article.section}
                          </span>
                        )}
                        {article.publishDate && (
                          <span>📅 {article.publishDate}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedProfile.totalArticles > 20 && (
                  <p className="text-sm text-muted-foreground mt-3 text-center">
                    Showing 20 of {selectedProfile.totalArticles} articles
                  </p>
                )}
              </div>

              {/* Database Info */}
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-2">💾 Database Info</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Status:</div>
                  <div className="text-green-600 font-semibold">✅ Saved to MongoDB</div>
                  
                  <div className="text-muted-foreground">Scraped At:</div>
                  <div>{new Date(selectedProfile.scrapedAt).toLocaleString()}</div>
                  
                  <div className="text-muted-foreground">Profile ID:</div>
                  <div className="font-mono text-xs">{selectedProfile._id}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
