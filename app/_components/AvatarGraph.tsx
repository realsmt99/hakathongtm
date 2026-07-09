"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { ICPOutput } from "@/app/_lib/api";

type GNode = ICPOutput["graph_network"]["nodes"][number] &
  d3.SimulationNodeDatum;
type GLink = {
  source: string | GNode;
  target: string | GNode;
  relationship: string;
};

const TYPE_STYLE: Record<string, { fill: string; ring: string; text: string }> = {
  avatar: { fill: "#2f3437", ring: "#2f3437", text: "#ffffff" },
  industry: { fill: "#e1f3fe", ring: "#1f6c9f", text: "#1f6c9f" },
  role: { fill: "#edf3ec", ring: "#346538", text: "#346538" },
  signal: { fill: "#fbf3db", ring: "#956400", text: "#956400" },
};

export function AvatarGraph({ graph }: { graph: ICPOutput["graph_network"] }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || graph.nodes.length === 0) return;

    const width = ref.current.clientWidth || 720;
    const height = ref.current.clientHeight || 460;

    const nodes: GNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: GLink[] = graph.links.map((l) => ({ ...l }));

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((l) => ((l.source as GNode).type === "avatar" ? 120 : 70))
          .strength(0.35)
      )
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<GNode>().radius((d) => radius(d) + 14)
      );

    function radius(d: GNode) {
      return d.type === "avatar" ? 26 + d.weight : 10 + d.weight * 1.6;
    }

    const link = g
      .append("g")
      .attr("stroke", "#d9d7d1")
      .attr("stroke-opacity", 0.9)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1);

    const node = g
      .append("g")
      .selectAll<SVGGElement, GNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, GNode>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append("circle")
      .attr("r", (d) => radius(d))
      .attr("fill", (d) => TYPE_STYLE[d.type]?.fill ?? "#eee")
      .attr("stroke", (d) => TYPE_STYLE[d.type]?.ring ?? "#ccc")
      .attr("stroke-width", (d) => (d.type === "avatar" ? 0 : 1));

    node
      .append("text")
      .text((d) => (d.type === "avatar" ? d.label : trunc(d.label, 16)))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.type === "avatar" ? 4 : radius(d) + 12))
      .attr("font-size", (d) => (d.type === "avatar" ? 10 : 10))
      .attr("font-weight", (d) => (d.type === "avatar" ? 600 : 400))
      .attr("fill", (d) => (d.type === "avatar" ? TYPE_STYLE.avatar.text : "#787774"))
      .style("pointer-events", "none")
      .each(function (d) {
        if (d.type === "avatar") wrap(d3.select(this), 46);
      });

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GNode).x!)
        .attr("y1", (d) => (d.source as GNode).y!)
        .attr("x2", (d) => (d.target as GNode).x!)
        .attr("y2", (d) => (d.target as GNode).y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
    };
  }, [graph]);

  return <svg ref={ref} className="h-full w-full" />;
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Rudimentary word-wrap for avatar labels inside the node.
function wrap(text: d3.Selection<SVGTextElement, unknown, null, undefined>, width: number) {
  const words = (text.text() || "").split(/[\s—]+/).reverse();
  const lineHeight = 11;
  let line: string[] = [];
  let word: string | undefined;
  let lineNumber = 0;
  text.text(null);
  let tspan = text.append("tspan").attr("x", 0).attr("dy", 0);
  while ((word = words.pop())) {
    line.push(word);
    tspan.text(line.join(" "));
    if ((tspan.node()?.getComputedTextLength() ?? 0) > width && line.length > 1) {
      line.pop();
      tspan.text(line.join(" "));
      line = [word];
      tspan = text
        .append("tspan")
        .attr("x", 0)
        .attr("dy", lineHeight)
        .text(word);
      lineNumber++;
    }
  }
  text.attr("transform", `translate(0, ${-(lineNumber * lineHeight) / 2})`);
}
