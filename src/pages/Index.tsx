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
import { TopicClusters } from "@/components/TopicClusters";
import { Footer } from "@/components/Footer";
import AuthorsFetcher from "@/components/AuthorsFetcher";
import { generateMockJournalists, generateGraphData } from "@/utils/mockData";
import type { GraphData, Journalist, Node } from "@/types/journalist";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

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

  // ---------------- Load mock graph data ----------------
  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const journalists = generateMockJournalists(50);
      const data: GraphData = generateGraphData(journalists);

      // Attach journalist to each node for filtering & TopInfluencers
      data.nodes = data.nodes.map((node) => {
        if (node.group === "author") {
          const journalist = journalists.find((j) => j.name === node.name);
          return { ...node, journalist: journalist! };
        }
        return node;
      });

      setGraphData(data);
      setFilteredData(data);
      setIsLoading(false);
    }, 500);
  };

  // ---------------- Fetch outlets ----------------
  const fetchOutlets = async () => {
    const urls = [
      "http://localhost:5002/api/authors/profiles",
      "https://aten-131r.onrender.com/api/authors/profiles"
    ];
    
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
    const urls = [
      "http://localhost:5002/top-journalists",
      "https://aten-131r.onrender.com/top-journalists",
    ];

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
