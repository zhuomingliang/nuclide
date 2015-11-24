'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

const ConnectionState = require('../ConnectionState');
const {
  notifyLocalDiskFile,
  notifyConnectedRemoteFile,
  notifyDisconnectedRemoteFile,
} = require('../notification');
const React = require('react-for-atom');
const {PropTypes} = React;

const StatusBarTile = React.createClass({
  propTypes: {
    connectionState: PropTypes.number.isRequired,
    fileUri: PropTypes.string,
  },

  render(): ?ReactElement {
    let iconName = null;
    switch (this.props.connectionState) {
      case ConnectionState.NONE:
        break;
      case ConnectionState.LOCAL:
        iconName = 'device-desktop';
        break;
      case ConnectionState.CONNECTED:
        iconName = 'cloud-upload';
        break;
      case ConnectionState.DISCONNECTED:
        iconName = 'alert';
        break;
    }
    // When the active pane isn't a text editor, e.g. diff view, preferences, ..etc.,
    // We don't show a connection status bar.
    if (!iconName) {
      return null;
    }
    return (
      <span
        className={`icon icon-${iconName} nuclide-remote-projects-status-icon`}
        onClick={this.onStatusBarTileClicked}
      />
    );
  },

  onStatusBarTileClicked(): void {
    switch (this.props.connectionState) {
      case ConnectionState.LOCAL:
        notifyLocalDiskFile(this.props.fileUri);
        break;
      case ConnectionState.CONNECTED:
        notifyConnectedRemoteFile(this.props.fileUri);
        break;
      case ConnectionState.DISCONNECTED:
        notifyDisconnectedRemoteFile(this.props.fileUri);
        break;
    }
  },
});

module.exports = StatusBarTile;
