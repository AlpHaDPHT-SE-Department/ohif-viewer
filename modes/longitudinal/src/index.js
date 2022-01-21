import toolbarButtons from './toolbarButtons.js';
import { hotkeys } from '@ohif/core';

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocols: '@ohif/extension-default.hangingProtocolModule.default',
};

const tracked = {
  measurements:
    '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport:
    '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const dicomsr = {
  sopClassHandler: '@ohif/extension-dicom-sr.sopClassHandlerModule.dicom-sr',
  viewport: '@ohif/extension-dicom-sr.viewportModule.dicom-sr',
};

// TODO -> We should inject these with webpack from the package.json
// for id -> process.env.npm_package_name
// for version -> process.env.npm_package_version
// For extension Dependencies, can at least get the versions from process.env.npm_package_peerDependencies
const id = '@ohif/mode-longitudinal'; //
const version = '1.0.1';
const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  '@ohif/extension-default': '^1.0.1',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^0.0.1',
  '@ohif/extension-dicom-sr': '^0.0.1',
};

function modeFactory({ modeConfiguration }) {
  return {
    // TODO: We're using this as a route segment
    // We should not be.
    id,
    routeName: 'viewer',
    version,
    displayName: 'Basic Viewer',
    /**
     * Lifecycle hooks
     */
    onModeEnter: ({ servicesManager, extensionManager }) => {
      // Note: If tool's aren't initialized, this doesn't have viewport/tools
      // to "set active". This is mostly for the toolbar UI state?
      // Could update tool manager to be always persistent, and to set state
      // on load?
      const { ToolBarService } = servicesManager.services;
      const interaction = {
        groupId: 'primary',
        itemId: 'Wwwc',
        interactionType: 'tool',
        commandOptions: undefined,
      };

      ToolBarService.recordInteraction(interaction);

      ToolBarService.init(extensionManager);
      ToolBarService.addButtons(toolbarButtons);
      ToolBarService.createButtonSection('primary', [
        'MeasurementTools',
        'Zoom',
        'WindowLevel',
        'Pan',
        'Capture',
        'Layout',
        'MoreTools',
      ]);
    },
    onModeExit: () => {},
    validationTags: {
      study: [],
      series: [],
    },
    isValidMode: ({ modalities }) => {
      const modalities_list = modalities.split('\\');

      // Slide Microscopy modality not supported by basic mode yet
      return !modalities_list.includes('SM');
    },
    routes: [
      {
        path: 'longitudinal',
        /*init: ({ servicesManager, extensionManager }) => {
          //defaultViewerRouteInit
        },*/
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [tracked.thumbnailList],
              // TODO: Should be optional, or required to pass empty array for slots?
              rightPanels: [tracked.measurements],
              viewports: [
                {
                  namespace: tracked.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: dicomsr.viewport,
                  displaySetsToDisplay: [dicomsr.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    extensions: extensionDependencies,
    hangingProtocols: [ohif.hangingProtocols],
    sopClassHandlers: [ohif.sopClassHandler, dicomsr.sopClassHandler],
    hotkeys: [...hotkeys.defaults.hotkeyBindings],
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
