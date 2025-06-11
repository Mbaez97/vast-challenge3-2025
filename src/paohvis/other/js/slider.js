/**
 * Created by pao on 3/27/17.
 */
'use strict';

function slider() {

  var slider = [];

  var el_width = 1400;
  var margin = {top: 2, right: 5, bottom: 3, left: 80},
    width = el_width - margin.left - margin.right,
    height = 30 - margin.top - margin.bottom;

  var svg = d3.select("#timeslider").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("margin-left", margin.left + "px")
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3.scaleBand().range([0, width]).paddingInner(0.05);
  var xDomain = [0, 100];
  x.domain(xDomain);

  var g = svg.append("g")
    .attr("class", "slider")
    .attr("transform", "translate(" + 0 + "," + 5 + ")");


  g.append("line")
    .attr("class", "track")
    .attr("x1", x.range()[0])
    .attr("x2", x.range()[1])
    .select(function () {
      return this.parentNode.appendChild(this.cloneNode(true));
    })
    .attr("class", "track-inset")
    .select(function () {
      return this.parentNode.appendChild(this.cloneNode(true));
    })
    .attr("class", "track-overlay")
    .call(d3.drag()
      .on("start.interrupt", function () {
        g.interrupt();
      })
      .on("start drag", function () {
        var eachBand = x.step();
        var index = Math.floor((d3.event.x / eachBand));
        var val = x.domain()[index];
        changeTime(val);
      }));

  g.insert("g", ".track-overlay")
    .attr("class", "ticks")
    .attr("transform", "translate(0," + 18 + ")")
    .selectAll("text")
    .data(x.domain())
    .enter().append("text")
    .attr("x", x)
    // .attr("text-anchor", "middle")
    .text(function (d) {
      return d;
    });

  var handle = g.insert("rect", ".track-overlay")
    .attr("class", "handle")
    .attr("height", 9)
    .attr("y", -4);

  function changeTime(t){
    var xI = xDomain.indexOf(t);
    handle.attr("x", x(t));
    dispatch.call("timechange", this, xI);
  }

  slider.xDomain = function (domain) {
    if(arguments.length){
      // _domain = domain;
      xDomain = domain;
      x.domain(xDomain);

    handle.attr("width", x.bandwidth())

      var sel = g
        .selectAll("text")
        .data(x.domain());
      sel
        .enter().append("text")
        .attr("transform", "translate(0," + 18 + ")")
        .attr("x", x)
        // .attr("text-anchor", "middle")
        .text(function (d) {
          return d;
        });
      sel
        .attr("x", x)
        .text(function (d) {
          return d;
        });
      sel.exit().remove();

      return slider;
    }
    return xDomain;
  };

  return slider;
}