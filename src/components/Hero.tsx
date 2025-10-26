import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import React, { useEffect, useState, useRef } from 'react';

interface HeroProps {
  onExplore: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExplore }) => {
  const nodeCount = 12;
  const orbitRadius = 180;
  const containerRef = useRef<SVGSVGElement>(null);

  const nodes = Array.from({ length: nodeCount }).map((_, i) => {
    const angle = (i / nodeCount) * 2 * Math.PI;
    return {
      x: orbitRadius * Math.cos(angle),
      y: orbitRadius * Math.sin(angle),
    };
  });

  const [visibleLines, setVisibleLines] = useState(0);

  const lines: { start: typeof nodes[0]; end: typeof nodes[0] }[] = [];
  nodes.forEach((start, i) => {
    nodes.forEach((end, j) => {
      if (i < j) lines.push({ start, end });
    });
  });

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setVisibleLines((prev) => Math.min(prev + 1, lines.length));
      i++;
      if (i >= lines.length) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, [lines.length]);

  // Compute center in pixels
  const [center, setCenter] = useState({ x: 250, y: 250 }); // default fallback
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCenter({ x: rect.width / 2, y: rect.height / 2 });
    }
  }, []);

  return (
    <section className="pt-32 pb-20 px-6">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div className="space-y-6 relative z-10">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground font-mono leading-tight">
              Track, Analyze, and Visualize{' '}
              <span className="text-primary">Network Connections</span> in Real-Time
            </h1>
            <p className="text-xl text-muted-foreground font-mono">
              Discover relationships, map patterns, and visualize the connections shaping today's networks.
            </p>
            <div className="flex gap-4">
              <Button
                onClick={onExplore}
                className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan"
              >
                Explore Network
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="border-primary/50 text-foreground hover:bg-muted"
              >
                Watch Demo
              </Button>
            </div>
          </div>

          {/* Right */}
          <div className="relative w-full h-[500px] flex items-center justify-center perspective-1500">
            <div className="absolute text-center font-extrabold text-6xl text-cyan-400 z-20 animate-pulse-glow">
              Truth
            </div>

            <div className="relative w-full h-full animate-rotate-3d">
              <svg
                ref={containerRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <defs>
                  <filter id="glow">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22d3ee" />
                  </filter>
                </defs>
                {lines.slice(0, visibleLines).map((line, idx) => (
                  <line
                    key={idx}
                    x1={center.x + line.start.x}
                    y1={center.y + line.start.y}
                    x2={center.x + line.end.x}
                    y2={center.y + line.end.y}
                    stroke="rgba(34, 211, 238, 0.6)"
                    strokeWidth={2}
                    filter="url(#glow)"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .perspective-1500 {
          perspective: 1500px;
        }

        @keyframes rotate-3d {
          0% { transform: rotateX(0deg) rotateY(0deg); }
          50% { transform: rotateX(20deg) rotateY(180deg); }
          100% { transform: rotateX(0deg) rotateY(360deg); }
        }
        .animate-rotate-3d {
          animation: rotate-3d 12s linear infinite;
          transform-origin: center center;
        }

        @keyframes pulse-glow {
          0% { text-shadow: 0 0 15px #22d3ee, 0 0 30px #06b6d4; }
          50% { text-shadow: 0 0 30px #06b6d4, 0 0 60px #22d3ee; }
          100% { text-shadow: 0 0 15px #22d3ee, 0 0 30px #06b6d4; }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s infinite alternate;
        }
      `}</style>
    </section>
  );
};
