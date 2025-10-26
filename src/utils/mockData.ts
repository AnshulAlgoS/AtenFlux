import { Journalist, GraphData } from '@/types/journalist';

const topics = [
  'Technology',
  'Politics',
  'Business',
  'Science',
  'Entertainment',
  'Sports',
  'Health',
  'Environment',
];

const outlets = [
  'TechCrunch',
  'The Verge',
  'Wired',
  'Bloomberg',
  'Reuters',
  'Associated Press',
  'New York Times',
  'Washington Post',
  'Wall Street Journal',
  'CNN',
  'BBC',
  'Guardian',
];

const colors = [
  'hsl(180, 100%, 50%)', // cyan
  'hsl(300, 100%, 50%)', // magenta
  'hsl(30, 100%, 50%)',  // orange
  'hsl(120, 100%, 50%)', // green
];

const firstNames = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
  'Riley', 'Quinn', 'Avery', 'Parker', 'Reese',
  'Cameron', 'Blake', 'Drew', 'Sage', 'Rowan',
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Martinez', 'Rodriguez', 'Lee', 'Walker',
  'Chen', 'Patel', 'Kim', 'Nguyen', 'Anderson',
];

export const generateMockJournalists = (count: number): Journalist[] => {
  const journalists: Journalist[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const journalistTopics = topics
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 3) + 1);

    journalists.push({
      id: `journalist-${i}`,
      name: `${firstName} ${lastName}`,
      outlet: outlets[Math.floor(Math.random() * outlets.length)],
      articles: Math.floor(Math.random() * 500) + 50,
      influence: Math.random() * 100,
      topics: journalistTopics,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  return journalists;
};

export const generateGraphData = (journalists: Journalist[]): GraphData => {
  const nodes = journalists.map((j) => ({
    id: j.id,
    name: j.name,
    val: j.influence,
    color: j.color,
    journalist: j,
  }));

  // Create links based on shared topics or outlets
  const links: GraphData['links'] = [];
  for (let i = 0; i < journalists.length; i++) {
    for (let j = i + 1; j < journalists.length; j++) {
      const sharedTopics = journalists[i].topics.filter((t) =>
        journalists[j].topics.includes(t)
      );
      const sameOutlet = journalists[i].outlet === journalists[j].outlet;

      if (sharedTopics.length > 0 || sameOutlet) {
        const strength = sharedTopics.length + (sameOutlet ? 2 : 0);
        if (Math.random() > 0.7) {
          // Only create some links to avoid overcrowding
          links.push({
            source: journalists[i].id,
            target: journalists[j].id,
            value: strength,
          });
        }
      }
    }
  }

  return { nodes, links };
};
