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
exports.BufferSubscription = undefined;

var _asyncToGenerator = _interopRequireDefault(require('async-to-generator'));

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _atom = require('atom');

var _nuclideLogging;

function _load_nuclideLogging() {
  return _nuclideLogging = require('../../nuclide-logging');
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const logger = (0, (_nuclideLogging || _load_nuclideLogging()).getLogger)();

const RESYNC_TIMEOUT_MS = 2000;

// Watches a TextBuffer for change/rename/destroy events and then sends
// those events to the FileNotifier or NotifiersByConnection as appropriate.
//
// change/rename events go to the FileNotifier.
// If sending a change/rename throws, that is an indication that we are out of
// sync with the server side, so send a 'sync' message.
//
// close events have a different error recovery policy so they go to the main
// NotifiersByConnection. The close message must be sent even if the buffer is
// renamed or destroyed, so rather than keep the per-buffer info around after
// a buffer is destroyed, the outstanding close messages are kept with the
// per-connection info in NotifiersByConnection.
let BufferSubscription = exports.BufferSubscription = class BufferSubscription {

  constructor(notifiers, buffer) {
    var _this = this;

    this._notifiers = notifiers;
    this._buffer = buffer;
    this._notifier = null;
    this._serverVersion = -1;
    this._lastAttemptedSync = -1;
    this._sentOpen = false;

    const subscriptions = new _atom.CompositeDisposable();

    subscriptions.add(buffer.onDidChange((() => {
      var _ref = (0, _asyncToGenerator.default)(function* (event) {
        if (_this._notifier == null) {
          return;
        }

        // Must inspect the buffer before awaiting on the notifier
        // to avoid race conditions
        const filePath = _this._buffer.getPath();

        if (!(filePath != null)) {
          throw new Error('Invariant violation: "filePath != null"');
        }

        const version = _this._buffer.changeCount;

        if (!(_this._notifier != null)) {
          throw new Error('Invariant violation: "this._notifier != null"');
        }

        const notifier = yield _this._notifier;
        if (_this._sentOpen) {
          _this.sendEvent({
            kind: 'edit',
            fileVersion: {
              notifier: notifier,
              filePath: filePath,
              version: version
            },
            oldRange: event.oldRange,
            newRange: event.newRange,
            oldText: event.oldText,
            newText: event.newText
          });
        } else {
          _this._sendOpenByNotifier(notifier);
        }
      });

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    })()));

    this._subscriptions = subscriptions;

    this._oldPath = this._buffer.getPath();
    this._notifier = this._notifiers.get(this._buffer);

    // This prevents the open message from sending when the file is initially empty.
    // Sadly there's no reliable 'is loaded' event from Atom.
    // TODO: Could watch onDidReload() which will catch the case where an empty file is opened
    // after startup, leaving the only failure the reopening of empty files at startup.
    if (this._buffer.getText() !== '' && this._notifier != null) {
      this._notifier.then(notifier => this._sendOpenByNotifier(notifier));
    }
  }

  _sendOpenByNotifier(notifier) {
    const filePath = this._buffer.getPath();

    if (!(filePath != null)) {
      throw new Error('Invariant violation: "filePath != null"');
    }

    const version = this._buffer.changeCount;

    this._sentOpen = true;
    this.sendEvent({
      kind: 'open',
      fileVersion: {
        notifier: notifier,
        filePath: filePath,
        version: version
      },
      contents: this._buffer.getText()
    });
  }

  sendEvent(event) {
    var _this2 = this;

    return (0, _asyncToGenerator.default)(function* () {
      if (!(event.kind !== 'sync')) {
        throw new Error('Invariant violation: "event.kind !== \'sync\'"');
      }

      try {
        yield event.fileVersion.notifier.onEvent(event);
        _this2.updateServerVersion(event.fileVersion.version);
      } catch (e) {
        logger.error(`Error sending file event: ${ eventToString(event) }`, e);

        if (event.fileVersion.filePath === _this2._buffer.getPath()) {
          logger.error('Attempting file resync');
          _this2.attemptResync();
        } else {
          logger.error('File renamed, so no resync attempted');
        }
      }
    })();
  }

  updateServerVersion(sentVersion) {
    this._serverVersion = Math.max(this._serverVersion, sentVersion);
    this._lastAttemptedSync = Math.max(this._lastAttemptedSync, sentVersion);
  }

  // Something went awry in our synchronization protocol
  // Attempt a reset with a 'sync' event.
  attemptResync() {
    var _this3 = this;

    // always attempt to resync to the latest version
    const resyncVersion = this._buffer.changeCount;
    const filePath = this._buffer.getPath();

    // don't send a resync if another edit has already succeeded at this version
    // or an attempt to sync at this version is already underway
    if (resyncVersion > this._lastAttemptedSync) {
      logger.error('At most recent edit, attempting file resync');
      this._lastAttemptedSync = resyncVersion;

      const sendResync = (() => {
        var _ref2 = (0, _asyncToGenerator.default)(function* () {
          if (_this3._notifier == null) {
            logger.error('Resync preempted by remote connection closed');
            return;
          }

          if (!(filePath != null)) {
            throw new Error('Invariant violation: "filePath != null"');
          }

          const notifier = yield _this3._notifier;
          if (_this3._buffer.isDestroyed()) {
            logger.error('Resync preempted by later event');
          } else if (filePath !== _this3._buffer.getPath()) {
            logger.error('Resync preempted by file rename');
          } else if (resyncVersion !== _this3._lastAttemptedSync) {
            logger.error('Resync preempted by later resync');
          } else if (resyncVersion !== _this3._buffer.changeCount) {
            logger.error('Resync preempted by later edit');
          } else {
            const syncEvent = {
              kind: 'sync',
              fileVersion: {
                notifier: notifier,
                filePath: filePath,
                version: resyncVersion
              },
              contents: _this3._buffer.getText()
            };
            try {
              yield notifier.onEvent(syncEvent);
              _this3.updateServerVersion(resyncVersion);

              logger.error(`Successful resync event: ${ eventToString(syncEvent) }`);
            } catch (syncError) {
              logger.error(`Error sending file sync event: ${ eventToString(syncEvent) }`, syncError);

              // continue trying until either the file is closed,
              // or a resync to a later edit is attempted
              // or the resync succeeds
              setTimeout(sendResync, RESYNC_TIMEOUT_MS);
            }
          }
        });

        return function sendResync() {
          return _ref2.apply(this, arguments);
        };
      })();

      sendResync();
    } else {
      logger.error('Resync aborted by more recent edit');
    }
  }

  sendClose() {
    // Use different retry policy for close messages.
    if (this._oldPath != null) {
      this._notifiers.sendClose(this._oldPath, this._buffer.changeCount);
    }
  }

  dispose() {
    this.sendClose();
    this._notifier = null;
    this._subscriptions.dispose();
  }
};


function eventToString(event) {
  const jsonable = _extends({}, event);
  jsonable.fileVersion = _extends({}, event.fileVersion);
  jsonable.fileVersion.notifier = null;
  return JSON.stringify(jsonable);
}