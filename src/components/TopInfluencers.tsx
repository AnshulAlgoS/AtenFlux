import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, Award } from 'lucide-react';
import { Journalist } from '@/types/journalist';
import { getFallbackUrls, API_ENDPOINTS } from '@/config/api';

export const TopInfluencers = ({ onJournalistClick }: { onJournalistClick?: (id: string) => void }) => {
  const [journalists, setJournalists] = useState<Journalist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchTopJournalists = async () => {
      const urls = getFallbackUrls(API_ENDPOINTS.TOP_JOURNALISTS);
      let data: Journalist[] | null = null;

      for (const url of urls) {
        try {
          const res = await fetch(url);
          data = await res.json();
          console.log(`Successfully fetched top journalists from ${url}`);
          break;
        } catch (err: any) {
          console.warn(`Failed to fetch from ${url}:`, err.message);
        }
      }

      if (!data) {
        console.error('Failed to fetch top journalists from all endpoints');
        setLoading(false);
        return;
      }

      setJournalists(data);
      setLoading(false);
    };

    fetchTopJournalists();
  }, []);

  if (loading) return <p className="text-center font-mono text-sm text-muted-foreground">Loading top influencers...</p>;
  if (!journalists.length) return <p className="text-center font-mono text-sm text-muted-foreground">No influencers found.</p>;

  return (
    <Card className="bg-card border-primary/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase text-primary">Top Influencers</h3>
        <Award className="text-primary w-4 h-4" />
      </div>

      <div className="space-y-3">
        {journalists.map((journalist, index) => (
          <div
            key={journalist.id}
            onClick={() => onJournalistClick?.(journalist.id)}
            className="p-3 bg-muted border-l-2 cursor-pointer transition-all hover:bg-muted/70 hover:scale-[1.02]"
            style={{ borderColor: journalist.color }}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-background text-foreground font-bold text-sm font-mono">
                #{index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate font-mono">{journalist.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{journalist.outlet}</p>
                <div className="flex items-center gap-2 mt-2">
                  <TrendingUp className="w-3 h-3" style={{ color: journalist.color }} />
                  <span className="text-xs font-mono" style={{ color: journalist.color }}>
                    {journalist.influence.toFixed(1)} influence
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {journalist.topics.slice(0, 2).map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-0.5 bg-background text-xs font-mono"
                      style={{ borderLeft: `2px solid ${journalist.color}` }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
