/* 
 * Copyright 2012 Twitter, Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



 //There's something overriding $ in this file, so uses of jQuery need to specify "jQuery"


 var publicTM;

(function() {

var queryLimit = 50000,
	maxFolders = 70e6,
	maxSize = 70e8,
	sizeThreshold = 150 * (1 << 20), //150 M Bytes
	depth = 2;

var $ = function(d) { return document.getElementById(d); },
	$$ = function(d) { return document.querySelectorAll(d); };

function FileTreeMap(chart_id) {
	var that = this, 
		size = $('size'),
		count = $('count'),
//		tm = new $jit.TM.Voronoi({
		tm = new $jit.TM.Squarified({
	    injectInto: chart_id,
	    titleHeight: 15,
//	    titleHeight: 0,
	    levelsToShow: depth,
//	    labelsToShow: [0, 1],
	    animate: true,
	    offset: 1,
	    duration: 1000,
	    hideLabels: true,
	    Label: {
	    	type: 'HTML',
//	    	type: 'Native',//'HTML',
//	    	size: 1,
//	    	color: 'white'
	    },
	    Events: {
	      enable: true,
	      onClick: function(node) {
	        if(node) {
	        	Observer.fireEvent('click', node);
	        }
	      },
	      onRightClick: function() {
	    	if (tm.clickedNode && tm.clickedNode.getParents().length) {
	    		Observer.fireEvent('back', tm.clickedNode);
	    	}
	      }
	    },
	    onCreateLabel: function(domElement, node){
	        domElement.innerHTML = node.name;

	      domElement.onmouseover = function(event) {
	    		Observer.fireEvent('mouseover', node);
        };
	      domElement.onmouseout = function(event) {
	    		Observer.fireEvent('mouseout', node);
        };
	    },
	    Tips: {
	      enable: true,
	      offsetX: 20,
	      offsetY: 20,
	      onShow: function(tip, node, isLeaf, domElement) {
	          var html = "<div class=\"tip-title\">" + node.name
			+ "</div><div class=\"tip-text\"><ul><li>";
				var data = node.data;
				html += "<b>folder size:</b> " + Math.round(data.fileSize / (1 << 20)) + " MB</li><li>";
				html += "<b>n. of descendants:</b> " + data.nChildren + "</li><li>";
				html += "<b>avg. file size:</b> " + Math.round((data.fileSize / data.nChildren) / (1 << 20)) + " MB</li></ul></div>";
				tip.innerHTML = html;
	      }  
	    },
	    
	    request: function(nodeId, level, callback){
	    	//This code is called any time we try and get into any node, and multiple times when we get into a node with
	    	//many children
	    	if (level <= depth -1) {
	    		treemap.checkSearchLock();
	    		callback.onComplete(nodeId, { children: [] });
	    		return;
	    	}
	    	new XHR({
	    		url: '/tree_size_by_path',
	    		params: {
	    			path: nodeId,
	    			limit: queryLimit / level,
	    			depth: level
	    		},
	    		onSuccess: function(text) {
	    			var json = JSON.parse(text);
	    			json = treemap.processJSON(json);
	    			json.id = nodeId;
	    			treemap.checkSearchLock();
	    			callback.onComplete(nodeId, json);
	    		}
	    	}).send();
	    }	    
	  });
	
	  this.tm = tm;
	  this.bc = $('breadcrumb');
	  this.currentNodeID = '/';

	  var loading_chart = jQuery('#'+chart_id).children().first().clone().prop({id: "treemap-loading"}).css({'display':'none'});
	  jQuery('#'+chart_id).append(loading_chart);
	  loading_chart.append("<img src='loading.gif' style='width:100%; height:100%'>");


	  $('back').addEventListener('click', function() {
		  if (tm.clickedNode) Observer.fireEvent('back', tm.clickedNode)
	  });
	  size.addEventListener('click', function(e) {
	  	  if (that.searchLock) return;
		  size.classList.add('selected');
		  count.classList.remove('selected');
		  that.setSize();
	  });
	  count.addEventListener('click', function(e) {
	  	  if (that.searchLock) return;
		  count.classList.add('selected');
		  size.classList.remove('selected');
		  that.setCount();
	  });
}

FileTreeMap.prototype = {
	size: true,
	
	scale: new chroma.ColorScale({
//	    colors: ['#6A000B', '#F7E1C5']
//		colors: ['#A50026', '#D73027', '#F46D43', '#FDAE61', '#FEE090', '#FFFFBF', '#E0F3F8', '#ABD9E9', '#74ADD1', '#4575B4', '#313695']
//		colors: ['#67001F', '#B2182B', '#D6604D', '#F4A582', '#FDDBC7', '#F7F7F7', '#D1E5F0', '#92C5DE', '#4393C3', '#2166AC', '#053061']
//		colors: ['#CA0020', '#F4A582', '#F7F7F7', '#92C5DE', '#0571B0'],
		colors: ['#FFF7FB', '#ECE7F2', '#D0D1E6', '#A6BDDB', '#74A9CF', '#3690C0', '#0570B0', '#045A8D', '#023858']
//		limits: chroma.limits([0, 0.2, 0.4, 0.6, 0.8, 1], 'equal', 5)
	}),
	
	color: function(data) {
		var ratio = (data.fileSize / data.nChildren) / sizeThreshold;
		if (ratio > 1) {
			return this.scale.getColor(1).hex();
		} else {
			return this.scale.getColor(ratio).hex();
		}
	},
	
	load: function(json) {
		this.tm.loadJSON(json);
		this.tm.refresh();
	},

	getCurrentNode: function() {
		return this.tm.graph.getNode(this.currentNodeID);
	},
	
	processJSON: function(json) {
		if (!json.id) {
			return json;
		}
		
		var fileSize = json.data.fileSize,
			min = Math.min,
			len = fileSize.length,
			smallNums = len > 9,
			decimals = 6,
			that = this,
			count = 0, div;
			
		div = 350 / (this.size ? maxFolders : maxSize);

		$jit.json.each(json, function(n) {
			var fileSizeText = n.data.fileSize,
				nChildren = n.data.nChildren,
				len = fileSizeText.length,
				size;
			//cut the file size
			if (smallNums) {
				fileSizeText = fileSizeText.slice(0, len - decimals) + '.' + fileSizeText.slice(len-decimals);
			}
			size = parseFloat(fileSizeText);
			n.data.$area = that.size ? (size || 1) : +nChildren;
			n.data.$color = that.color(n.data);
		});
		return json;
	},
	
	setVoronoi: function() {
		var tm = this.tm,
			util = $jit.util;
		util.extend(tm, new $jit.Layouts.TM.Voronoi());
		tm.config.Node.type = 'polygon';
		tm.config.Label.textBaseline = 'middle';
		tm.config.labelsToShow = [1, 1],
		tm.config.animate = false;
		tm.refresh();
		tm.config.animate = true;
	},
	
	setSquarified: function() {
		var tm = this.tm,
			util = $jit.util,
			$C = $jit.Complex,
			dist2 = $jit.geometry.dist2;
		
		util.extend(tm, new $jit.Layouts.TM.Squarified());
		tm.config.Node.type = 'rectangle';
		tm.config.Label.textBaseline = 'top';
		tm.config.labelsToShow = false,
		tm.config.animate = false;
		tm.refresh();
		tm.config.animate = true;
	},
	
	setSize: function() {
		if (this.size || this.busy) return;
		this.size = this.busy = true;
		
		var that = this,
			util = $jit.util,
			min = Math.min,
			tm = this.tm,
			g = tm.graph;
		
		g.eachNode(function(n) {
			n.setData('area', +that.parseFileSize(n.data.fileSize, 6), 'end');
		})
		
		tm.compute('end');
		tm.fx.animate({
			modes: {
				'position': 'linear',
				'node-property': ['width', 'height']
			},
			duration: 1000,
			fps: 60,
			onComplete: function() {
				g.eachNode(function(n) {
					n.setData('area', n.getData('area', 'end'));
				});
				that.busy = false;
			}
		});
	},
	
	setCount: function() {
		if (!this.size || this.busy) return;
		this.size = false;
		this.busy = true;
		
		var that = this,
			util = $jit.util,
			min = Math.min,
			tm = this.tm,
			g = tm.graph;
		
		g.eachNode(function(n) {
			n.setData('area', +n.data.nChildren, 'end');
		})
		
		tm.compute('end');
		tm.fx.animate({
			modes: {
				'position': 'linear',
				'node-property': ['width', 'height']
			},
			fps: 60,
			duration: 1000,
			onComplete: function() {
				g.eachNode(function(n) {
					n.setData('area', n.getData('area', 'end'));
				});
				that.busy = false;
			}
		});
	},
	
	updateHTML: function(node) {
		if (!node) return;

		var names = [node.name],
			parents = node.getParents();
		
		while (parents.length) {
			names.unshift(parents[0].name);
			parents = parents[0].getParents();
		}
		this.bc.innerHTML = names.join(' &rsaquo; ');

		this.updateGraph();
	},

	updateGraph: function(){
		list = document.querySelectorAll(".temp");
		for(var i = 0; i < list.length; ++i){
			list[i].parentNode.removeChild(list[i])
		}
		var table = document.getElementById('data');
		var counter = 1;
		var currentNodeID = this.currentNodeID;
		this.tm.graph.eachNode(function(n){

			if (n.id.substr(0, currentNodeID.length) == currentNodeID){
				var r = table.insertRow(counter);
				counter = counter+1;
				r.className = "temp";
				r.id = "table-"+n.id;
				r.insertCell(0).innerHTML = '<a href="/" onclick="Observer.fireEvent(\'message\',\''+n.id+'\'); return false;">'+n.id+'</a>';
				r.insertCell(1).innerHTML = n.data.fileSize;
				r.insertCell(2).innerHTML = n.data.nChildren;
			}

		});
	},
	
	parseFileSize: function(size, decimals) {
		var len = size.length;
		return size.slice(0, len - decimals) + '.' + size.slice(len-decimals);
	},

	setSearchLock: function() {
		this.pendingSearchLock = true;
		this.searchLock = true;
		jQuery("#treemap-canvaswidget").hide()
		jQuery("#treemap-loading").show();
	},

	clearSearchLock: function() {
		this.searchLock = false;
		jQuery("#treemap-loading").hide()
		jQuery("#treemap-canvaswidget").show();
		this.tm.refresh();
	},

	checkSearchLock: function() {
		if (!this.pendingSearchLock) return;
		this.pendingSearchLock = false;
		var that = this;
		//Doesn't seem like a value below 1700 reliably works
		setTimeout(function(){that.clearSearchLock();}, 1500);
	},

	setBusy: function(duration){
		this.busy = true;
		var that = this;
		setTimeout(function(){that.busy = false;}, duration);
	},
	
	seek: function(nodeElem) {
		var tm = this.tm,
			node = tm.graph.getNode(nodeElem.id),
			currentNode = this.getCurrentNode();


		if (node.isDescendantOf(currentNode.id)){
			this.descendHandler(node);
		} else if (currentNode.isDescendantOf(node.id)){
			this.backHandler();
		} else if (node.id != currentNode.id){
			this.searchHandler(node);
		}
		
	},
	
	searchHandler: function(node) {
		if (this.busy) return;
		var tm = this.tm;
		this.setBusy(2700); //searchLock time + 1200
		this.setSearchLock();

		this.currentNodeID = node.id;
		tm.enter(node);
		this.updateHTML(node);
	},


	descendHandler: function(node) {
		if (this.busy) return;
		var tm = this.tm;
		this.setBusy(1200);

		this.currentNodeID = node.id;
    	tm.enter(node);
    	this.updateHTML(node);
	},

	backHandler: function() {
		if (this.busy) return;
		var tm = this.tm;
		this.setBusy(1200);

		if (this.currentNodeID == '/') return;
		
		var parent = this.getCurrentNode().getParents()[0];
		if (parent) {
	        tm.out();
	        this.currentNodeID = parent.id;
	    	this.updateHTML(parent);
		}
	}
};

var treemap;


Observer.addEvent('load', function() {
	treemap = new FileTreeMap('treemap');
	publicTM = treemap;
});

Observer.addEvent('initdataloaded', function (text) {
	var json = JSON.parse(text);
	json = treemap.processJSON(json);
	treemap.load(json);
	treemap.updateGraph();
});

Observer.addEvent('click', function (node) {
	if (treemap.searchLock) return;
	treemap.seek(node);
});

Observer.addEvent('back', function (node) {
	if (treemap.searchLock) return;
	treemap.backHandler();
});

Observer.addEvent('search', function (node) {
	if (treemap.searchLock) return;
	treemap.seek(treemap.tm.graph.getNode(node));
});

// Observer.addEvent('treemapupdate', function (node) {
// 	// TODO: This needs to be on a timeout to work.
// 	// It's not the greatest solution but it wasn't immediately
// 	// apparent what was happening asynchronously, so we'll have to
// 	// come back to this. It looks like 1000 is the smallest value
// 	// we can get away with here.	
// 	setTimeout(function(){treemap.seek(node);}, 1000);
// });

})();
