import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

interface Node {
  id: string;
  name: string;
  group: string; 
  val: number;
  color: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string;
  target: string;
  value: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

export const NetworkGraph = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  useEffect(() => {
    const fetchAuthors = async () => {
      const urls = [
        'http://localhost:5003/authors',
        'https://aten-a6od.onrender.com/authors'
      ];

      let authors: any[] | null = null;

      for (const url of urls) {
        try {
          const res = await axios.get(url);
          authors = res.data;
           console.log(`Successfully fetched authors from ${url}`); 
          break; 
        } catch (err: any) {
          console.warn(`Failed to fetch from ${url}: ${err.message}`);
        }
      }

      if (!authors || !authors.length) {
        console.error('No authors found or all endpoints failed');
        return;
      }

      const nodes: Node[] = [];
      const links: Link[] = [];
      const outletMap: Record<string, string> = {};

      authors.forEach((a: any, i: number) => {
        const authorId = `author-${i}`;
        nodes.push({
          id: authorId,
          name: a.name,
          group: 'author',
          val: 50,
          color: '#00ffff',
          x: window.innerWidth / 2 + Math.random() * 50 - 25,
          y: window.innerHeight / 2 + Math.random() * 50 - 25,
        });

        let outletId = outletMap[a.outlet];
        if (!outletId) {
          outletId = `outlet-${Object.keys(outletMap).length}`;
          outletMap[a.outlet] = outletId;
          nodes.push({
            id: outletId,
            name: a.outlet,
            group: 'outlet',
            val: 80,
            color: '#ff00ff',
            x: window.innerWidth / 2 + Math.random() * 50 - 25,
            y: window.innerHeight / 2 + Math.random() * 50 - 25,
          });
        }

        links.push({ source: authorId, target: outletId, value: 2 });
      });

      setGraphData({ nodes, links });
    };

    fetchAuthors();
  }, []);


  // D3 Graph 
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Simulation 
    const simulation = d3
      .forceSimulation<Node>(graphData.nodes)
      .force('link', d3.forceLink<Node, Link>(graphData.links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.val / 2 + 5));

    // Zoom 
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on('zoom', event => g.attr('transform', event.transform))
    );

    // Links 
    const link = g
      .append('g')
      .attr('stroke', 'rgba(255,255,255,0.6)')
      .attr('stroke-width', 2)
      .selectAll('line')
      .data(graphData.links)
      .join('line');

    // Nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('r', d => Math.max(d.val / 2, 10))
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 0 10px rgba(255,255,255,0.8))')
      .on('mouseenter', function (event, d) {
        d3.select(this).transition().duration(150).attr('r', d.val * 0.9);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'block';
          tooltipRef.current.innerHTML = `<div style="color:white;background:rgba(0,0,0,0.8);padding:6px 12px;border-radius:6px;font-size:13px;">${d.name}</div>`;
        }
      })
      .on('mousemove', function (event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = event.pageX + 12 + 'px';
          tooltipRef.current.style.top = event.pageY + 12 + 'px';
        }
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).transition().duration(150).attr('r', Math.max(d.val / 2, 10));
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      })
      .call(
        d3.drag<SVGCircleElement, Node>()
          .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Labels 
    const labels = g
      .append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .join('text')
      .text(d => d.name)
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.val / 2 + 15)
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('font-family', 'Arial, sans-serif')
      .style('user-select', 'none');

    //Tick 
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x!)
        .attr('y1', (d: any) => d.source.y!)
        .attr('x2', (d: any) => d.target.x!)
        .attr('y2', (d: any) => d.target.y!);

      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      labels.attr('x', d => d.x!).attr('y', d => d.y!);
    });

    return () => simulation.stop();
  }, [graphData]);

  return (
    <div className="w-full h-screen relative">
      <svg ref={svgRef} className="w-full h-full" style={{ background: '#111' }} />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          display: 'none',
          zIndex: 999,
        }}
      />
    </div>
  );
};
