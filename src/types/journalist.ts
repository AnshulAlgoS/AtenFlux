export interface Journalist {
  id: string;
  name: string;
  outlet: string;
  articles: number;
  influence: number;
  topics: string[];
  color: string;
}

export interface Node {
  id: string;
  name: string;
  val: number;
  color: string;
  group?: string;
  journalist?: Journalist;
}

export interface GraphData {
  nodes: Node[];
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
}
