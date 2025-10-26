"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Card } from "@/components/ui/card";
import { TrendingUp, Award, FileText, ThumbsUp, ThumbsDown } from "lucide-react";

const MAIN_TOPICS = ["Politics", "Entertainment", "Sports", "Business", "Tech", "Science"];
const COLORS = ["#10B981", "#EC4899", "#F97316", "#EAB308", "#3B82F6", "#8B5CF6"];

interface Journalist {
  _id: string;
  name: string;
  outlet: string;
  influence?: number;
  articles?: number;
  topics?: string[];
  color?: string;
  upvotes?: number;
  downvotes?: number;
}

const TopJournalists = () => {
  const [journalists, setJournalists] = useState<Journalist[]>([]);

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

  useEffect(() => {
    const fetchJournalists = async () => {
      const urls = [
        "http://localhost:5003/authorprofiles",
        "https://aten-a6od.onrender.com/authorprofiles",
      ];
      let data: Journalist[] | null = null;

      for (const url of urls) {
        try {
          const res = await axios.get<Journalist[]>(url);
          data = res.data.map((j, i) => ({
            ...j,
            topics: j.topics?.filter((t) => MAIN_TOPICS.includes(t)).slice(0, 3),
            color: COLORS[i % COLORS.length],
          }));
          console.log(`Fetched journalists from ${url}`);
          break;
        } catch (err: any) {
          console.warn(`Failed to fetch journalists from ${url}:`, err.message);
        }
      }

      if (data) setJournalists(data);
    };

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
          </div>

          {/* Journalists Grid */}
          <div className="grid md:grid-cols-2 gap-8">
            {journalists.map((journalist, index) => (
              <Card
                key={journalist._id}
                className="bg-card border border-card/30 p-6 rounded-lg shadow-lg transition-transform hover:scale-[1.03] hover:shadow-2xl cursor-pointer animate-fade-in"
                style={{ borderColor: `${journalist.color}30` }}
              >
                <div className="flex items-start gap-4">
                  {/* Rank Circle */}
                  <div
                    className="w-16 h-16 flex items-center justify-center text-2xl font-bold font-mono rounded-full animate-pulse-glow"
                    style={{ backgroundColor: journalist.color, color: "#0d0d0d" }}
                  >
                    #{index + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold font-mono text-foreground mb-1">{journalist.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{journalist.outlet}</p>

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
                            {journalist.articles || 0}
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

                    {/* Vote Buttons */}
                    <div className="flex gap-4 mt-2">
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
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TopJournalists;
