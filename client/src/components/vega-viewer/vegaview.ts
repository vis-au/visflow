import _ from 'lodash';
import { SpecParser, SpecCompiler, PlotView, InlineDatasetNode, View } from 'revize';
import { SignalValue } from 'vega';
import embed, { VisualizationSpec } from 'vega-embed';
import { Component } from 'vue-property-decorator';

import ColumnSelect from '@/components/column-select/column-select';
import FormInput from '@/components/form-input/form-input';
import { Visualization, injectVisualizationTemplate } from '@/components/visualization';

import { ValueType } from '@/data/parser';
import { SubsetItem } from '@/data/package/subset-package';
import TabularDataset, { TabularColumn } from '@/data/tabular-dataset';
import { isNumericalType } from '@/data/util';
import { VisualProperties } from '@/data/visuals';

import * as history from './history';
import template from './vegaview.html';

interface VegaViewSave {
  useSVG: boolean;
}

const VEGA_BRUSH_SELECTION_SNIPPET = {
  selection: {
    brush: {
      type: 'interval',
    },
  },
};

const VEGA_EXAMPLE_SPEC: VisualizationSpec | string = {
  $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
  description: 'Drag out a rectangular brush to highlight points.',
  data: {values: []},
  selection: {
    brush: {
      type: 'interval',
    },
  },
  mark: 'point',
  encoding: {
    x: {field: 'Horsepower', type: 'quantitative'},
    y: {field: 'Miles_per_Gallon', type: 'quantitative'},
    color: {
      condition: {selection: 'brush', field: 'Cylinders', type: 'ordinal'},
      value: 'grey',
    },
  },
};

interface VegaViewItemProps {
  index: number;
  x: number | string;
  y: number | string;
  visuals: VisualProperties;
  hasVisuals: boolean;
  selected: boolean;
}

@Component({
  template: injectVisualizationTemplate(template),
  components: {
    ColumnSelect,
    FormInput,
  },
})
export default class VegaView extends Visualization {
  protected NODE_TYPE = 'vegaimportview';
  protected HAS_SETTINGS = true;

  private vegaSpec = VEGA_EXAMPLE_SPEC;
  private rootView: View | null = null;

  private xColumn: number | null = null;
  private yColumn: number | null = null;
  private colorColumn: number | null = null;

  private specParser: SpecParser = new SpecParser();
  private specCompiler: SpecCompiler = new SpecCompiler();

  private vegaSpecString: string = !!this.vegaSpec ? JSON.stringify(this.vegaSpec, null, 2) : '{}';
  private viewsInVegaSpec: string[] = [];
  private selectedViewIndex: number = 0;

  private itemProps: VegaViewItemProps[] = [];

  public setXColumn(column: number, drawAfter: boolean = true) {
    this.xColumn = column;
    if (drawAfter) {
      this.draw();
    }
  }

  public setYColumn(column: number, drawAfter: boolean = true) {
    this.yColumn = column;
    if (drawAfter) {
      this.draw();
    }
  }

  public setColorColumn(column: number, drawAfter: boolean = true) {
    this.colorColumn = column;
    if (drawAfter) {
      this.draw();
    }
  }

  public applyColumns(columns: number[]) {
    if (columns.length === 0) {
      this.findDefaultColumns();
    } else if (columns.length === 1) {
      this.setXColumn(columns[0]);
      this.setYColumn(columns[0]);
    } else {
      this.setXColumn(columns[0]);
      this.setYColumn(columns[1]);
    }

    this.draw();
  }

  protected created() {
    this.serializationChain.push((): VegaViewSave => ({
      useSVG: false,
    }));
    this.deserializationChain.push(nodeSave => {
      const save = nodeSave as VegaViewSave;
      // restore save file? check scatterplot.ts
    });

    setTimeout(this.draw.bind(this), 1000);
  }

  protected draw() {
    if (!this.vegaSpec) {
      this.coverText = 'Please enter a Vega-lite spec in the side panel';
      return;
    }
    if (!this.hasDataset()) {
      this.coverText = 'No dataset';
      return;
    }

    // keep this line as otherwise the view will not show
    this.coverText = '';

    this.updateRootView();
    this.updateViewList();
    this.renderRootView();
    this.renderSelectedView();
  }

  protected findDefaultColumns() {
    if (!this.hasDataset()) {
      return;
    }
    const dataset = this.getDataset();
    const numericalColumns = dataset.getColumns()
      .filter(column => isNumericalType(column.type))
      .slice(0, 2)
      .map(column => column.index);

    const ordinalColumns = dataset.getColumns()
      .filter(column => !isNumericalType(column.type))
      .slice(0, 2)
      .map(column => column.index);

    if (!!this.xColumn) {
      this.setXColumn(this.updateColumnOnDatasetChange(this.xColumn) as number, false);
    } else {
      this.setXColumn(numericalColumns.shift() as number, false);
    }
    if (!!this.yColumn) {
      this.setYColumn(this.yColumn = this.updateColumnOnDatasetChange(this.yColumn) as number, false);
    } else {
      this.setYColumn(this.yColumn = numericalColumns.shift() as number, false);
    }
    if (!!this.colorColumn) {
      this.setColorColumn(this.colorColumn = this.updateColumnOnDatasetChange(this.colorColumn) as number, false);
    } else {
      this.setColorColumn(this.colorColumn = ordinalColumns.shift() as number, false);
    }

    this.draw();
  }

  private updateViewList() {
    if (!this.rootView) {
      this.viewsInVegaSpec = [];
      return;
    }

    this.viewsInVegaSpec = this.rootView.getFlatHierarchy().map(d => `${d.id}`);
  }

  /**
   * Generates the rootview attribute and sets the values of the data property to the input
   * dataflow.
   */
  private updateRootView() {
    this.rootView = this.specParser.parse(this.vegaSpec);
    const data = new InlineDatasetNode();
    data.values = this.getTransposedDataset();
    this.rootView.dataTransformationNode = data;
    this.applyColumnsToView(this.rootView);
  }

  /**
   * Renders a view into an element of the dom. Returns a promise from vega-embed.
   * @param view view to be rendered
   * @param canvas canvas element
   */
  private renderView(view: View, canvas: HTMLElement | string) {
    if (!view) {
      return null;
    }

    const interactiveSpec = this.specCompiler.getVegaSpecification(view);
    if (view === this.rootView) {
      this.vegaSpecString = JSON.stringify(interactiveSpec, null, 2);
    }

    this.vegaSpec = interactiveSpec;
    delete (this.vegaSpec as any).data.format;

    return embed(canvas, interactiveSpec);
  }

  /**
   * Renders the rootview representing the imported vega lite specification in the canvas element
   * of the vl dataflow node.
   */
  private renderRootView() {
    if (!this.rootView) {
      return;
    }

    const embedPromise = this.renderView(this.rootView, this.$refs.vegaCanvas as HTMLElement);

    if (!embedPromise) {
      return;
    }

    embedPromise.then(result => {
      const view = result.view;

      view.addSignalListener('brush', this.onViewBrushed);
      view.addEventListener('mouseup', (event, item) => {
        view.signal('brush_modify', 0);
      });
    });
  }

  /**
   * Renders the view from the view hierarchy with the selectedViewIndex into the canvas element
   * of the sidebar (if visible).
   */
  private renderSelectedView() {
    if (this.selectedViewIndex < 0) {
      return;
    } else if (!this.rootView) {
      return;
    } else if (!this.$refs.selectedViewVegaCanvas) {
      return;
    }

    const views = this.rootView.getFlatHierarchy();
    const selectedView = views[this.selectedViewIndex];
    this.renderView(selectedView, this.$refs.selectedViewVegaCanvas as HTMLElement);
  }

  /**
   * Adds the dimension-mappings defined in the sidebar as encodings to the selected view.
   */
  private applyColumnsToView(view: View) {
    if (!this.rootView) {
      return;
    }

    const dataset = this.getDataset();

    if (!dataset) {
      return;
    }

    const xColumn = dataset.getColumn(this.xColumn);
    const yColumn = dataset.getColumn(this.yColumn);
    const colorColumn = dataset.getColumn(this.colorColumn);
    const xVegaType = this.getVegaNameForColumnType(xColumn.type);
    const yVegaType = this.getVegaNameForColumnType(yColumn.type);
    const colorVegaType = this.getVegaNameForColumnType(colorColumn.type);

    if (view instanceof PlotView) {
      view.setEncodedValue('x', { field: xColumn.name, type: xVegaType });
      view.setEncodedValue('y', { field: yColumn.name, type: yVegaType });
      view.setEncodedValue('color', { field: colorColumn.name, type: colorVegaType });
    }
  }

  /**
   * Returns the vega-lite encoding type for a given visflow dataflow type.
   * @param columnType VisFlow type of the column
   */
  private getVegaNameForColumnType(columnType: ValueType) {
    if (columnType === ValueType.DATE) {
      return 'temporal';
    } else if (columnType === ValueType.EMPTY) {
      return 'nominal';
    } else if (columnType === ValueType.INT) {
      return 'quantitative';
    } else if (columnType === ValueType.FLOAT) {
      return 'quantitative';
    } else if (columnType === ValueType.STRING) {
      return 'nominal';
    } else if (columnType === ValueType.ERROR) {
      return 'nominal';
    }

    return 'nominal';
  }

  /**
   * Event listener for the Vega-lite "brush" signal. Adapts the brushed region from the canvas
   * to the input data flow of the vega-view node.
   * @param name name of the signal, which will always be always brush here
   * @param brush the data returned by the vl brush event
   */
  private onViewBrushed(name: string = 'brush', brush: SignalValue) {
    this.computeSelection();

    const pkg = this.inputPortMap.in.getSubsetPackage();
    const items = pkg.getItems();
    const dataset = pkg.getDataset();

    if (!dataset) {
      return;
    }

    this.selection.clear();
    this.getItemsInBrush(dataset, items, brush)
      .forEach(i => this.selection.addItem(i.index));

    this.propagateSelection();
  }

  /**
   * Returns a list of SubsetItems which lie in the brush region of the vl brush event. Called by
   * onviewbrushed.
   * @param dataset reference to the dataset of the vl-view
   * @param items reference to the active items from the dataflow
   * @param brush brushed region returned by vl brush signal
   */
  private getItemsInBrush(dataset: TabularDataset, items: SubsetItem[], brush: SignalValue) {
    // since the input data is indexed and stored as columns and rows, we need to find out the
    // indeces corresponding with the dimensions in the brush
    const columnMap = dataset.getColumns();
    const brushedDimensionNames = Object.keys(brush);
    // filter out dimensions not in the brush object
    const brushedDimensions = columnMap
      .filter(column => brushedDimensionNames.indexOf(column.name) > -1);

    const itemsInBrush = items.filter(item => {
      const itemRowValues = dataset.getRow(item.index);
      const isItemInBrush = this.isItemInBrush(itemRowValues, brushedDimensions, brush);

      return isItemInBrush;
    });

    return itemsInBrush;
  }

  /**
   * Given an item from the input dataflow, returns whether or not it sits inside the currently
   * brushed region of the vl node.
   * @param item a row from the dataset
   * @param dimensions list of columns for the brushed dimensions
   * @param brush the brushed region from the vl brush signal
   */
  private isItemInBrush(item: Array<string | number>, dimensions: TabularColumn[], brush: SignalValue) {
    let isItemInBrush = true;

    dimensions.forEach(dimension => {
      if (!isItemInBrush) {
        return;
      }

      const brushMin = brush[dimension.name][0];
      const brushMax = brush[dimension.name][1];

      // TODO: can only brush in numerical data
      isItemInBrush = isItemInBrush && item[dimension.index] >= brushMin;
      isItemInBrush = isItemInBrush && item[dimension.index] <= brushMax;
    });

    return isItemInBrush;
  }

  /**
   * Returns a list of items identical representing a row in the input data for every active item
   * of the input dataflow.
   */
  private getTransposedDataset() {
    const dataset = this.getDataset();
    const selectedItemIndeces = this.inputPortMap.in.getSubsetPackage()
      .getItemIndices()
      .sort();

    if (!dataset) {
      return [];
    }

    // filter out rows that are not in the current selection
    const columns = dataset.getColumns();
    const rows = dataset.getRows().filter((d, i) => {
      return selectedItemIndeces.indexOf(i) > -1;
    });

    // generate one item per row and fill fill its values from the dimensions in columns
    const transposedDataset = rows.map(row => {
      const item = {};

      columns.forEach((column) => {
        item[column.name] = row[column.index];
      });

      return item;
    });

    return transposedDataset;
  }

  // EVENT LISTENERS BOUND IN HTML

  private onSelectXColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectXColumnEvent(this, column, prevColumn));
    this.setXColumn(column);
  }

  private onSelectYColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectYColumnEvent(this, column, prevColumn));
    this.setYColumn(column);
  }

  private onSelectColorColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectYColumnEvent(this, column, prevColumn));
    this.setColorColumn(column);
  }

  private onInputSpecChanged(event: any) {
    const input = event.target.value;
    let newSpec = null;

    try {
      newSpec = JSON.parse(input);
    } catch (e) {
      this.coverText = e.message;
    } finally {
      if (!!newSpec) {
        this.vegaSpec = newSpec;
        this.vegaSpecString = input;
        this.findDefaultColumns();
      }
    }
  }

  private onSelectedViewChanged(event: any) {
    const selectedViewName = event.target.value;
    this.selectedViewIndex = this.viewsInVegaSpec.indexOf(selectedViewName);
  }
}
