
"use strict";

var extObject = {

  initialize: function() {
    this.topZindex = 0;
  },

  showPanel: function() {
    var jqview = $("<div></div>").appendTo("body");
    this.panel = Panel.new({
      jqview: jqview,
      id: "panel"
    });
    this.panel.show();
  },

  hidePanel: function() {
    this.panel.close();
  },

  createNodeView: function(para) {
    if (para == null)
      para = {};
    var jqview = $("<div></div>")
      .appendTo("#dataflow");
    jqview.css(para);
    return jqview;
  },
  createEdgeView: function(para) {
    if(para == null)
      para = {};
    var jqview = $("<div></div>")
      .appendTo("#dataflow-edges");
    jqview.css(para);
    return jqview;
  },

  createDialog: function() {
    if (this.jqdialog != null) {
      console.log("a dialog is already opened. complete the action first.");
      return null;
    }
    var jqview = $("<div></div>")
      .dialog(); // TODO do we really need to make dialog here? though just redundant..
    return jqview;
  },

  removeDialog: function() {
    this.jqdialog = null;
  },

  bringFrontView: function(jqview) {
    jqview
      .css("z-index", ++this.topZindex);
  },

  getTopZindex: function() {
    return this.topZindex;
  }
};

var ViewManager = Base.extend(extObject);