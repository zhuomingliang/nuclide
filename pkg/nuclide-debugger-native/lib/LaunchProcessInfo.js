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
exports.LaunchProcessInfo = undefined;

var _asyncToGenerator = _interopRequireDefault(require('async-to-generator'));

var _LldbDebuggerInstance;

function _load_LldbDebuggerInstance() {
  return _LldbDebuggerInstance = require('./LldbDebuggerInstance');
}

var _nuclideDebuggerBase;

function _load_nuclideDebuggerBase() {
  return _nuclideDebuggerBase = require('../../nuclide-debugger-base');
}

var _nuclideRemoteConnection;

function _load_nuclideRemoteConnection() {
  return _nuclideRemoteConnection = require('../../nuclide-remote-connection');
}

var _utils;

function _load_utils() {
  return _utils = require('./utils');
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let LaunchProcessInfo = exports.LaunchProcessInfo = class LaunchProcessInfo extends (_nuclideDebuggerBase || _load_nuclideDebuggerBase()).DebuggerProcessInfo {

  constructor(targetUri, launchTargetInfo) {
    super('lldb', targetUri);
    this._launchTargetInfo = launchTargetInfo;
  }

  supportThreads() {
    return true;
  }

  debug() {
    var _this = this;

    return (0, _asyncToGenerator.default)(function* () {
      const rpcService = _this._getRpcService();
      if (typeof _this.basepath === 'string') {
        _this._launchTargetInfo.basepath = _this.basepath;
      }

      let debugSession = null;
      let outputDisposable = (0, (_nuclideDebuggerBase || _load_nuclideDebuggerBase()).registerOutputWindowLogging)(rpcService.getOutputWindowObservable().refCount());
      try {
        yield rpcService.launch(_this._launchTargetInfo);
        // Start websocket server with Chrome after launch completed.

        if (!outputDisposable) {
          throw new Error('Invariant violation: "outputDisposable"');
        }

        debugSession = new (_LldbDebuggerInstance || _load_LldbDebuggerInstance()).LldbDebuggerInstance(_this, rpcService, outputDisposable);
        outputDisposable = null;
      } finally {
        if (outputDisposable != null) {
          outputDisposable.dispose();
        }
      }
      return debugSession;
    })();
  }

  supportSingleThreadStepping() {
    return true;
  }

  _getRpcService() {
    const debuggerConfig = {
      logLevel: (0, (_utils || _load_utils()).getConfig)().serverLogLevel,
      pythonBinaryPath: (0, (_utils || _load_utils()).getConfig)().pythonBinaryPath,
      buckConfigRootFile: (0, (_utils || _load_utils()).getConfig)().buckConfigRootFile
    };
    const service = (0, (_nuclideRemoteConnection || _load_nuclideRemoteConnection()).getServiceByNuclideUri)('NativeDebuggerService', this.getTargetUri());

    if (!service) {
      throw new Error('Invariant violation: "service"');
    }

    return new service.NativeDebuggerService(debuggerConfig);
  }
};