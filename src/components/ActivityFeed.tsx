import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, FileText, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: 'journalist' | 'article';
  name: string;
  outlet?: string;
  topic?: string;
  timestamp: Date;
}

export const ActivityFeed = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const urls = [
          "https://aten-131r.onrender.com/api/authors/profiles",
          "http://localhost:5002/api/authors/profiles"

        ];
        
        let profiles: any[] = [];
        
        for (const url of urls) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            profiles = data.profiles || data || [];
            if (profiles.length > 0) {
              console.log(`Fetched ${profiles.length} profiles for activity feed from ${url}`);
              break;
            }
          } catch (err) {
            console.warn(`Failed to fetch from ${url}`);
          }
        }

        if (profiles.length === 0) {
          setLoading(false);
          return;
        }

        // Generate activities from profiles and their articles
        const generatedActivities: Activity[] = [];
        
        profiles.forEach((profile: any) => {
          // Add journalist profile activity
          generatedActivities.push({
            id: `journalist-${profile._id || profile.name}`,
            type: 'journalist',
            name: profile.name,
            outlet: profile.outlet,
            topic: profile.topics?.[0] || 'News',
            timestamp: new Date(profile.createdAt || Date.now() - Math.random() * 86400000 * 7) // Random within last 7 days
          });

          // Add article activities if available
          if (profile.articleData && Array.isArray(profile.articleData)) {
            profile.articleData.slice(0, 2).forEach((article: any, idx: number) => {
              generatedActivities.push({
                id: `article-${profile._id || profile.name}-${idx}`,
                type: 'article',
                name: article.title || 'Untitled Article',
                outlet: profile.outlet,
                topic: profile.topics?.[0] || 'News',
                timestamp: new Date(article.scrapedAt || article.publishedAt || Date.now() - Math.random() * 86400000 * 3)
              });
            });
          }
        });

        // Sort by timestamp (most recent first) and take top 20
        const sortedActivities = generatedActivities
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 20);

        setActivities(sortedActivities);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching activities:", err);
        setLoading(false);
      }
    };

    fetchActivities();
    const interval = setInterval(fetchActivities, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card className="bg-card border-primary/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase text-primary">Live Activity</h3>
        <TrendingUp className="text-primary w-4 h-4" />
      </div>

      <ScrollArea className="h-[600px] pr-4">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-xs font-mono text-muted-foreground">Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs font-mono text-muted-foreground">No activities yet. Scrape some outlets first!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="p-3 bg-muted border-l-2 border-primary/50 animate-fade-in"
              >
                <div className="flex items-start gap-3">
                  <FileText
                    className={`w-4 h-4 mt-0.5 ${
                      activity.type === 'journalist' ? 'text-primary' : 'text-secondary'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium text-foreground truncate">
                      {activity.name}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {activity.outlet} • {activity.topic}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
