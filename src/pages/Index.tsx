"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { NetworkGraph } from "@/components/NetworkGraph";
import { ParticleBackground } from "@/components/ParticleBackground";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TopInfluencers } from "@/components/TopInfluencers";
import { FiltersPanel } from "@/components/FiltersPanel";
import TopicClusters from "@/components/TopicClusters";
import { Footer } from "@/components/Footer";
import AuthorsFetcher from "@/components/AuthorsFetcher";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getFallbackUrls, API_ENDPOINTS } from "@/config/api";
import type { GraphData, Journalist } from "@/types/journalist";

const Index = () => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [topJournalists, setTopJournalists] = useState<Journalist[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
  const graphRef = useRef<HTMLDivElement>(null);

  const topics = [
    "Technology",
    "Politics",
    "Business",
    "Science",
    "Entertainment",
    "Sports",
    "Health",
    "Environment",
  ];

  const topicColors: Record<string, string> = {
    Technology: "hsl(180, 100%, 50%)",
    Politics: "hsl(300, 100%, 50%)",
    Business: "hsl(30, 100%, 50%)",
    Science: "hsl(120, 100%, 50%)",
    Entertainment: "hsl(270, 100%, 50%)",
    Sports: "hsl(0, 100%, 50%)",
    Health: "hsl(150, 100%, 50%)",
    Environment: "hsl(90, 100%, 50%)",
  };

  const topicClusters = topics.map((topic) => ({
    name: topic,
    color: topicColors[topic],
    count: graphData.nodes.filter((n) => n.journalist?.topics.includes(topic)).length,
  }));

  // ---------------- Load real graph data from API ----------------
  const loadData = async () => {
    setIsLoading(true);
    try {
      const urls = getFallbackUrls(API_ENDPOINTS.AUTHOR_PROFILES);
      
      for (const url of urls) {
        try {
          const res = await axios.get(url, { timeout: 10000 });
          const profiles = res.data.profiles || res.data || [];
          
          if (profiles.length > 0) {
            // Transform profiles into graph data structure
            const nodes = profiles.slice(0, 100).map((profile: any, idx: number) => ({
              id: `author-${idx}`,
              name: profile.name,
              group: 'author',
              journalist: {
                id: profile._id,
                name: profile.name,
                outlet: profile.outlet,
                topics: profile.topics || [],
                articles: profile.articles || 0,
                influence: profile.influence || 0,
                profilePic: profile.profilePic,
                bio: profile.bio,
              }
            }));
            
            // Create topic nodes
            const topicSet = new Set<string>();
            profiles.forEach((p: any) => {
              if (p.topics) {
                p.topics.forEach((t: string) => topicSet.add(t));
              }
            });
            
            const topicNodes = Array.from(topicSet).map((topic, idx) => ({
              id: `topic-${idx}`,
              name: topic,
              group: 'topic'
            }));
            
            // Create links between authors and topics
            const links: any[] = [];
            profiles.forEach((profile: any, idx: number) => {
              if (profile.topics) {
                profile.topics.forEach((topic: string) => {
                  const topicIdx = Array.from(topicSet).indexOf(topic);
                  if (topicIdx !== -1) {
                    links.push({
                      source: `author-${idx}`,
                      target: `topic-${topicIdx}`,
                      value: 1
                    });
                  }
                });
              }
            });
            
            const graphData: GraphData = {
              nodes: [...nodes, ...topicNodes],
              links
            };
            
            setGraphData(graphData);
            setFilteredData(graphData);
            break;
          }
        } catch (err) {
          console.warn(`Failed to load data from ${url}`);
        }
      }
    } catch (error) {
      console.error('Error loading graph data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------- Fetch outlets ----------------
  const fetchOutlets = async () => {
    const urls = getFallbackUrls(API_ENDPOINTS.AUTHOR_PROFILES);
    
    for (const url of urls) {
      try {
        const res = await axios.get(url, { timeout: 5000 });
        const profiles = res.data.profiles || res.data || [];
        // Extract unique outlets from author profiles
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

  // ---------------- Fetch top journalists ----------------
  const fetchTopJournalists = async () => {
    const urls = getFallbackUrls(API_ENDPOINTS.TOP_JOURNALISTS);

    let data: Journalist[] | null = null;
    for (const url of urls) {
      try {
        const res = await axios.get(url);
        data = res.data;
        break;
      } catch {}
    }

    if (data) setTopJournalists(data);
  };

  useEffect(() => {
    loadData();
    fetchOutlets();
    fetchTopJournalists();
  }, []);

  // ---------------- Filters ----------------
  const handleFilterChange = (filters: { topics: string[]; outlets: string[] }) => {
    setSelectedTopics(filters.topics);
    setSelectedOutlets(filters.outlets);
    
    if (filters.topics.length === 0 && filters.outlets.length === 0) {
      setFilteredData(graphData);
      setSelectedTopic(null);
      return;
    }

    const filteredNodes = graphData.nodes.filter((node) => {
      const matchesTopic =
        filters.topics.length === 0 ||
        node.journalist?.topics.some((t) => filters.topics.includes(t));
      const matchesOutlet =
        filters.outlets.length === 0 || filters.outlets.includes(node.journalist?.outlet || "");
      return matchesTopic && matchesOutlet;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = graphData.links.filter(
      (link) =>
        nodeIds.has(link.source.toString()) && nodeIds.has(link.target.toString())
    );

    setFilteredData({ nodes: filteredNodes, links: filteredLinks });
  };

  const handleTopicClick = (topic: string) => {
    if (selectedTopic === topic) {
      setSelectedTopic(null);
      setFilteredData(graphData);
    } else {
      setSelectedTopic(topic);
      handleFilterChange({ topics: [topic], outlets: [] });
    }
  };

  const handleExplore = () => {
    graphRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <ParticleBackground />
      <Header />

      <Hero onExplore={handleExplore} />

      <section className="container mx-auto py-12 px-6">
        <AuthorsFetcher />
      </section>

      <section ref={graphRef} className="relative py-12 px-6">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold font-mono text-foreground mb-2">
                Network <span className="text-primary">Graph</span>
              </h2>
              <p className="text-muted-foreground text-sm font-mono">
                Interactive journalist network visualization
              </p>
            </div>
            <Button
              onClick={loadData}
              disabled={isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh Data
            </Button>
          </div>

          <div className="grid lg:grid-cols-[250px_1fr_300px] gap-6">
            <div className="space-y-6">
              <FiltersPanel
                topics={topics}
                outlets={outlets}
                onFilterChange={handleFilterChange}
              />
            </div>

            <div className="bg-muted border border-primary/20 h-[800px] relative overflow-hidden">
              <NetworkGraph 
                selectedTopics={selectedTopics}
                selectedOutlets={selectedOutlets}
              />
            </div>

            <div className="space-y-6">
              <TopInfluencers />
              <ActivityFeed />
            </div>
          </div>
        </div>
      </section>

      <TopicClusters
        topics={topicClusters}
        selectedTopic={selectedTopic}
        onTopicClick={handleTopicClick}
      />

      <Footer />
    </div>
  );
};

export default Index;
