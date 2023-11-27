import React, { useCallback, useEffect, useState, useReducer } from 'react';
import { AdvancedToolbox, InputDoubleRange, useViewportGrid } from '@ohif/ui';
import { Types } from '@ohif/extension-cornerstone';
import { utilities } from '@cornerstonejs/tools';
import { LegacyButton } from '@ohif/ui';

const { segmentation: segmentationUtils } = utilities;

const TOOL_TYPES = {
  CIRCULAR_BRUSH: 'CircularBrush',
  SPHERE_BRUSH: 'SphereBrush',
  CIRCULAR_ERASER: 'CircularEraser',
  SPHERE_ERASER: 'SphereEraser',
  CIRCLE_SCISSOR: 'CircleScissor',
  RECTANGLE_SCISSOR: 'RectangleScissor',
  SPHERE_SCISSOR: 'SphereScissor',
  THRESHOLD_CIRCULAR_BRUSH: 'ThresholdCircularBrush',
  THRESHOLD_SPHERE_BRUSH: 'ThresholdSphereBrush',
  SMART_BRUSH: 'SmartBrush',
};

const ACTIONS = {
  SET_TOOL_CONFIG: 'SET_TOOL_CONFIG',
  SET_ACTIVE_TOOL: 'SET_ACTIVE_TOOL',
};

const initialState = {
  Brush: {
    brushSize: 15,
    mode: 'CircularBrush', // Can be 'CircularBrush' or 'SphereBrush'
  },
  Eraser: {
    brushSize: 15,
    mode: 'CircularEraser', // Can be 'CircularEraser' or 'SphereEraser'
  },
  Scissors: {
    brushSize: 15,
    mode: 'CircleScissor', // E.g., 'CircleScissor', 'RectangleScissor', or 'SphereScissor'
  },
  ThresholdBrush: {
    brushSize: 15,
    thresholdRange: [-500, 500],
  },
  SmartBrush: {
    radius: 5,
    sensitivity: 0.5,
  },
  activeTool: null,
};

function toolboxReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_TOOL_CONFIG:
      const { tool, config } = action.payload;
      return {
        ...state,
        [tool]: {
          ...state[tool],
          ...config,
        },
      };
    case ACTIONS.SET_ACTIVE_TOOL:
      return { ...state, activeTool: action.payload };
    default:
      return state;
  }
}

function SegmentationToolbox({ servicesManager, extensionManager }) {
  const { toolbarService, segmentationService, toolGroupService } =
    servicesManager.services as Types.CornerstoneServices;

  const [viewportGrid] = useViewportGrid();
  const { viewports, activeViewportId } = viewportGrid;

  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [state, dispatch] = useReducer(toolboxReducer, initialState);

  const updateActiveTool = useCallback(() => {
    if (!viewports?.size || activeViewportId === undefined) {
      return;
    }
    const viewport = viewports.get(activeViewportId);

    if (!viewport) {
      return;
    }

    dispatch({
      type: ACTIONS.SET_ACTIVE_TOOL,
      payload: toolGroupService.getActiveToolForViewport(viewport.viewportId),
    });
  }, [activeViewportId, viewports, toolGroupService, dispatch]);

  const setToolActive = useCallback(
    toolName => {
      toolbarService.recordInteraction({
        interactionType: 'tool',
        commands: [
          {
            commandName: 'setToolActive',
            commandOptions: {
              toolName,
            },
          },
        ],
      });

      dispatch({ type: ACTIONS.SET_ACTIVE_TOOL, payload: toolName });
    },
    [toolbarService, dispatch]
  );

  /**
   * sets the tools enabled IF there are segmentations
   */
  useEffect(() => {
    const events = [
      segmentationService.EVENTS.SEGMENTATION_ADDED,
      segmentationService.EVENTS.SEGMENTATION_UPDATED,
      segmentationService.EVENTS.SEGMENTATION_REMOVED,
    ];

    const unsubscriptions = [];

    events.forEach(event => {
      const { unsubscribe } = segmentationService.subscribe(event, () => {
        const segmentations = segmentationService.getSegmentations();

        const activeSegmentation = segmentations?.find(seg => seg.isActive);

        setToolsEnabled(activeSegmentation?.segmentCount > 0);
      });

      unsubscriptions.push(unsubscribe);
    });

    updateActiveTool();

    return () => {
      unsubscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [activeViewportId, viewports, segmentationService, updateActiveTool]);

  /**
   * Update the active tool when the toolbar state changes
   */
  useEffect(() => {
    const { unsubscribe } = toolbarService.subscribe(
      toolbarService.EVENTS.TOOL_BAR_STATE_MODIFIED,
      () => {
        updateActiveTool();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [toolbarService, updateActiveTool]);

  useEffect(() => {
    // if the active tool is not a brush tool then do nothing
    if (!Object.values(TOOL_TYPES).includes(state.activeTool)) {
      return;
    }

    // if the tool is Segmentation and it is enabled then do nothing
    if (toolsEnabled) {
      return;
    }

    // if the tool is Segmentation and it is disabled, then switch
    // back to the window level tool to not confuse the user when no
    // segmentation is active or when there is no segment in the segmentation
    setToolActive('WindowLevel');
  }, [toolsEnabled, state.activeTool, setToolActive]);

  const updateBrushSize = useCallback(
    (toolName, brushSize) => {
      toolGroupService.getToolGroupIds()?.forEach(toolGroupId => {
        segmentationUtils.setBrushSizeForToolGroup(toolGroupId, brushSize, toolName);
      });
    },
    [toolGroupService]
  );

  const onBrushSizeChange = useCallback(
    (valueAsStringOrNumber, toolCategory) => {
      const value = Number(valueAsStringOrNumber);

      _getToolNamesFromCategory(toolCategory).forEach(toolName => {
        updateBrushSize(toolName, value);
      });

      dispatch({
        type: ACTIONS.SET_TOOL_CONFIG,
        payload: {
          tool: toolCategory,
          config: { brushSize: value },
        },
      });
    },
    [toolGroupService, dispatch]
  );

  const onSmartBrushChange = useCallback(
    (valueAsStringOrNumber, toolCategory, type: string) => {
      let value = valueAsStringOrNumber;
      if (type === 'sensitivity' || type === 'radius') {
        value = Number(valueAsStringOrNumber);
      }

      const toolNames = _getToolNamesFromCategory(toolCategory);

      const config = {};
      config[type] = value;

      toolNames.forEach(toolName => {
        toolGroupService.getToolGroupIds()?.forEach(toolGroupId => {
          const toolGroup = toolGroupService.getToolGroup(toolGroupId);

          toolGroup.setToolConfiguration(toolName, config);
        });
      });

      dispatch({
        type: ACTIONS.SET_TOOL_CONFIG,
        payload: {
          tool: toolCategory,
          config: config,
        },
      });
    },
    [toolGroupService, dispatch]
  );

  const onSmartBrushPropogate = useCallback(toolCategory => {
    const toolNames = _getToolNamesFromCategory(toolCategory);

    toolNames.forEach(toolName => {
      toolGroupService.getToolGroupIds()?.forEach(toolGroupId => {
        const toolGroup = toolGroupService.getToolGroup(toolGroupId);

        const smartBrushInst = toolGroup.getToolInstance(toolName);
        if (smartBrushInst !== undefined) {
          toolGroup.getToolInstance(toolName).propogate();
        }
      });
    });
  }, []);

  const handleRangeChange = useCallback(
    newRange => {
      if (
        newRange[0] === state.ThresholdBrush.thresholdRange[0] &&
        newRange[1] === state.ThresholdBrush.thresholdRange[1]
      ) {
        return;
      }

      const toolNames = _getToolNamesFromCategory('ThresholdBrush');

      toolNames.forEach(toolName => {
        toolGroupService.getToolGroupIds()?.forEach(toolGroupId => {
          const toolGroup = toolGroupService.getToolGroup(toolGroupId);
          toolGroup.setToolConfiguration(toolName, {
            strategySpecificConfiguration: {
              THRESHOLD_INSIDE_CIRCLE: {
                threshold: newRange,
              },
            },
          });
        });
      });

      dispatch({
        type: ACTIONS.SET_TOOL_CONFIG,
        payload: {
          tool: 'ThresholdBrush',
          config: { thresholdRange: newRange },
        },
      });
    },
    [toolGroupService, dispatch, state.ThresholdBrush.thresholdRange]
  );

  return (
    <AdvancedToolbox
      title="Segmentation Tools"
      items={[
        {
          name: 'Brush',
          icon: 'icon-tool-brush',
          disabled: !toolsEnabled,
          active:
            state.activeTool === TOOL_TYPES.CIRCULAR_BRUSH ||
            state.activeTool === TOOL_TYPES.SPHERE_BRUSH,
          onClick: () => setToolActive(TOOL_TYPES.CIRCULAR_BRUSH),
          options: [
            {
              name: 'Radius (mm)',
              id: 'brush-radius',
              type: 'range',
              min: 0.01,
              max: 100,
              value: state.Brush.brushSize,
              step: 0.5,
              onChange: value => onBrushSizeChange(value, 'Brush'),
            },
            {
              name: 'Mode',
              type: 'radio',
              id: 'brush-mode',
              value: state.Brush.mode,
              values: [
                { value: TOOL_TYPES.CIRCULAR_BRUSH, label: 'Circle' },
                { value: TOOL_TYPES.SPHERE_BRUSH, label: 'Sphere' },
              ],
              onChange: value => setToolActive(value),
            },
          ],
        },
        {
          name: 'SmartBrush',
          icon: 'icon-tool-smartbrush',
          disabled: !toolsEnabled,
          active: state.activeTool === TOOL_TYPES.SMART_BRUSH,
          onClick: () => setToolActive(TOOL_TYPES.SMART_BRUSH),
          options: [
            {
              name: 'Radius',
              id: 'smartBrush-radius',
              type: 'range',
              min: 2,
              max: 10,
              value: state.SmartBrush.radius,
              step: 1,
              onChange: value => onSmartBrushChange(value, 'SmartBrush', 'radius'),
            },
            {
              name: 'Sensitivity',
              id: 'smartBrush-sensitivity',
              type: 'range',
              min: 0,
              max: 1,
              value: state.SmartBrush.sensitivity,
              step: 0.05,
              onChange: value => onSmartBrushChange(value, 'SmartBrush', 'sensitivity'),
            },
            {
              name: 'Propogate',
              id: 'smartBrush-propogate',
              type: 'custom',
              children: (
                <LegacyButton
                  onClick={() => {
                    onSmartBrushPropogate('SmartBrush');
                  }}
                >
                  Propogate
                </LegacyButton>
              ),
            },
          ],
        },
        {
          name: 'Eraser',
          icon: 'icon-tool-eraser',
          disabled: !toolsEnabled,
          active:
            state.activeTool === TOOL_TYPES.CIRCULAR_ERASER ||
            state.activeTool === TOOL_TYPES.SPHERE_ERASER,
          onClick: () => setToolActive(TOOL_TYPES.CIRCULAR_ERASER),
          options: [
            {
              name: 'Radius (mm)',
              type: 'range',
              id: 'eraser-radius',
              min: 0.01,
              max: 100,
              value: state.Eraser.brushSize,
              step: 0.5,
              onChange: value => onBrushSizeChange(value, 'Eraser'),
            },
            {
              name: 'Mode',
              type: 'radio',
              id: 'eraser-mode',
              value: state.Eraser.mode,
              values: [
                { value: TOOL_TYPES.CIRCULAR_ERASER, label: 'Circle' },
                { value: TOOL_TYPES.SPHERE_ERASER, label: 'Sphere' },
              ],
              onChange: value => setToolActive(value),
            },
          ],
        },
        {
          name: 'Scissor',
          icon: 'icon-tool-scissor',
          disabled: !toolsEnabled,
          active:
            state.activeTool === TOOL_TYPES.CIRCLE_SCISSOR ||
            state.activeTool === TOOL_TYPES.RECTANGLE_SCISSOR ||
            state.activeTool === TOOL_TYPES.SPHERE_SCISSOR,
          onClick: () => setToolActive(TOOL_TYPES.CIRCLE_SCISSOR),
          options: [
            {
              name: 'Mode',
              type: 'radio',
              value: state.Scissors.mode,
              id: 'scissor-mode',
              values: [
                { value: TOOL_TYPES.CIRCLE_SCISSOR, label: 'Circle' },
                { value: TOOL_TYPES.RECTANGLE_SCISSOR, label: 'Rectangle' },
                { value: TOOL_TYPES.SPHERE_SCISSOR, label: 'Sphere' },
              ],
              onChange: value => setToolActive(value),
            },
          ],
        },
        {
          name: 'Threshold Tool',
          icon: 'icon-tool-threshold',
          disabled: !toolsEnabled,
          active:
            state.activeTool === TOOL_TYPES.THRESHOLD_CIRCULAR_BRUSH ||
            state.activeTool === TOOL_TYPES.THRESHOLD_SPHERE_BRUSH,
          onClick: () => setToolActive(TOOL_TYPES.THRESHOLD_CIRCULAR_BRUSH),
          options: [
            {
              name: 'Radius (mm)',
              id: 'threshold-radius',
              type: 'range',
              min: 0.01,
              max: 100,
              value: state.ThresholdBrush.brushSize,
              step: 0.5,
              onChange: value => onBrushSizeChange(value, 'ThresholdBrush'),
            },
            {
              name: 'Mode',
              type: 'radio',
              id: 'threshold-mode',
              value: state.activeTool,
              values: [
                { value: TOOL_TYPES.THRESHOLD_CIRCULAR_BRUSH, label: 'Circle' },
                { value: TOOL_TYPES.THRESHOLD_SPHERE_BRUSH, label: 'Sphere' },
              ],
              onChange: value => setToolActive(value),
            },
            {
              type: 'custom',
              id: 'segmentation-threshold-range',
              children: () => {
                return (
                  <div>
                    <div className="bg-secondary-light h-[1px]"></div>
                    <div className="mt-1 text-[13px] text-white">Threshold</div>
                    <InputDoubleRange
                      values={state.ThresholdBrush.thresholdRange}
                      onChange={handleRangeChange}
                      minValue={-1000}
                      maxValue={1000}
                      step={1}
                      showLabel={true}
                      allowNumberEdit={true}
                      showAdjustmentArrows={false}
                    />
                  </div>
                );
              },
            },
          ],
        },
      ]}
    />
  );
}

function _getToolNamesFromCategory(category) {
  let toolNames = [];
  switch (category) {
    case 'Brush':
      toolNames = ['CircularBrush', 'SphereBrush'];
      break;
    case 'Eraser':
      toolNames = ['CircularEraser', 'SphereEraser'];
      break;
    case 'ThresholdBrush':
      toolNames = ['ThresholdCircularBrush', 'ThresholdSphereBrush'];
      break;
    case 'SmartBrush':
      toolNames = ['SmartBrush'];
      break;
    default:
      break;
  }

  return toolNames;
}

export default SegmentationToolbox;