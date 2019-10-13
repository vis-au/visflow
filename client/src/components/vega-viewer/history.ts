import VegaView from './vegaview';
import { HistoryNodeOptionEvent, nodeOptionEvent } from '@/store/history/types';

enum VegaViewEventType {
  SELECT_X_COLUMN = 'setXColumn',
  SELECT_Y_COLUMN = 'setYColumn',
}

export const selectXColumnEvent = (node: VegaView, column: number | null, prevColumn: number | null):
HistoryNodeOptionEvent => {
return nodeOptionEvent(
  VegaViewEventType.SELECT_X_COLUMN,
  'select X column',
  node,
  node.setXColumn,
  column,
  prevColumn,
);
};

export const selectYColumnEvent = (node: VegaView, column: number | null, prevColumn: number | null):
HistoryNodeOptionEvent => {
return nodeOptionEvent(
  VegaViewEventType.SELECT_Y_COLUMN,
  'select Y column',
  node,
  node.setYColumn,
  column,
  prevColumn,
);
};
