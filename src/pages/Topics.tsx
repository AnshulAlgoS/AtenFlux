"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ParticleBackground } from "@/components/ParticleBackground";
import { NetworkGraph } from "@/components/NetworkGraph";
import { FiltersPanel } from "@/components/FiltersPanel";
import { Card } from "@/components/ui/card";
import { Tag } from "lucide-react";

const COLORS = ["#10B981", "#EC4899", "#F97316", "#EAB308", "#3B82F6", "#8B5CF6", "#14B8A6", "#84CC16"];
const TOPICS = [
  "Technology",
  "Politics",
  "Business",
  "Science",
  "Entertainment",
  "Sports",
  "Health",
  "Environment",
];

interface JournalistInfo {
  name: string;
  profileLink: string;
  outlet: string;
  profilePic?: string;
  articleCount?: number;
}

interface Topic {
  name: string;
  journalistCount?: number;
  topJournalists?: JournalistInfo[];
  color?: string;
  description?: string;
}

const Topics = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);

  const handleFilterChange = (filters: { topics: string[]; outlets: string[] }) => {
    setSelectedTopics(filters.topics);
    setSelectedOutlets(filters.outlets);
  };

  useEffect(() => {
    const fetchTopics = async () => {
      const urls = ["https://aten-131r.onrender.com/topics", "http://localhost:5002/topics"];
      let data: Topic[] | null = null;

      for (const url of urls) {
        try {
          const res = await axios.get<Topic[]>(url);
          data = res.data;
          console.log(`Fetched topics from ${url}`);
          break;
        } catch (err: any) {
          console.warn(`Failed to fetch topics from ${url}:`, err.message);
        }
      }

      if (data) {
        const filtered: Topic[] = data
          .filter((t) => TOPICS.includes(t.name))
          .map((t, i) => ({
            ...t,
            color: COLORS[i % COLORS.length],
            description: `Explore latest news and top journalists in ${t.name}.`,
            journalistCount: t.journalistCount || 0,
            topJournalists: t.topJournalists || [],
          }));
        setTopics(filtered);
      }
    };

    const fetchOutlets = async () => {
      const urls = [
        "https://aten-131r.onrender.com/api/authors/profiles",
        "http://localhost:5002/api/authors/profiles"
      ];

      for (const url of urls) {
        try {
          const res = await axios.get(url, { timeout: 5000 });
          const profiles = res.data.profiles || res.data || [];
          const uniqueOutlets = [...new Set(profiles.map((p: any) => p.outlet).filter(Boolean))] as string[];
          if (uniqueOutlets.length > 0) {
            setOutlets(uniqueOutlets);
            break;
          }
        } catch (err) {
          console.warn(`Failed to fetch outlets from ${url}`);
        }
      }
    };

    fetchTopics();
    fetchOutlets();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <ParticleBackground />
      <Header />

      <main className="pt-32 pb-20 px-6 relative z-10">
        <div className="container mx-auto max-w-7xl">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Tag className="text-primary w-12 h-12" />
              <h1 className="text-5xl font-bold font-mono text-foreground">
                Topic <span className="text-primary">Network</span>
              </h1>
            </div>
            <p className="text-xl text-muted-foreground font-mono">
              Explore journalist-topic relationships and filter by outlet
            </p>
          </div>

          {/* Network Graph with Filters */}
          <div className="grid lg:grid-cols-[280px_1fr] gap-6 mb-12">
            <div className="space-y-6">
              <FiltersPanel
                topics={TOPICS}
                outlets={outlets}
                onFilterChange={handleFilterChange}
              />
            </div>

            <div className="bg-muted border border-primary/20 h-[800px] relative overflow-hidden rounded-lg">
              <NetworkGraph
                selectedTopics={selectedTopics}
                selectedOutlets={selectedOutlets}
              />
            </div>
          </div>

          {/* Topics Grid */}
          <div className="mt-16">
            <h2 className="text-3xl font-bold font-mono text-foreground mb-8 text-center">
              Browse by <span className="text-primary">Topic</span>
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topics.map((topic) => (
                <Card
                  key={topic.name}
                  className="bg-card border border-card/30 p-6 transition-transform hover:scale-105 cursor-pointer animate-fade-in"
                  style={{ borderColor: `${topic.color}30` }}
                >
                  <div className="w-full h-2 mb-6 rounded-full" style={{ backgroundColor: topic.color }} />

                  <h3 className="text-2xl font-bold font-mono text-foreground mb-2">
                    {topic.name}
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono mb-6 leading-relaxed">
                    {topic.description}
                  </p>

                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground uppercase font-mono">
                      Top Journalists
                    </p>
                    {topic.topJournalists?.map((j, idx) => (
                      <p key={idx} className="text-sm font-mono text-foreground">
                        • {j.name} ({j.outlet}) - {j.articleCount || 0} articles
                      </p>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-mono">
                      Total Journalists
                    </p>
                    <p className="text-2xl font-bold font-mono" style={{ color: topic.color }}>
                      {topic.journalistCount || 0}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Topics;