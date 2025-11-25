import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';
import { FaUserTie, FaHashtag, FaNewspaper, FaLink, FaInfoCircle } from 'react-icons/fa';
import { BiNetworkChart } from 'react-icons/bi';

interface Node {
  id: string;
  name: string;
  type: 'journalist' | 'topic';
  val: number;
  color: string;
  articles?: number;
  outlet?: string;
  topics?: string[];
  influenceScore?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string;
  target: string;
  value: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

const TOPIC_COLORS: Record<string, string> = {
  'Politics': '#ef4444',
  'Business': '#10b981',
  'Technology': '#3b82f6',
  'Sports': '#f59e0b',
  'Entertainment': '#ec4899',
  'Health': '#14b8a6',
  'Environment': '#84cc16',
  'Crime': '#f97316',
  'International': '#06b6d4',
  'Education': '#8b5cf6'
};

export const NetworkGraph = ({ selectedTopics = [], selectedOutlets = [] }: { selectedTopics?: string[]; selectedOutlets?: string[] }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [stats, setStats] = useState({ journalists: 0, topics: 0, connections: 0, outlets: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuthors = async () => {
      setLoading(true);
      setError(null);
      
      const urls = [
        'http://localhost:5002/api/authors/profiles',
        'http://localhost:5002/authorprofiles',
        'https://aten-131r.onrender.com/api/authors/profiles',
        'https://aten-131r.onrender.com/authorprofiles'
      ];

      let authors: any[] | null = null;

      for (const url of urls) {
        try {
          const res = await axios.get(url, { timeout: 10000 });
          // Handle different response formats
          authors = res.data.profiles || res.data;
          if (authors && authors.length > 0) {
            console.log(`Successfully fetched ${authors.length} journalists from ${url}`);
            break;
          }
        } catch (err: any) {
          console.warn(`Failed to fetch from ${url}:`, err.message);
        }
      }

      if (!authors || !authors.length) {
        setError('No journalist data found in database. Please scrape some outlets first.');
        setLoading(false);
        return;
      }

      // Filter by selected outlets
      if (selectedOutlets.length > 0) {
        authors = authors.filter((a: any) => selectedOutlets.includes(a.outlet));
      }

      // Filter by selected topics
      if (selectedTopics.length > 0) {
        authors = authors.filter((a: any) => 
          a.topics && a.topics.some((t: string) => selectedTopics.includes(t))
        );
      }

      // Check if data has been analyzed
      const hasTopics = authors.some((a: any) => a.topics && a.topics.length > 0);
      const hasArticles = authors.some((a: any) => (a.articles || a.totalArticles || a.articleCount || 0) > 0);
      
      if (!hasTopics && !hasArticles) {
        setError(`Found ${authors.length} journalists but no articles or topics detected. Please re-scrape with the updated scraper to get article and topic data for network visualization.`);
        setLoading(false);
        return;
      }
      
      if (!hasTopics && hasArticles) {
        setError(`Found ${authors.length} journalists with ${authors.reduce((sum: number, a: any) => sum + (a.articles || a.totalArticles || a.articleCount || 0), 0)} articles, but topics are not categorized yet. The NLP analyzer needs to process the article titles to generate topics for the network graph. Please re-scrape to get topic data.`);
        setLoading(false);
        return;
      }

      // Build bipartite graph: Journalists ↔ Topics
      const nodes: Node[] = [];
      const links: Link[] = [];
      const topicMap = new Map<string, { count: number; journalists: Set<string>; totalArticles: number }>();
      const outletSet = new Set<string>();

      // Analyze data
      authors.forEach((author: any) => {
        const topics = author.topics || [];
        const outlet = author.outlet || 'Unknown';
        const articleCount = author.articles || author.totalArticles || author.articleCount || 0;
        outletSet.add(outlet);

        topics.forEach((topic: string) => {
          if (!topicMap.has(topic)) {
            topicMap.set(topic, { count: 0, journalists: new Set(), totalArticles: 0 });
          }
          const topicData = topicMap.get(topic)!;
          topicData.journalists.add(author.name);
          topicData.totalArticles += articleCount;
        });
      });

      // Create topic nodes (filter for significant topics with 2+ journalists)
      const significantTopics = Array.from(topicMap.entries())
        .filter(([_, data]) => data.journalists.size >= 2)
        .sort((a, b) => b[1].totalArticles - a[1].totalArticles)
        .slice(0, 15) // Top 15 topics
        .map(([topic, _]) => topic);

      significantTopics.forEach((topic) => {
        const data = topicMap.get(topic)!;
        nodes.push({
          id: `topic-${topic}`,
          name: topic,
          type: 'topic',
          val: Math.min(Math.sqrt(data.totalArticles) * 8, 80),
          color: TOPIC_COLORS[topic] || '#6b7280',
        });
      });

      // Create journalist nodes and links
      let journalistCount = 0;
      authors.forEach((author: any) => {
        const authorTopics = (author.topics || []).filter((t: string) => 
          significantTopics.includes(t)
        );
        
        const articleCount = author.articles || author.totalArticles || author.articleCount || 0;

        if (authorTopics.length === 0) return;

        const authorId = `journalist-${journalistCount++}`;
        nodes.push({
          id: authorId,
          name: author.name,
          type: 'journalist',
          val: Math.min(Math.sqrt(articleCount || 5) * 6, 40),
          color: '#22d3ee',
          articles: articleCount,
          outlet: author.outlet,
          topics: authorTopics,
          influenceScore: author.influence || author.influenceScore || 0,
        });

        authorTopics.forEach((topic: string) => {
          links.push({
            source: authorId,
            target: `topic-${topic}`,
            value: Math.min(articleCount || 1, 15),
          });
        });
      });

      console.log(`Graph built: ${journalistCount} journalists, ${significantTopics.length} topics, ${links.length} connections`);

      setGraphData({ nodes, links });
      setStats({
        journalists: journalistCount,
        topics: significantTopics.length,
        connections: links.length,
        outlets: outletSet.size
      });
      setLoading(false);
    };

    fetchAuthors();
  }, [selectedTopics, selectedOutlets]);

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0 || loading) return;

    const width = window.innerWidth;
    const height = window.innerHeight - 60;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Pre-calculate topic positions for performance
    const topicNodes = graphData.nodes.filter(n => n.type === 'topic');
    const journalistNodes = graphData.nodes.filter(n => n.type === 'journalist');
    const topicPositions = new Map<string, number>();
    
    // PRE-POSITION NODES for warm start (eliminates initial chaos)
    topicNodes.forEach((node, index) => {
      const xPos = width * (0.1 + (index / topicNodes.length) * 0.8);
      topicPositions.set(node.id, xPos);
      // Set initial positions
      node.x = xPos;
      node.y = height * 0.25;
      node.vx = 0;  // Zero velocity for instant start
      node.vy = 0;
    });
    
    // Position journalists in a grid below topics
    const cols = Math.ceil(Math.sqrt(journalistNodes.length));
    journalistNodes.forEach((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      node.x = width * (0.2 + (col / cols) * 0.6);
      node.y = height * (0.6 + (row / Math.ceil(journalistNodes.length / cols)) * 0.3);
      node.vx = 0;
      node.vy = 0;
    });

    // Optimized bipartite force simulation with warm start
    const simulation = d3
      .forceSimulation<Node>(graphData.nodes)
      .alpha(0.3)  // MUCH lower initial energy (was 0.8)
      .alphaMin(0.001)  // Stop earlier
      .alphaDecay(0.08)  // Even faster decay
      .velocityDecay(0.7)  // Even more friction
      .force('link', d3.forceLink<Node, Link>(graphData.links)
        .id(d => d.id)
        .distance(d => 150 - (d.value * 5))  // Shorter links
        .strength(0.3)  // MUCH weaker for smoother movement
        .iterations(1)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => d.type === 'topic' ? -400 : -150)  // Much weaker repulsion
        .distanceMax(300)  // Shorter range
        .theta(0.9)  // Less accurate but faster (was default 0.9)
      )
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.02))
      .force('collision', d3.forceCollide()
        .radius(d => d.val + 10)
        .strength(0.5)  // Gentler collision
        .iterations(1)
      )
      .force('y', d3.forceY<Node>()
        .y(d => d.type === 'topic' ? height * 0.25 : height * 0.75)
        .strength(0.2)  // Weaker vertical force
      )
      .force('x', d3.forceX<Node>()
        .x(d => d.type === 'topic' ? (topicPositions.get(d.id) || width / 2) : width / 2)
        .strength(0.1)  // Weaker horizontal force
      );

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', event => g.attr('transform', event.transform));
    
    svg.call(zoom);

    const link = g
      .append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke', d => {
        const opacity = Math.min(d.value / 15, 0.6);
        return `rgba(59, 130, 246, ${opacity})`;
      })
      .attr('stroke-width', d => Math.sqrt(d.value) * 1.2)
      .style('opacity', 0.4);

    const node = g
      .append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('r', d => d.val / 2)
      .attr('fill', d => d.color)
      .attr('stroke', d => d.type === 'topic' ? '#ffffff' : '#0891b2')
      .attr('stroke-width', d => d.type === 'topic' ? 3 : 2)
      .style('cursor', 'pointer')
      .style('filter', d => d.type === 'topic' 
        ? `drop-shadow(0 0 12px ${d.color})`
        : 'drop-shadow(0 0 6px rgba(34,211,238,0.7))'
      )
      .on('mouseenter', function (event, d) {
        // Pre-build connection map for better performance
        const connectedIds = new Set<string>([d.id]);
        
        // Use direct property access (faster than checking type)
        graphData.links.forEach(l => {
          const sourceId = (l.source as any).id || l.source;
          const targetId = (l.target as any).id || l.target;
          
          if (sourceId === d.id) connectedIds.add(targetId);
          if (targetId === d.id) connectedIds.add(sourceId);
        });

        // Batch DOM updates for better performance
        node
          .style('opacity', n => connectedIds.has(n.id) ? 1 : 0.15)
          .filter((n: Node) => n.id === d.id)
          .transition()
          .duration(150)
          .attr('r', d.val * 0.85);
        
        link.style('opacity', l => {
          const sourceId = (l.source as any).id || l.source;
          const targetId = (l.target as any).id || l.target;
          return (sourceId === d.id || targetId === d.id) ? 0.9 : 0.05;
        });
        
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'block';
          const bgColor = 'rgba(15,23,42,0.98)';
          const borderColor = d.color;
          let content = `<div style="background:${bgColor};padding:14px;border-radius:10px;border:2px solid ${borderColor};min-width:200px;">`;
          content += `<div style="color:${d.color};font-weight:600;font-size:15px;margin-bottom:8px;">${d.name}</div>`;
          
          if (d.type === 'journalist') {
            content += `<div style="color:#94a3b8;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">`;
            content += `<span style="color:#22d3ee;">●</span> ${d.outlet}</div>`;
            content += `<div style="color:#94a3b8;font-size:13px;margin-bottom:4px;">Articles: <strong style="color:#fff;">${d.articles}</strong></div>`;
            if (d.influenceScore) {
              content += `<div style="color:#94a3b8;font-size:13px;margin-bottom:4px;">Influence: <strong style="color:#fbbf24;">${d.influenceScore.toFixed(1)}</strong></div>`;
            }
            if (d.topics && d.topics.length > 0) {
              content += `<div style="color:#94a3b8;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid #334155;">`;
              content += `Coverage: ${d.topics.join(', ')}</div>`;
            }
          } else if (d.type === 'topic') {
            const connectedJournalists = graphData.links.filter(l => 
              (typeof l.target === 'string' ? l.target : (l.target as any).id) === d.id
            ).length;
            content += `<div style="color:#94a3b8;font-size:13px;">Journalists: <strong style="color:#fff;">${connectedJournalists}</strong></div>`;
          }
          
          content += '</div>';
          tooltipRef.current.innerHTML = content;
        }
      })
      .on('mousemove', function (event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = event.pageX + 15 + 'px';
          tooltipRef.current.style.top = event.pageY + 15 + 'px';
        }
      })
      .on('mouseleave', function (event, d) {
        // Reset all at once for better performance
        node
          .style('opacity', 1)
          .filter((n: Node) => n.id === d.id)
          .transition()
          .duration(150)
          .attr('r', d.val / 2);
        
        link.style('opacity', 0.4);
        
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      })
      .call(
        d3.drag<SVGCircleElement, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    const labels = g
      .append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .join('text')
      .text(d => d.type === 'topic' ? d.name : d.name.split(' ').slice(0, 2).join(' '))
      .attr('fill', '#e2e8f0')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.val / 2 + 18)
      .style('pointer-events', 'none')
      .style('font-size', d => d.type === 'topic' ? '13px' : '10px')
      .style('font-weight', d => d.type === 'topic' ? '600' : '400')
      .style('font-family', 'system-ui, -apple-system, sans-serif')
      .style('user-select', 'none')
      .style('text-shadow', '0 2px 4px rgba(0,0,0,0.8)');

    // Throttle tick updates using requestAnimationFrame for smooth 60fps
    let ticking = false;
    let tickCount = 0;
    const maxTicks = 150; // Stop after 150 ticks (~2.5 seconds) - warm start needs fewer ticks
    
    simulation.on('tick', () => {
      if (ticking) return;
      ticking = true;
      tickCount++;
      
      requestAnimationFrame(() => {
        link
          .attr('x1', (d: any) => d.source.x!)
          .attr('y1', (d: any) => d.source.y!)
          .attr('x2', (d: any) => d.target.x!)
          .attr('y2', (d: any) => d.target.y!);

        node.attr('cx', d => d.x!).attr('cy', d => d.y!);
        labels.attr('x', d => d.x!).attr('y', d => d.y!);
        
        ticking = false;
        
        // Stop simulation when settled or max ticks reached
        if (tickCount >= maxTicks || simulation.alpha() < 0.01) {
          simulation.stop();
        }
      });
    });

    return () => {
      simulation.stop();
      tickCount = 0;
    };
  }, [graphData, loading]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="w-16 h-16 text-cyan-400 mx-auto mb-4 animate-pulse">
            <BiNetworkChart size={64} />
          </div>
          <p className="text-gray-400 text-lg">Loading network graph from database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 text-amber-400 mx-auto mb-4">
            <FaInfoCircle size={64} />
          </div>
          <p className="text-gray-400 text-lg mb-4">{error}</p>
          <p className="text-gray-500 text-sm">Use the Scraper tab to fetch journalist data first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative bg-gray-950">
      {/* Stats Panel */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-cyan-500/20 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 text-cyan-400">
            <BiNetworkChart size={24} />
          </div>
          <h2 className="text-white font-semibold text-base">Network Analysis</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-3.5 h-3.5 text-cyan-400">
                <FaUserTie size={16} />
              </div>
              <span>Journalists</span>
            </div>
            <span className="text-white font-semibold">{stats.journalists}</span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-3.5 h-3.5 text-blue-400">
                <FaHashtag size={16} />
              </div>
              <span>Topics</span>
            </div>
            <span className="text-white font-semibold">{stats.topics}</span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-3.5 h-3.5 text-purple-400">
                <FaLink size={16} />
              </div>
              <span>Connections</span>
            </div>
            <span className="text-white font-semibold">{stats.connections}</span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-3.5 h-3.5 text-emerald-400">
                <FaNewspaper size={16} />
              </div>
              <span>Outlets</span>
            </div>
            <span className="text-white font-semibold">{stats.outlets}</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-cyan-500/20 shadow-xl">
        <h3 className="text-white font-semibold text-sm mb-3">Graph Legend</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-3.5 h-3.5 rounded-full border-2"
              style={{ backgroundColor: '#22d3ee', borderColor: '#0891b2' }}
            ></div>
            <span className="text-gray-300">Journalists</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div 
              className="w-3.5 h-3.5 rounded-full border-2"
              style={{ backgroundColor: '#ef4444', borderColor: 'white' }}
            ></div>
            <span className="text-gray-300">Topics/Categories</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-12 h-0.5 bg-blue-500/40"></div>
            <span className="text-gray-300">Coverage Link</span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-700 space-y-1 text-xs text-gray-400">
          <div>Hover: Highlight connections</div>
          <div>Drag: Reposition nodes</div>
          <div>Scroll: Zoom in/out</div>
        </div>
      </div>

      {/* Info Badge */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-cyan-500/20 text-xs text-gray-400">
        Bipartite Graph: Journalists ↔ Topics
      </div>

      <svg ref={svgRef} className="w-full h-full" style={{ background: 'linear-gradient(to bottom, #0a0a0a, #0f172a)' }} />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          display: 'none',
          zIndex: 1000,
        }}
      />
    </div>
  );
};
