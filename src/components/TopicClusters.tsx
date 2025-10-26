import { Button } from '@/components/ui/button';

interface TopicClustersProps {
  topics: Array<{ name: string; color: string; count: number }>;
  selectedTopic: string | null;
  onTopicClick: (topic: string) => void;
}

export const TopicClusters = ({
  topics,
  selectedTopic,
  onTopicClick,
}: TopicClustersProps) => {
  return (
    <section className="py-12 px-6 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold font-mono text-foreground mb-2">
            Topic Clusters
          </h2>
          <p className="text-muted-foreground text-sm font-mono">
            Filter the network by topic category
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {topics.map((topic) => (
            <Button
              key={topic.name}
              onClick={() => onTopicClick(topic.name)}
              className={`transition-all ${
                selectedTopic === topic.name
                  ? 'scale-110'
                  : 'hover:scale-105'
              }`}
              style={{
                backgroundColor:
                  selectedTopic === topic.name ? topic.color : 'transparent',
                borderColor: topic.color,
                borderWidth: '2px',
                color: selectedTopic === topic.name ? '#0d0d0d' : topic.color,
                boxShadow:
                  selectedTopic === topic.name ? `0 0 20px ${topic.color}40` : 'none',
              }}
            >
              <span className="font-mono font-medium">{topic.name}</span>
              <span className="ml-2 text-xs opacity-70">({topic.count})</span>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
};
