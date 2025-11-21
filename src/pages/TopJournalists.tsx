"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Card } from "@/components/ui/card";
import { TrendingUp, Award, FileText, ThumbsUp, ThumbsDown, ExternalLink, Mail, Twitter, Linkedin, Facebook, Instagram, X, Eye, RefreshCw, Zap } from "lucide-react";
import { getFallbackUrls, API_ENDPOINTS, API_CONFIG } from "@/config/api";

const MAIN_TOPICS = ["Politics", "Entertainment", "Sports", "Business", "Tech", "Science"];
const COLORS = ["#10B981", "#EC4899", "#F97316", "#EAB308", "#3B82F6", "#8B5CF6"];

interface Article {
  title: string;
  url: string;
  scrapedAt: Date;
}

interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  email?: string;
}

interface Journalist {
  _id: string;
  name: string;
  outlet: string;
  profileLink?: string;
  profilePic?: string;
  bio?: string;
  section?: string;
  influence?: number;
  articles?: number;
  articleLinks?: string[];
  articleData?: Article[];
  latestArticle?: Article;
  socialLinks?: SocialLinks;
  topics?: string[];
  color?: string;
  upvotes?: number;
  downvotes?: number;
}

const TopJournalists = () => {
  const [journalists, setJournalists] = useState<Journalist[]>([]);
  const [selectedJournalist, setSelectedJournalist] = useState<Journalist | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<string>("");

  const handleVote = (id: string, type: "up" | "down") => {
    setJournalists((prev) =>
      prev.map((j) =>
        j._id === id
          ? {
              ...j,
              upvotes: type === "up" ? (j.upvotes || 0) + 1 : j.upvotes || 0,
              downvotes: type === "down" ? (j.downvotes || 0) + 1 : j.downvotes || 0,
            }
          : j
      )
    );
  };

  const viewProfile = (journalist: Journalist) => {
    setSelectedJournalist(journalist);
  };

  const handleEnrichProfiles = async () => {
    if (enriching) return;
    
    setEnriching(true);
    setEnrichmentProgress("Starting enrichment process...");
    
    try {
      const urls = getFallbackUrls('/enrich-all-profiles');
      
      console.log("🚀 Starting enrichment of existing authors...");
      setEnrichmentProgress("Analyzing existing authors in database...");
      
      let response = null;
      for (const url of urls) {
        try {
          response = await axios.post(url, {}, { timeout: 300000 }); // 5 minute timeout
          console.log(`✅ Enrichment request sent to ${url}`);
          break;
        } catch (err: any) {
          console.warn(`⚠️ Failed to reach ${url}:`, err.message);
        }
      }
      
      if (response && response.data) {
        const data = response.data;
        console.log("✅ Enrichment completed:", data);
        setEnrichmentProgress(`✅ Successfully enriched ${data.enrichedCount || 0} profiles!`);
        
        // Refresh the journalist list
        setTimeout(() => {
          fetchJournalists();
          setEnrichmentProgress("");
          setEnriching(false);
        }, 3000);
      } else {
        setEnrichmentProgress("⚠️ Could not connect to server. Please try again.");
        setEnriching(false);
      }
    } catch (err: any) {
      console.error("❌ Enrichment failed:", err);
      setEnrichmentProgress(`❌ Error: ${err.message}`);
      setTimeout(() => {
        setEnrichmentProgress("");
        setEnriching(false);
      }, 5000);
    }
  };

  const fetchJournalists = async () => {
    const urls = getFallbackUrls(API_ENDPOINTS.AUTHOR_PROFILES);
    let data: Journalist[] | null = null;

    for (const url of urls) {
      try {
        const res = await axios.get(url, { timeout: API_CONFIG.TIMEOUT });
        const payload = res.data as any;
        const list: Journalist[] = Array.isArray(payload)
          ? payload
          : (payload.profiles || payload.journalists || []);

        if (list && list.length > 0) {
          data = list.map((j, i) => ({
            ...j,
            topics: j.topics?.filter((t) => MAIN_TOPICS.includes(t)).slice(0, 3),
            color: COLORS[i % COLORS.length],
          }));
          console.log(`✅ Fetched ${data.length} journalists from ${url}`);
          break;
        }
      } catch (err: any) {
        console.warn(`⚠️ Failed to fetch journalists from ${url}:`, err.message);
      }
    }

    if (data) setJournalists(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchJournalists();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <ParticleBackground />
      <Header />

      <main className="pt-32 pb-20 px-6 relative z-10">
        <div className="container mx-auto max-w-6xl">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4 animate-fade-in">
              <Award className="text-primary w-12 h-12" />
              <h1 className="text-5xl font-bold font-mono text-foreground">
                Top <span className="text-primary">Journalists</span>
              </h1>
            </div>
            <p className="text-xl text-muted-foreground font-mono animate-fade-in">
              The most influential voices in journalism today
            </p>
            
            {/* Enrich Profiles Button */}
            <div className="mt-8 flex flex-col items-center gap-4">
              <button
                onClick={handleEnrichProfiles}
                disabled={enriching}
                className={`flex items-center gap-3 px-8 py-4 rounded-lg font-mono text-lg font-semibold transition-all transform hover:scale-105 ${
                  enriching 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl'
                }`}
              >
                {enriching ? (
                  <>
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    Enriching Profiles...
                  </>
                ) : (
                  <>
                    <Zap className="w-6 h-6" />
                    Enrich Existing {journalists.length} Profiles
                  </>
                )}
              </button>
              
              {enrichmentProgress && (
                <div className={`text-sm font-mono px-6 py-3 rounded-lg animate-fade-in ${
                  enrichmentProgress.includes('✅') ? 'bg-success/20 text-success' :
                  enrichmentProgress.includes('❌') ? 'bg-destructive/20 text-destructive' :
                  'bg-primary/20 text-primary'
                }`}>
                  {enrichmentProgress}
                </div>
              )}
              
              <p className="text-sm text-muted-foreground font-mono max-w-2xl">
                Click to analyze existing profiles with NLP, extract keywords, calculate influence scores, 
                and enhance topic categorization for all {journalists.length} journalists in the database.
              </p>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center text-muted-foreground">
              <p>Loading journalists...</p>
            </div>
          )}

          {/* No Data State */}
          {!loading && journalists.length === 0 && (
            <div className="text-center text-muted-foreground">
              <p>No journalists found. Try scraping some outlets first!</p>
            </div>
          )}

          {/* Journalists Grid */}
          <div className="grid md:grid-cols-2 gap-8">
            {journalists.map((journalist, index) => (
              <Card
                key={journalist._id}
                className="bg-card border border-card/30 p-6 rounded-lg shadow-lg transition-transform hover:scale-[1.03] hover:shadow-2xl animate-fade-in"
                style={{ borderColor: `${journalist.color}30` }}
              >
                <div className="flex items-start gap-4">
                  {/* Rank Circle or Profile Pic */}
                  {journalist.profilePic ? (
                    <img
                      src={journalist.profilePic}
                      alt={journalist.name}
                      className="w-16 h-16 rounded-full object-cover border-2"
                      style={{ borderColor: journalist.color }}
                    />
                  ) : (
                    <div
                      className="w-16 h-16 flex items-center justify-center text-2xl font-bold font-mono rounded-full animate-pulse-glow"
                      style={{ backgroundColor: journalist.color, color: "#0d0d0d" }}
                    >
                      #{index + 1}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold font-mono text-foreground mb-1">{journalist.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{journalist.outlet}</p>
                    {journalist.section && (
                      <p className="text-xs text-muted-foreground mb-2">Section: {journalist.section}</p>
                    )}

                    {/* Bio Preview */}
                    {journalist.bio && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{journalist.bio}</p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" style={{ color: journalist.color }} />
                        <div>
                          <p className="text-xs text-muted-foreground">Influence</p>
                          <p className="text-lg font-bold font-mono" style={{ color: journalist.color }}>
                            {journalist.influence?.toFixed(1) || 0}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" style={{ color: journalist.color }} />
                        <div>
                          <p className="text-xs text-muted-foreground">Articles</p>
                          <p className="text-lg font-bold font-mono" style={{ color: journalist.color }}>
                            {journalist.articles || journalist.articleData?.length || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Topics */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {journalist.topics?.map((topic) => (
                        <span
                          key={topic}
                          className="px-3 py-1 rounded-full bg-muted/20 text-xs font-mono hover:bg-primary/20 transition-colors"
                          style={{ borderLeft: `3px solid ${journalist.color}` }}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>

                    {/* Social Links */}
                    {journalist.socialLinks && Object.keys(journalist.socialLinks).length > 0 && (
                      <div className="flex gap-2 mb-4">
                        {journalist.socialLinks.twitter && (
                          <a href={journalist.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <Twitter className="w-4 h-4" />
                          </a>
                        )}
                        {journalist.socialLinks.linkedin && (
                          <a href={journalist.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <Linkedin className="w-4 h-4" />
                          </a>
                        )}
                        {journalist.socialLinks.facebook && (
                          <a href={journalist.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <Facebook className="w-4 h-4" />
                          </a>
                        )}
                        {journalist.socialLinks.instagram && (
                          <a href={journalist.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <Instagram className="w-4 h-4" />
                          </a>
                        )}
                        {journalist.socialLinks.email && (
                          <a href={`mailto:${journalist.socialLinks.email}`} className="text-muted-foreground hover:text-primary transition-colors">
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-4 items-center">
                      {/* Vote Buttons */}
                      <button
                        onClick={() => handleVote(journalist._id, "up")}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-success transition-colors"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        {journalist.upvotes || 0}
                      </button>
                      <button
                        onClick={() => handleVote(journalist._id, "down")}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        {journalist.downvotes || 0}
                      </button>

                      {/* View Profile Button */}
                      <button
                        onClick={() => viewProfile(journalist)}
                        className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-sm font-mono transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>

      {/* Profile Modal */}
      {selectedJournalist && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setSelectedJournalist(null)}>
          <div className="bg-card border border-card/30 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-card/30 p-6 flex justify-between items-start">
              <div className="flex items-start gap-4">
                {selectedJournalist.profilePic ? (
                  <img
                    src={selectedJournalist.profilePic}
                    alt={selectedJournalist.name}
                    className="w-20 h-20 rounded-full object-cover border-4"
                    style={{ borderColor: selectedJournalist.color }}
                  />
                ) : (
                  <div
                    className="w-20 h-20 flex items-center justify-center text-3xl font-bold font-mono rounded-full"
                    style={{ backgroundColor: selectedJournalist.color, color: "#0d0d0d" }}
                  >
                    {selectedJournalist.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h2 className="text-3xl font-bold font-mono text-foreground">{selectedJournalist.name}</h2>
                  <p className="text-muted-foreground">{selectedJournalist.outlet}</p>
                  {selectedJournalist.section && (
                    <p className="text-sm text-muted-foreground mt-1">Section: {selectedJournalist.section}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedJournalist(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Bio */}
              {selectedJournalist.bio && (
                <div>
                  <h3 className="text-xl font-bold font-mono mb-2 text-foreground">Biography</h3>
                  <p className="text-muted-foreground">{selectedJournalist.bio}</p>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/20 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Influence</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: selectedJournalist.color }}>
                    {selectedJournalist.influence?.toFixed(1) || 0}
                  </p>
                </div>
                <div className="bg-muted/20 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Articles</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: selectedJournalist.color }}>
                    {selectedJournalist.articles || selectedJournalist.articleData?.length || 0}
                  </p>
                </div>
                <div className="bg-muted/20 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Topics</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: selectedJournalist.color }}>
                    {selectedJournalist.topics?.length || 0}
                  </p>
                </div>
              </div>

              {/* Topics */}
              {selectedJournalist.topics && selectedJournalist.topics.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold font-mono mb-3 text-foreground">Topics Covered</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedJournalist.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-4 py-2 rounded-full bg-muted/20 text-sm font-mono hover:bg-primary/20 transition-colors"
                        style={{ borderLeft: `3px solid ${selectedJournalist.color}` }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {selectedJournalist.socialLinks && Object.keys(selectedJournalist.socialLinks).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold font-mono mb-3 text-foreground">Connect</h3>
                  <div className="flex flex-wrap gap-3">
                    {selectedJournalist.socialLinks.twitter && (
                      <a href={selectedJournalist.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                        <Twitter className="w-4 h-4" />
                        Twitter
                      </a>
                    )}
                    {selectedJournalist.socialLinks.linkedin && (
                      <a href={selectedJournalist.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                        <Linkedin className="w-4 h-4" />
                        LinkedIn
                      </a>
                    )}
                    {selectedJournalist.socialLinks.facebook && (
                      <a href={selectedJournalist.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                        <Facebook className="w-4 h-4" />
                        Facebook
                      </a>
                    )}
                    {selectedJournalist.socialLinks.instagram && (
                      <a href={selectedJournalist.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                        <Instagram className="w-4 h-4" />
                        Instagram
                      </a>
                    )}
                    {selectedJournalist.socialLinks.email && (
                      <a href={`mailto:${selectedJournalist.socialLinks.email}`} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                        <Mail className="w-4 h-4" />
                        Email
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Articles */}
              {selectedJournalist.articleData && selectedJournalist.articleData.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold font-mono mb-3 text-foreground">Recent Articles</h3>
                  <div className="space-y-3">
                    {selectedJournalist.articleData.slice(0, 10).map((article, idx) => (
                      <a
                        key={idx}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 mt-1 flex-shrink-0" style={{ color: selectedJournalist.color }} />
                          <div className="flex-1">
                            <h4 className="text-foreground font-medium hover:text-primary transition-colors line-clamp-2">
                              {article.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <span>{new Date(article.scrapedAt).toLocaleDateString()}</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Profile Link */}
              {selectedJournalist.profileLink && (
                <div>
                  <a
                    href={selectedJournalist.profileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-mono transition-colors"
                  >
                    <ExternalLink className="w-5 h-5" />
                    View Full Profile on {selectedJournalist.outlet}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default TopJournalists;
