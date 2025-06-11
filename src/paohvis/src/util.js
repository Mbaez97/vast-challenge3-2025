/**
 * Created by pao on 2/14/17.
 */

reorder.debug = false;

var leafOrder = function(adjacency){
    var reorderLeafOrder = reorder.optimal_leaf_order()
        .distance(science.stats.distance.manhattan);
    var order = reorderLeafOrder(adjacency);
    return order;
}

var reverseCuthillMckee = function(adjacency){

    var graph = reorder.mat2graph(adjacency);

    var rcm = reorder.reverse_cuthill_mckee_order(graph);

    return rcm;
}

var barycentricOrder = function(adjacency){
  var graph = reorder.mat2graph(adjacency);
  var barycenter = reorder.barycenter_order(graph);
  var improved = reorder.adjacent_exchange(graph,
      barycenter[0],
      barycenter[1]);

  // improved[0].forEach(function(lo, i) {
  //   graph.nodes[i].barycenter = lo;
  // });

  // return nodes.map(function(n) { return n.barycenter; });
  return improved[0];

}

var spectralOrder = function(adjacency) {
  var graph = reorder.mat2graph(adjacency);
  var spectral = reorder.barycenter_order(graph);
  return spectral[0];
}
