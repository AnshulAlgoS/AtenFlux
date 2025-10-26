export interface Journalist {
  id: string;
  name: string;
  outlet: string;
  articles: number;
  influence: number;
  topics: string[];
  color: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    name: string;
    val: number;
    color: string;
    journalist: Journalist;
  }>;
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
}
