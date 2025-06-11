'use strict';

function timeSeries(){

  var timeSeries = [];
  var node = null;

  var selectedColor = "red";
  var unselectedColor = "black";
  var adjacencyColor = "steelblue";

  var minColor = '#eeeeee';
  var maxColor = '#000000';

  var el_width = 1400;

  var margin = {top: 1, right: 5, bottom: 0, left: 80},
    width = el_width - margin.left - margin.right,
    height = 16 - margin.top - margin.bottom;

  var svg = d3.select("#timeseries").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("margin-left", margin.left + "px")
    .append("g")
    .attr("class", "parent")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var normalize = false;

  var tsx = d3.scaleBand().range([0, width]).paddingInner(0.05),
    x = d3.scaleBand().range([0, width]).paddingInner(0.0),
    y = d3.scaleLinear().range([height-3, 1]),
    z = d3.scaleLinear().range([minColor, maxColor]);
  var yDomain = [0, 1];
  var zDomain = [0, 1];

  var line = d3.line()
    .x((d,i) => x(i)+x.bandwidth()/2)
    .y((d) => y(d));

  var value = (d) => d.value;

  timeSeries.update = function (data, nid){
    node = nid;

    if(normalize) {
      var dataFlatten = data.reduce((ac, cr)=> ac.concat(value(cr)), []);
      yDomain = d3.extent(dataFlatten);
      zDomain = d3.extent(dataFlatten);
    }

    y.domain(yDomain);
    z.domain(yDomain);

    // Compute the scale domains.
    tsx.domain(d3.range(data.length));
    x.domain(d3.range(value(data[0]).length));
    x.range([0, tsx.bandwidth()]);

    var g = svg.selectAll("g")
      .data(data, (d,i) => i);

    var gEnter = g.enter().append("g")
      .attr("transform", (d,i) => "translate(" + (tsx(i)) + ", 0)");

    gEnter.selectAll("rect")
      .data((d) => value(d), (_,i) => i)
      .enter()
      .append("rect")
      .attr("class", "tile")
      .attr("x", (d, i) => x(i))
      .attr("y", 0)
      .attr("width", x.bandwidth())
      .attr("height", height)
      .style("fill", (d) => z(d));

    // gEnter
    //   .append("text")
    //   .attr("x",2)
    //   .attr("y",-2)
    //   .text(d => d.ts)
    //   .attr("fill", (d,i) => i==currentTime?"red":"black");

    gEnter
      .append("path")
      .attr("class", "line")
      .attr("d", (d) => line(value(d)));

    g.selectAll("rect").data((d) => value(d), (_,i) => i).style("fill", (d) => z(d));

    g.select("path").attr("d", (d) => line(value(d)));

    g.exit().remove();

    return timeSeries;

  }

  timeSeries.translate = function(x, y){
    svg.select(".parent").attr("transform", "translate(" + (margin.left+x) + "," + (margin.top+y) + ")");
    return timeSeries;
  }

  timeSeries.title = function(title){
    svg
      .append("text")
      .attr("transform", "translate(" + -margin.left+ "," + (height-3) + ")")
      // .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-family", "Helvetica")
      .text(title)
      .on("mouseover",(d) => dispatch.call("nodechange", this, node.id));
      // .on("mouseout",(d) => dispatch.call("nodechange", this, -1))
    ;
    return timeSeries;
  }

  timeSeries.updateTime = function(t) {
    //   svg_ts.selectAll("g")
    //     .select("text")
    //     .attr("fill", (d,i) => i==t?"red":"black")
    //   ;
  }

  timeSeries.udpateSelected = function() {
    svg//.select(".parent")
      .select("text")
      .attr("fill", function(a){
        if(node.class == "selected")
          return selectedColor;
        if(node.class == "adjacent")
          return adjacencyColor;
        return unselectedColor;

      });
  }

  timeSeries.unselect = function() {
    svg//.select(".parent")
      .select("text")
      .attr("fill", unselectedColor);
    ;
  }

  timeSeries.yDomain = function (_) {
    return arguments.length ? (yDomain = _ , timeSeries) : yDomain;
  };

  timeSeries.zDomain = function (_) {
    return arguments.length ? (zDomain = _ , timeSeries) : zDomain;
  };

  timeSeries.height = function (_) {
    return arguments.length ? (height = _ - margin.top - margin.bottom, timeSeries) :  height + margin.top + margin.bottom;
  };


  return timeSeries;
  
}