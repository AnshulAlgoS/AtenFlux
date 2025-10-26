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

 useEffect(() => {
  const fetchActivities = async () => {
    try {
      const urls = [
        "http://localhost:5003/activities",
        "https://aten-131r.onrender.com/activities"
      ];
      const responses = await Promise.all(urls.map(url => fetch(url)));
      const dataArrays = await Promise.all(responses.map(res => res.json()));
      const combinedData: Activity[] = dataArrays.flat();
      setActivities(combinedData);
    } catch (err) {
      console.error("Error fetching activities:", err);
    }
  };

  fetchActivities();
  const interval = setInterval(fetchActivities, 5000);
  return () => clearInterval(interval);
}, []);


  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <Card className="bg-card border-primary/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase text-primary">Live Activity</h3>
        <TrendingUp className="text-primary w-4 h-4" />
      </div>

      <ScrollArea className="h-[600px] pr-4">
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
      </ScrollArea>
    </Card>
  );
};
