import { range } from 'd3-array';
import _ from 'lodash';
import { SpecParser, SpecCompiler, PlotView, InlineDatasetNode, View, MarkEncoding } from 'revize';
import { SignalValue } from 'vega';
import embed from 'vega-embed';
import { Component } from 'vue-property-decorator';

import ColumnSelect from '@/components/column-select/column-select';
import FormInput from '@/components/form-input/form-input';
import { Visualization, injectVisualizationTemplate } from '@/components/visualization';

import { ValueType, checkToken, formatColumnType } from '@/data/parser';
import SubsetPackage, { SubsetItem } from '@/data/package/subset-package';
import TabularDataset, { TabularColumn, TabularRow } from '@/data/tabular-dataset';
import { isNumericalType } from '@/data/util';
import { VisualProperties } from '@/data/visuals';

import * as history from './history';
import template from './vegaview.html';
import { VEGA_EXAMPLE_SPEC } from './vegaExampleSpec';
import SocketConnector, { getSocketConnector } from './socketConnector';

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
  private colorScheme: string[] | null = null;

  private specParser: SpecParser = new SpecParser();
  private specCompiler: SpecCompiler = new SpecCompiler();

  private vegaSpecString: string = !!this.vegaSpec ? JSON.stringify(this.vegaSpec, null, 2) : '{}';
  private viewsInVegaSpec: string[] = [];
  private selectedViewIndex: number = 0;
  private socketConnector: SocketConnector = getSocketConnector();

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

    if (!!this.vegaSpec) {
      this.rootView = this.specParser.parse(this.vegaSpec);
      this.dataset = this.getDatasetFromSpec();
      const outputPort = this.outputPortMap.out;
      outputPort.updatePackage(new SubsetPackage(this.dataset));
      this.portUpdated(outputPort);
    }

    // connect to the websocket revize server for sync'd specs if a server is available
    this.socketConnector.subscribeToRemoteChanges((newSpec: any) => {
      this.onInputSpecChanged({ target: { value: JSON.stringify(newSpec) }}, false)
    });

    setTimeout(this.draw.bind(this), 1000);
  }

  protected draw() {
    if (!this.vegaSpec) {
      this.coverText = 'Please enter a Vega-lite spec in the side panel';
      return;
    }
    // if (!this.hasDataset()) {
    //   this.coverText = 'No dataset';
    //   return;
    // }

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
    const columns = dataset.getColumns();

    const numericalColumns = columns
      .filter(column => isNumericalType(column.type))
      .slice(0, 2)
      .map(column => column.index);

    const ordinalColumns = columns
      .filter(column => !isNumericalType(column.type))
      .slice(0, 2)
      .map(column => column.index);

    if (!!this.xColumn) {
      this.setXColumn(this.updateColumnOnDatasetChange(this.xColumn) as number, false);
    } else {
      if (this.rootView !== null) {
        if (this.rootView.getEncodedValue('x') !== null) {
          const column = columns
            .find(d => d.name === (this.rootView as View).getEncodedValue('x').field);
          this.setXColumn(this.xColumn = (column as TabularColumn).index, false);
        }
      } else {
        this.setXColumn(this.xColumn = numericalColumns.shift() as number, false);
      }
    }
    if (!!this.yColumn) {
      this.setYColumn(this.yColumn = this.updateColumnOnDatasetChange(this.yColumn) as number, false);
    } else {

      if (this.rootView !== null) {
        if (this.rootView.getEncodedValue('y') !== null) {
          const column = columns
            .find(d => d.name === (this.rootView as View).getEncodedValue('y').field);
          this.setYColumn(this.yColumn = (column as TabularColumn).index, false);
        }
      } else {
        this.setYColumn(this.yColumn = numericalColumns.shift() as number, false);
      }
    }

    const colorColumn = columns
      .find(d => d.name === (this.rootView as View).getEncodedValue('color').field);
    if ((this.rootView as View).getEncodedValue('color').scale !== undefined) {
      this.colorScheme = (this.rootView as View).getEncodedValue('color').scale.range;
    } else {
      this.colorScheme = null;
    }

    if (!!this.colorColumn) {
      this.setColorColumn(this.colorColumn = (colorColumn as TabularColumn).index, false);
    } else {
      if (this.rootView !== null && this.rootView.getEncodedValue('color') !== null) {
        this.setColorColumn(this.colorColumn = (colorColumn as TabularColumn).index, false);
      } else {
        this.setColorColumn(this.colorColumn = ordinalColumns.shift() as number, false);
      }

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

    this.rootView.getFlatHierarchy().forEach(view => {
      if (view !== this.rootView) {
        view.dataTransformationNode = null as any;
      }
    });

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

    const renderPromise = this.renderView(this.rootView, this.$refs.vegaCanvas as HTMLElement);

    if (!renderPromise) {
      return;
    }

    renderPromise.then(result => {
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
    } else if (this.xColumn === null || this.yColumn === null || this.colorColumn === null) {
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

      if (this.colorScheme !== null) {
        view.setEncodedValue('color', { field: colorColumn.name, type: colorVegaType, scale: {
          range: this.colorScheme }
        })
      }
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

  private getBrushedInfo() {
    let items: SubsetItem[] = [];
    let dataset: TabularDataset;

    if (this.inputPortMap.in.isConnected()) {
      const pkg = this.inputPortMap.in.getSubsetPackage();
      items = pkg.getItems();
      dataset = pkg.getDataset() as TabularDataset;
    } else {
      dataset = this.dataset as TabularDataset;

      // since there is no connected data flow at this point, there are no "filtered" items
      // therefore, create dummy items for each entry in the dataset
      for (let i = 0; i < dataset.getRows().length; i++) {
        const item: SubsetItem = {
          index: i,
          visuals: {},
        };

        items.push(item);
      }
    }

    return { items, dataset };
  }

  private putSelectionInOutport(dataset: TabularDataset, itemsInBrush: SubsetItem[]) {
    if (this.inputPortMap.in.isConnected()) {
      this.computeSelection();
    } else {
      const pkg = new SubsetPackage(dataset, true);
      const selectionPkg = pkg.subset(itemsInBrush.map(i => i.index));
      this.outputPortMap.selection.updatePackage(selectionPkg);
    }
  }

  /**
   * Event listener for the Vega-lite "brush" signal. Adapts the brushed region from the canvas
   * to the input data flow of the vega-view node.
   * @param name name of the signal, which will always be always brush here
   * @param brush the data returned by the vl brush event
   */
  private onViewBrushed(name: string = 'brush', brush: SignalValue) {
    const brushedInfo = this.getBrushedInfo();
    const dataset = brushedInfo.dataset;
    const items = brushedInfo.items;

    if (!dataset) {
      return;
    }

    this.selection.clear();

    const itemsInBrush = this.getItemsInBrush(dataset, items, brush);
    itemsInBrush.forEach(i => this.selection.addItem(i.index));

    this.putSelectionInOutport(dataset, itemsInBrush);

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

  private hasDatasetInSpec() {
    if (!this.rootView) {
      return false;
    }

    const datasetInSpec = this.rootView.dataTransformationNode;

    if (!(datasetInSpec instanceof InlineDatasetNode)) {
      return false;
    } else if ((datasetInSpec.values as []).length === 0) {
      return false;
    }

    return true;
  }

  private getColumnType(item: any, columnName: string) {
    const type = checkToken(item[columnName]).type;
    return type;
  }

  /**
   * Generates a TabularDataset from any data that is present in the current Vega-lite
   * specification.
   */
  private getDatasetFromSpec() {
    const columns: TabularColumn[] = [];
    const rows: TabularRow[] = [];
    const dataset: TabularDataset = new TabularDataset({columns, rows});

    if (!this.rootView) {
      return dataset;
    }

    // TODO: generalize to other dataset types
    const datasetInSpec = this.rootView.dataTransformationNode as InlineDatasetNode;
    dataset.setName(datasetInSpec.name);

    if (!this.hasDatasetInSpec()) {
      return dataset;
    }

    // get columns
    Object.keys((datasetInSpec.values as any)[0]).forEach((columnHeader, i) => {
      columns.push({
        index: i,
        name: columnHeader,
        type: this.getColumnType((datasetInSpec.values as any)[0], columnHeader),
        hasDuplicate: true,
      });
    });

    // get rows
    (datasetInSpec.values as []).forEach(item => {
      const row = Object.keys(item).map(key => item[key]);
      rows.push(row);
    });

    columns.forEach(column => {
      formatColumnType(rows, column);
    });

    return dataset;
  }

  /**
   * Returns a list of items identical representing a row in the input data for every active item
   * of the input dataflow.
   */
  private getTransposedDataset() {
    let dataset: TabularDataset;
    let selectedItemIndeces: number[] = [];

    if (this.hasDataset()) {
      dataset = this.getDataset();
    } else {
      return [];
    }

    if (this.hasDatasetInSpec()) {
      selectedItemIndeces = range(dataset.getRows().length);
    } else {
      selectedItemIndeces = this.inputPortMap.in.getSubsetPackage()
        .getItemIndices()
        .sort();
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
        (item as any)[column.name] = row[column.index];
      });

      return item;
    });

    return transposedDataset;
  }

  // EVENT LISTENERS BOUND IN HTML

  private onSelectXColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectXColumnEvent(this, column, prevColumn));
    this.setXColumn(column);
    this.socketConnector.publishNewSpec(this.vegaSpec);
  }

  private onSelectYColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectYColumnEvent(this, column, prevColumn));
    this.setYColumn(column);
    this.socketConnector.publishNewSpec(this.vegaSpec);
  }

  private onSelectColorColumn(column: number, prevColumn: number | null) {
    this.commitHistory(history.selectYColumnEvent(this, column, prevColumn));
    this.setColorColumn(column);
    this.socketConnector.publishNewSpec(this.vegaSpec);
  }

  private onInputSpecChanged(event: any, updateRemoteFlag: boolean=true) {
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
        try {
          this.rootView = this.specParser.parse(this.vegaSpec);
          this.dataset = this.getDatasetFromSpec();
          const outputPort = this.outputPortMap.out;
          outputPort.updatePackage(new SubsetPackage(this.dataset));
          this.portUpdated(outputPort);
          this.findDefaultColumns();
        } catch(e: any) {
          console.log(e)
        }

        if (updateRemoteFlag) {
          this.socketConnector.publishNewSpec(newSpec);
        }
      }
    }
  }

  private onSelectedViewChanged(event: any) {
    const selectedViewName = event.target.value;
    this.selectedViewIndex = this.viewsInVegaSpec.indexOf(selectedViewName);
  }
}
