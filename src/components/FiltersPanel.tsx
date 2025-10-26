import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';

interface FiltersPanelProps {
  topics: string[];
  outlets: string[];
  onFilterChange: (filters: { topics: string[]; outlets: string[] }) => void;
}

export const FiltersPanel = ({ topics, outlets, onFilterChange }: FiltersPanelProps) => {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);

  const toggleTopic = (topic: string) => {
    const newTopics = selectedTopics.includes(topic)
      ? selectedTopics.filter((t) => t !== topic)
      : [...selectedTopics, topic];
    setSelectedTopics(newTopics);
    onFilterChange({ topics: newTopics, outlets: selectedOutlets });
  };

  const toggleOutlet = (outlet: string) => {
    const newOutlets = selectedOutlets.includes(outlet)
      ? selectedOutlets.filter((o) => o !== outlet)
      : [...selectedOutlets, outlet];
    setSelectedOutlets(newOutlets);
    onFilterChange({ topics: selectedTopics, outlets: newOutlets });
  };

  const clearFilters = () => {
    setSelectedTopics([]);
    setSelectedOutlets([]);
    onFilterChange({ topics: [], outlets: [] });
  };

  return (
    <Card className="bg-card border-primary/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="text-primary w-4 h-4" />
          <h3 className="text-sm font-mono uppercase text-primary">Filters</h3>
        </div>
        {(selectedTopics.length > 0 || selectedOutlets.length > 0) && (
          <Button
            onClick={clearFilters}
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Topics */}
      <div className="mb-6">
        <h4 className="text-xs font-mono uppercase text-muted-foreground mb-3">
          Topics
        </h4>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <Button
              key={topic}
              onClick={() => toggleTopic(topic)}
              variant={selectedTopics.includes(topic) ? 'default' : 'outline'}
              size="sm"
              className={`text-xs font-mono transition-all ${
                selectedTopics.includes(topic)
                  ? 'bg-primary text-primary-foreground glow-cyan'
                  : 'border-primary/30 hover:border-primary/60'
              }`}
            >
              {topic}
            </Button>
          ))}
        </div>
      </div>

      {/* Outlets */}
      <div>
        <h4 className="text-xs font-mono uppercase text-muted-foreground mb-3">
          Outlets
        </h4>
        <div className="flex flex-wrap gap-2">
          {outlets.slice(0, 6).map((outlet) => (
            <Button
              key={outlet}
              onClick={() => toggleOutlet(outlet)}
              variant={selectedOutlets.includes(outlet) ? 'default' : 'outline'}
              size="sm"
              className={`text-xs font-mono transition-all ${
                selectedOutlets.includes(outlet)
                  ? 'bg-secondary text-secondary-foreground glow-magenta'
                  : 'border-secondary/30 hover:border-secondary/60'
              }`}
            >
              {outlet}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
};
