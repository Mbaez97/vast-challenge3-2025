/**
 * Created by pao on 3/22/17.
 */

'use strict';

function nodeLink(){

  var nodeLink = [];
  var data = [];
  var tooltip = d3.select('#tooltip');

  var el_width =  d3.select("#nodelink").node().getBoundingClientRect().width;
  if(el_width==0 || el_width == undefined) el_width = 600;

  var margin = {top: 20, right: 10, bottom: 10, left: 50},
    width = el_width - margin.left - margin.right,
    height = 600 - margin.top - margin.bottom;

  var nodeColor = "#222";
  var selectedColor = "red";
  var adjacencyColor = "steelblue";
  var unselectedEdgeColor = "#999";


  var svg_nl = d3.select("#nodelink").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("margin-left", margin.left + "%")
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3.scaleLinear().range([0, width]),
    y = d3.scaleLinear().range([height, 0]);

  var link = svg_nl.append("g")
    .attr("class", "links")
    .selectAll("line");

  var node = svg_nl.append("g")
    .attr("class", "nodes")
    .selectAll("circle");

  nodeLink.data = function(_, currentTime) {
    data = _;

    x.domain(d3.extent(data.nodes, (n) => n.pos.x));
    y.domain(d3.extent(data.nodes, (n) => n.pos.y));

    node = d3.select(".nodes")
      .selectAll("circle")
      .data(data.nodes, (e) => e.id);

    node
      .enter().append("circle")
      .attr("cx", (d) => x(d.pos.x))
      .attr("cy", (d) => y(d.pos.y))
      .attr("r", 5)
      .attr("fill", nodeColor)
      .on("mouseover", function (d) {
        dispatch.call("nodechange", this, d.id);
        if(tooltip) {
          tooltip.text(d.name);
          tooltip.style("visibility", "visible");
        }
      })
      .on("mousemove", function () {
        if(tooltip)
          tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
      })
      .on("mouseout", function () {
        // dispatch.call("nodechange", this, -1);
        if(tooltip)
          tooltip.style("visibility", "hidden");
      })
      .on("click", function (d) {
        dispatch.call("nodechange", this, d.id);
      });

    return nodeLink.updateTime(currentTime);


  }

  nodeLink.updateTime = function(t) {

    link = d3.select(".links")
      .selectAll("line")
      .data(data.edges[t], function (e) {
        return e.source.id + "_" + e.target.id;
      });

    link
      .enter().append("line")
      .attr("stroke-width", 1.2 )
      .attr("x1", function(d) { return x(d.source.pos.x); })
      .attr("y1", function(d) { return y(d.source.pos.y); })
      .attr("x2", function(d) { return x(d.target.pos.x); })
      .attr("y2", function(d) { return y(d.target.pos.y); });

    link.exit().remove();

    return nodeLink.updateSelected();
  }
  nodeLink.updateSelected = function(){

    link = d3.select(".links")
      .selectAll("line")
      .attr( "class", (e)=>e.class);

    node = d3.select(".nodes")
      .selectAll("circle")
      .attr("fill", (d) => {
        if(d.class == 'selected')
          return selectedColor;
        else if(d.class == 'adjacent')
          return adjacencyColor;
        return nodeColor;
      });
    return nodeLink;

  }
  nodeLink.tooltip = function (_) {
    return arguments.length ? (tooltip = _ , nodeLink) : tooltip;
  };

  return nodeLink;

}
