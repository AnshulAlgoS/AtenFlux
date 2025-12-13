import { Journalist } from '@/types/journalist';
import { Card } from '@/components/ui/card';

interface JournalistCardProps {
  journalist: Journalist;
  position: { x: number; y: number };
}

export const JournalistCard = ({ journalist, position }: JournalistCardProps) => {
  return (
    <Card
      className="fixed z-50 p-4 w-64 bg-card border-2 animate-fade-in pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        borderColor: journalist.color,
        boxShadow: `0 0 20px ${journalist.color}40`,
      }}
    >
      <div className="space-y-2">
        <h3 className="font-bold text-lg text-foreground">{journalist.name}</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <span className="text-primary">Outlet:</span> {journalist.outlet}
          </p>
          <p>
            <span className="text-primary">Articles:</span> {journalist.articles}
          </p>
          <p>
            <span className="text-primary">Influence Score:</span>{' '}
            {journalist.influence.toFixed(1)}
          </p>
          <div>
            <span className="text-primary">Topics:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {journalist.topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 bg-muted text-xs"
                  style={{
                    borderLeft: `2px solid ${journalist.color}`,
                  }}
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
