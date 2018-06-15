/**
 * @fileoverview This is the state handler for system-wise interaction.
 */

import { Module } from 'vuex';
import { RootState } from '../index';
import Port from '@/components/port/port';
import Node from '@/components/node/node';
import store from '../index';

interface InteractionState {
  draggedPort?: Port;
  draggedX1: number;
  draggedY1: number;
  draggedX2: number;
  draggedY2: number;
}

const defaultState = {
  draggedPort: undefined,
  draggedX1: 0,
  draggedY1: 0,
  draggedX2: 0,
  draggedY2: 0,
};

const getters = {
};

const mutations = {
  portDragStarted: (state: InteractionState, port: Port) => {
    state.draggedPort = port;
    const $port = $(port.$el);
    const portOffset = $port.offset() as JQuery.Coordinates;
    const offset: JQuery.Coordinates = store.getters['dataflow/canvasOffset'];
    const portWidth = $port.width() as number;
    const portHeight = $port.height() as number;
    state.draggedX1 = portOffset.left - offset.left + portWidth / 2;
    state.draggedY1 = portOffset.top - offset.top + portHeight / 2;
  },

  portDragged: (state: InteractionState, p: { x: number, y: number }) => {
    const offset: JQuery.Coordinates = store.getters['dataflow/canvasOffset'];
    state.draggedX2 = p.x - offset.left;
    state.draggedY2 = p.y - offset.top;
  },

  portDragEnded: (state: InteractionState, port: Port) => {
    state.draggedPort = undefined;
  },

  dropPortOnNode: (state: InteractionState, node: Node) => {
    store.commit('dataflow/createEdge', {
      sourcePort: state.draggedPort,
      targetNode: node,
    });
  },

  dropPortOnPort: (state: InteractionState, port: Port) => {
    store.commit('dataflow/createEdge', {
      sourcePort: state.draggedPort,
      targetPort: port,
    });
  },
};

const actions = {
};

export const interaction: Module<InteractionState, RootState> = {
  namespaced: true,
  state: defaultState,
  getters,
  mutations,
  actions,
};
