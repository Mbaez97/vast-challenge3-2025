'use strict';

function reset(){
  d3.select("#timeseries").selectAll("*").remove();
  d3.select("#nodelink").selectAll("*").remove();
  d3.select("#timeslider").selectAll("*").remove();
}


function init(filename) {

  var currentTime = 0;
  var currentNode = -1;

  reset();

  var tooltip = d3.select(".container")
    .append("div")
    .attr("id", "tooltip")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("visibility", "hidden")
    .text("a simple tooltip");

  d3.json(filename, loadJson);

  function loadJson(json) {

    var nodes = json.nodes;
    var nodesIdx = [];
    nodes.forEach(function (n) {
      n.group = 1;
      nodesIdx[n.id] = n;
      n.name = n.name.split(' ')[1];
      // console.log(n.name.split(' '));
    });

    var edges = [];
    var timeslots = [];
    json.edges.forEach(function (elist) {
      edges.push([]);
      timeslots.push(elist.ts);

      elist.list.forEach(function (e) {
        var toAdd = true;
        e.ids.forEach(function (n) {
          if(typeof nodesIdx[n] == "undefined")
            toAdd = false;
        });
        if(toAdd){
          e.ids.forEach(function (n1) {
            e.ids.forEach(function (n2) {
              if (n1 < n2) {
                var edge = {};
                edge.source = nodesIdx[n1];
                edge.target = nodesIdx[n2];
                // if((typeof edge.source != "undefined") && (typeof edge.target !="undefined")) {
                  edge.value = Math.random();
                  edge.source.class = 'unselected';
                  edge.target.class = 'unselected';
                  edge.class = 'unselected';

                  edges[edges.length - 1].push(edge);
                // }
              }
            });
          });
        }

      });
    });

    var data = {"nodes": nodes, "edges": edges};

    var min = Infinity;
    var max = -Infinity;
    data.nodes.forEach((n)=> {
      n.data.forEach((dts)=> {
        dts.value.forEach((d)=> {
          min = Math.min(min, d);
          max = Math.max(max, d);
        });
      });
    });

    var nl = nodeLink();
    var tsList = [];
    var sl = slider()
      .xDomain(timeslots);

    data.nodes.forEach((n, i)=> {
      var ts = timeSeries()
        .yDomain([min, max])
        .zDomain([min, max]);
      ts.update(n['data'], n);
      ts.title(n.name);
      tsList.push(ts);
    });
    nl.data(data, currentTime);

    dispatch.on("nodechange", function (d) {
      currentNode = d;
      console.log("node", d);

      data.nodes.forEach((n)=> n.class = n.id == currentNode ? 'selected' : 'unselected');
      data.edges[currentTime]
        .forEach((e)=> {
          e.class = 'unselected';
        });

      data.edges[currentTime]
        .forEach((e)=> {
          if (e.source.id == currentNode) {
            e.source.class = 'selected';
            e.target.class = 'adjacent';
            e.class = 'selected';
          } else if (e.target.id == currentNode) {
            e.target.class = 'selected';
            e.source.class = 'adjacent';
            e.class = 'selected';
          }
        });
      nl.updateSelected();
      tsList.forEach((ts)=> {
        ts.udpateSelected();
      });

    });

    dispatch.on("timechange", function (t) {
      console.log("time", t);
      // data.nodes.forEach((n)=> n.class = 'unselected');
      currentTime = t;

      dispatch.call("nodechange", this, currentNode);
      nl.updateTime(currentTime);
      // ts.updateTime(currentTime);
    });


  }
}