import { Button } from '@/components/ui/button';
import { useState } from 'react';
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
    <section
      className="py-12 px-6 bg-muted/30"
      style={{
        position: "relative",
        zIndex: 10
      }}
    >
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold font-mono text-foreground mb-2">
            Topic Clusters
          </h2>
          <p className="text-muted-foreground text-sm font-mono">
            Filter the network by topic category
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            justifyContent: "center"
          }}
        >
          {topics.map((topic) => {
            const isSelected = selectedTopic === topic.name;

            return (
              <button
                key={topic.name}
                onClick={() => onTopicClick(topic.name)}
                style={{
                  padding: "12px 26px",
                  borderRadius: "10px",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: "18px",
                  cursor: "pointer",
                  border: `3px solid ${topic.color}`,
                  background: isSelected ? topic.color : "rgba(26, 26, 26, 0.9)",
                  color: isSelected ? "#000" : "#fff",
                  boxShadow: isSelected
                    ? `0 0 25px ${topic.color}`
                    : "0 4px 12px rgba(0,0,0,0.5)",
                  transition: "all 0.2s ease-in-out",
                  position: "relative",
                  zIndex: 100,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = `${topic.color}30`;
                    e.currentTarget.style.boxShadow = `0 0 20px ${topic.color}80`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "rgba(26, 26, 26, 0.9)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
                  }
                }}
              >
                {topic.name}
                <span style={{ marginLeft: "6px", fontWeight: 400 }}>
                  ({topic.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TopicClusters;