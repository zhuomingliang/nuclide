'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import typeof * as RemoteCommandServiceType
  from '../../nuclide-remote-atom-server/lib/RemoteCommandService';
import type {AtomCommands} from '../../nuclide-remote-atom-server/lib/rpc-types';
import type {NuclideUri} from '../../commons-node/nuclideUri';

import {ServerConnection} from '../../nuclide-remote-connection';
import {goToLocation} from '../../commons-atom/go-to-location';

import createPackage from '../../commons-atom/createPackage';
import {CompositeDisposable} from 'atom';
import {getlocalService} from '../../nuclide-remote-connection';

class Activation {
  _disposables: CompositeDisposable;
  _commands: AtomCommands;

  constructor() {
    this._commands = {
      async openFile(filePath: NuclideUri, line: number, column: number): Promise<void> {
        goToLocation(filePath, line, column);
      },
      dispose(): void {
      },
    };

    this._disposables = new CompositeDisposable();
    this._initialize();
  }

  async _initialize(): Promise<void> {
    const addConnection = async connection => {
      const service: RemoteCommandServiceType = connection.getService('RemoteCommandService');
      const remoteCommands = await service.RemoteCommandService.registerAtomCommands(
        connection.getPort(), this._commands);
      this._disposables.add(remoteCommands);
      const onClose = closingConnection => {
        if (closingConnection === connection) {
          closeSubscription.dispose();
          this._disposables.remove(closeSubscription);
        }
      };

      const closeSubscription = ServerConnection.onDidCloseServerConnection(onClose);
      this._disposables.add(closeSubscription);
    };

    // Add local service
    const service: RemoteCommandServiceType = getlocalService('RemoteCommandService');
    const remoteCommands = await service.RemoteCommandService.registerAtomCommands(
      0, this._commands);
    this._disposables.add(remoteCommands);

    this._disposables.add(ServerConnection.observeConnections(addConnection));
  }

  dispose(): void {
    this._disposables.dispose();
  }

}

export default createPackage(Activation);
