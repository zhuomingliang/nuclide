'use strict';
'use babel';

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.activate = activate;
exports.consumeDiagnosticUpdates = consumeDiagnosticUpdates;
exports.consumeStatusBar = consumeStatusBar;
exports.consumeToolBar = consumeToolBar;
exports.deactivate = deactivate;
exports.serialize = serialize;
exports.getHomeFragments = getHomeFragments;
exports.getDistractionFreeModeProvider = getDistractionFreeModeProvider;

var _atom = require('atom');

var _nuclideAnalytics;

function _load_nuclideAnalytics() {
  return _nuclideAnalytics = require('../../nuclide-analytics');
}

var _UniversalDisposable;

function _load_UniversalDisposable() {
  return _UniversalDisposable = _interopRequireDefault(require('../../commons-node/UniversalDisposable'));
}

var _createPanel;

function _load_createPanel() {
  return _createPanel = _interopRequireDefault(require('./createPanel'));
}

var _StatusBarTile;

function _load_StatusBarTile() {
  return _StatusBarTile = _interopRequireDefault(require('./StatusBarTile'));
}

var _gutter;

function _load_gutter() {
  return _gutter = require('./gutter');
}

var _goToLocation;

function _load_goToLocation() {
  return _goToLocation = require('../../commons-atom/go-to-location');
}

var _featureConfig;

function _load_featureConfig() {
  return _featureConfig = _interopRequireDefault(require('../../commons-atom/featureConfig'));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEFAULT_HIDE_DIAGNOSTICS_PANEL = true;
const DEFAULT_TABLE_HEIGHT = 200;
const DEFAULT_FILTER_BY_ACTIVE_EDITOR = false;
const LINTER_PACKAGE = 'linter';

let subscriptions = null;
let bottomPanel = null;
let statusBarTile;

let activationState = null;

let consumeUpdatesCalled = false;

function createPanel(diagnosticUpdater) {
  if (!activationState) {
    throw new Error('Invariant violation: "activationState"');
  }

  var _createDiagnosticsPan = (0, (_createPanel || _load_createPanel()).default)(diagnosticUpdater.allMessageUpdates, activationState.diagnosticsPanelHeight, activationState.filterByActiveTextEditor, (_featureConfig || _load_featureConfig()).default.observeAsStream('nuclide-diagnostics-ui.showDiagnosticTraces'), disableLinter, filterByActiveTextEditor => {
    if (activationState != null) {
      activationState.filterByActiveTextEditor = filterByActiveTextEditor;
    }
  });

  const panel = _createDiagnosticsPan.atomPanel;
  const setWarnAboutLinter = _createDiagnosticsPan.setWarnAboutLinter;

  logPanelIsDisplayed();
  bottomPanel = panel;

  return new (_UniversalDisposable || _load_UniversalDisposable()).default(panel.onDidChangeVisible(visible => {
    if (!activationState) {
      throw new Error('Invariant violation: "activationState"');
    }

    activationState.hideDiagnosticsPanel = !visible;
  }), watchForLinter(setWarnAboutLinter));
}

function disableLinter() {
  atom.packages.disablePackage(LINTER_PACKAGE);
}

function watchForLinter(setWarnAboutLinter) {
  if (atom.packages.isPackageActive(LINTER_PACKAGE)) {
    setWarnAboutLinter(true);
  }
  return new (_UniversalDisposable || _load_UniversalDisposable()).default(atom.packages.onDidActivatePackage(pkg => {
    if (pkg.name === LINTER_PACKAGE) {
      setWarnAboutLinter(true);
    }
  }), atom.packages.onDidDeactivatePackage(pkg => {
    if (pkg.name === LINTER_PACKAGE) {
      setWarnAboutLinter(false);
    }
  }));
}

function getStatusBarTile() {
  if (!statusBarTile) {
    statusBarTile = new (_StatusBarTile || _load_StatusBarTile()).default();
  }
  return statusBarTile;
}

function tryRecordActivationState() {
  if (!activationState) {
    throw new Error('Invariant violation: "activationState"');
  }

  if (bottomPanel && bottomPanel.isVisible()) {
    activationState.diagnosticsPanelHeight = bottomPanel.getItem().clientHeight;
  }
}

function activate(state_) {
  let state = state_;
  if (subscriptions) {
    return;
  }
  subscriptions = new (_UniversalDisposable || _load_UniversalDisposable()).default();

  // Ensure the integrity of the ActivationState created from state.
  if (!state) {
    state = {};
  }
  if (typeof state.hideDiagnosticsPanel !== 'boolean') {
    state.hideDiagnosticsPanel = DEFAULT_HIDE_DIAGNOSTICS_PANEL;
  }
  if (typeof state.diagnosticsPanelHeight !== 'number') {
    state.diagnosticsPanelHeight = DEFAULT_TABLE_HEIGHT;
  }
  if (typeof state.filterByActiveTextEditor !== 'boolean') {
    state.filterByActiveTextEditor = DEFAULT_FILTER_BY_ACTIVE_EDITOR;
  }
  activationState = state;
}

function consumeDiagnosticUpdates(diagnosticUpdater) {
  getStatusBarTile().consumeDiagnosticUpdates(diagnosticUpdater);
  gutterConsumeDiagnosticUpdates(diagnosticUpdater);

  // Currently, the DiagnosticsPanel is designed to work with only one DiagnosticUpdater.
  if (consumeUpdatesCalled) {
    return;
  }
  consumeUpdatesCalled = true;

  tableConsumeDiagnosticUpdates(diagnosticUpdater);
  addAtomCommands(diagnosticUpdater);
}

function gutterConsumeDiagnosticUpdates(diagnosticUpdater) {
  const fixer = diagnosticUpdater.applyFix.bind(diagnosticUpdater);

  if (!(subscriptions != null)) {
    throw new Error('Invariant violation: "subscriptions != null"');
  }

  subscriptions.add(atom.workspace.observeTextEditors(editor => {
    const filePath = editor.getPath();
    if (!filePath) {
      return; // The file is likely untitled.
    }

    const callback = update => {
      // Although the subscription below should be cleaned up on editor destroy,
      // the very act of destroying the editor can trigger diagnostic updates.
      // Thus this callback can still be triggered after the editor is destroyed.
      if (!editor.isDestroyed()) {
        (0, (_gutter || _load_gutter()).applyUpdateToEditor)(editor, update, fixer);
      }
    };
    const disposable = new (_UniversalDisposable || _load_UniversalDisposable()).default(diagnosticUpdater.getFileMessageUpdates(filePath).subscribe(callback));

    // Be sure to remove the subscription on the DiagnosticStore once the editor is closed.
    editor.onDidDestroy(() => disposable.dispose());
  }));
}

function tableConsumeDiagnosticUpdates(diagnosticUpdater) {
  if (!(subscriptions != null)) {
    throw new Error('Invariant violation: "subscriptions != null"');
  }

  const toggleTable = () => {
    const bottomPanelRef = bottomPanel;
    if (bottomPanelRef == null) {
      if (!(subscriptions != null)) {
        throw new Error('Invariant violation: "subscriptions != null"');
      }

      subscriptions.add(createPanel(diagnosticUpdater));
    } else if (bottomPanelRef.isVisible()) {
      tryRecordActivationState();
      bottomPanelRef.hide();
    } else {
      logPanelIsDisplayed();
      bottomPanelRef.show();
    }
  };

  const showTable = () => {
    if (bottomPanel == null || !bottomPanel.isVisible()) {
      toggleTable();
    }
  };

  subscriptions.add(atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:toggle-table', toggleTable));

  subscriptions.add(atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:show-table', showTable));

  if (!activationState) {
    throw new Error('Invariant violation: "activationState"');
  }

  if (!activationState.hideDiagnosticsPanel) {
    if (!(subscriptions != null)) {
      throw new Error('Invariant violation: "subscriptions != null"');
    }

    subscriptions.add(createPanel(diagnosticUpdater));
  }
}

function addAtomCommands(diagnosticUpdater) {
  const fixAllInCurrentFile = () => {
    const editor = atom.workspace.getActiveTextEditor();
    if (editor == null) {
      return;
    }
    const path = editor.getPath();
    if (path == null) {
      return;
    }
    (0, (_nuclideAnalytics || _load_nuclideAnalytics()).track)('diagnostics-autofix-all-in-file');
    diagnosticUpdater.applyFixesForFile(path);
  };

  if (!(subscriptions != null)) {
    throw new Error('Invariant violation: "subscriptions != null"');
  }

  subscriptions.add(atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:fix-all-in-current-file', fixAllInCurrentFile));

  subscriptions.add(new KeyboardShortcuts(diagnosticUpdater));
}

// TODO(peterhal): The current index should really live in the DiagnosticStore.
let KeyboardShortcuts = class KeyboardShortcuts {

  constructor(diagnosticUpdater) {
    this._index = null;
    this._diagnostics = [];

    this._subscriptions = new (_UniversalDisposable || _load_UniversalDisposable()).default();

    const first = () => this.setIndex(0);
    const last = () => this.setIndex(this._diagnostics.length - 1);
    this._subscriptions.add(diagnosticUpdater.allMessageUpdates.subscribe(diagnostics => {
      this._diagnostics = diagnostics.filter(diagnostic => diagnostic.scope === 'file');
      this._index = null;
      this._traceIndex = null;
    }), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-first-diagnostic', first), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-last-diagnostic', last), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-next-diagnostic', () => {
      this._index == null ? first() : this.setIndex(this._index + 1);
    }), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-previous-diagnostic', () => {
      this._index == null ? last() : this.setIndex(this._index - 1);
    }), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-next-diagnostic-trace', () => {
      this.nextTrace();
    }), atom.commands.add('atom-workspace', 'nuclide-diagnostics-ui:go-to-previous-diagnostic-trace', () => {
      this.previousTrace();
    }));
  }

  setIndex(index) {
    this._traceIndex = null;
    if (this._diagnostics.length === 0) {
      this._index = null;
      return;
    }
    this._index = Math.max(0, Math.min(index, this._diagnostics.length - 1));
    this.gotoCurrentIndex();
  }

  gotoCurrentIndex() {
    if (!(this._index != null)) {
      throw new Error('Invariant violation: "this._index != null"');
    }

    if (!(this._traceIndex == null)) {
      throw new Error('Invariant violation: "this._traceIndex == null"');
    }

    const diagnostic = this._diagnostics[this._index];
    const range = diagnostic.range;
    if (range == null) {
      (0, (_goToLocation || _load_goToLocation()).goToLocation)(diagnostic.filePath);
    } else {
      (0, (_goToLocation || _load_goToLocation()).goToLocation)(diagnostic.filePath, range.start.row, range.start.column);
    }
  }

  nextTrace() {
    const traces = this.currentTraces();
    if (traces == null) {
      return;
    }
    let candidateTrace = this._traceIndex == null ? 0 : this._traceIndex + 1;
    while (candidateTrace < traces.length) {
      if (this.trySetCurrentTrace(traces, candidateTrace)) {
        return;
      }
      candidateTrace++;
    }
    this._traceIndex = null;
    this.gotoCurrentIndex();
  }

  previousTrace() {
    const traces = this.currentTraces();
    if (traces == null) {
      return;
    }
    let candidateTrace = this._traceIndex == null ? traces.length - 1 : this._traceIndex - 1;
    while (candidateTrace >= 0) {
      if (this.trySetCurrentTrace(traces, candidateTrace)) {
        return;
      }
      candidateTrace--;
    }
    this._traceIndex = null;
    this.gotoCurrentIndex();
  }

  currentTraces() {
    if (this._index == null) {
      return null;
    }
    const diagnostic = this._diagnostics[this._index];
    return diagnostic.trace;
  }

  // TODO: Should filter out traces whose location matches the main diagnostic's location?
  trySetCurrentTrace(traces, traceIndex) {
    const trace = traces[traceIndex];
    if (trace.filePath != null && trace.range != null) {
      this._traceIndex = traceIndex;
      (0, (_goToLocation || _load_goToLocation()).goToLocation)(trace.filePath, trace.range.start.row, trace.range.start.column);
      return true;
    }
    return false;
  }

  dispose() {
    this._subscriptions.dispose();
  }
};
function consumeStatusBar(statusBar) {
  getStatusBarTile().consumeStatusBar(statusBar);
}

function consumeToolBar(getToolBar) {
  const toolBar = getToolBar('nuclide-diagnostics-ui');
  toolBar.addButton({
    icon: 'law',
    callback: 'nuclide-diagnostics-ui:toggle-table',
    tooltip: 'Toggle Diagnostics Table',
    priority: 100
  });
  const disposable = new _atom.Disposable(() => {
    toolBar.removeItems();
  });

  if (!(subscriptions != null)) {
    throw new Error('Invariant violation: "subscriptions != null"');
  }

  subscriptions.add(disposable);
  return disposable;
}

function deactivate() {
  if (subscriptions) {
    subscriptions.dispose();
    subscriptions = null;
  }

  if (bottomPanel) {
    bottomPanel.destroy();
    bottomPanel = null;
  }

  if (statusBarTile) {
    statusBarTile.dispose();
    statusBarTile = null;
  }

  consumeUpdatesCalled = false;
}

function serialize() {
  tryRecordActivationState();

  if (!activationState) {
    throw new Error('Invariant violation: "activationState"');
  }

  return activationState;
}

function getHomeFragments() {
  return {
    feature: {
      title: 'Diagnostics',
      icon: 'law',
      description: 'Displays diagnostics, errors, and lint warnings for your files and projects.',
      command: 'nuclide-diagnostics-ui:show-table'
    },
    priority: 4
  };
}

function getDistractionFreeModeProvider() {
  return {
    name: 'nuclide-diagnostics-ui',
    isVisible: function () {
      return bottomPanel != null && bottomPanel.isVisible();
    },
    toggle: function () {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'nuclide-diagnostics-ui:toggle-table');
    }
  };
}

function logPanelIsDisplayed() {
  (0, (_nuclideAnalytics || _load_nuclideAnalytics()).track)('diagnostics-show-table');
}