'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

const {Disposable} = require('event-kit');
const {getRemoteEventName} = require('./service-manager');
const {serializeArgs} = require('./utils');
const {EventEmitter} = require('events');
const NuclideSocket = require('./NuclideSocket');
const {SERVICE_FRAMEWORK_EVENT_CHANNEL,
  SERVICE_FRAMEWORK_RPC_CHANNEL,
  SERVICE_FRAMEWORK_RPC_TIMEOUT_MS,
  SERVICE_FRAMEWORK3_CHANNEL} = require('./config');
const logger = require('nuclide-logging').getLogger();
import invariant from 'assert';

import {object} from 'nuclide-commons';
import ServiceFramework from './serviceframework';

export type NuclideRemoteEventbusOptions = {
  certificateAuthorityCertificate?: Buffer;
  clientCertificate?: Buffer;
  clientKey?: Buffer;
};

class NuclideRemoteEventbus {
  socket: ?NuclideSocket;

  _rpcRequestId: number;
  serviceFrameworkEventEmitter: EventEmitter;
  _serviceFrameworkRpcEmitter: EventEmitter;
  _serviceFramework3Emitter: EventEmitter;

  _clientComponent: ServiceFramework.ClientComponent;

  constructor(serverUri: string, options: ?NuclideRemoteEventbusOptions = {}) {
    this.socket = new NuclideSocket(serverUri, options);
    this.socket.on('message', (message) => this._handleSocketMessage(message));
    this.serviceFrameworkEventEmitter = new EventEmitter();
    this._rpcRequestId = 1;
    this._serviceFrameworkRpcEmitter = new EventEmitter();
    this._serviceFramework3Emitter = new EventEmitter();

    this._clientComponent = new ServiceFramework.ClientComponent(this._serviceFramework3Emitter,
      this.socket, () => this._rpcRequestId++);
  }

  // Resolves if the connection looks healthy.
  // Will reject quickly if the connection looks unhealthy.
  testConnection(): Promise<void> {
    // Don't call this after socket is closed.
    invariant(this.socket != null);
    return this.socket.testConnection();
  }

  _handleSocketMessage(message: any) {
    const {channel, event} = message;

    if (channel === SERVICE_FRAMEWORK_RPC_CHANNEL) {
      var {requestId, error, result} = message;
      this._serviceFrameworkRpcEmitter.emit(requestId.toString(), error, result);
      return;
    }

    if (channel === SERVICE_FRAMEWORK_EVENT_CHANNEL) {
      this.serviceFrameworkEventEmitter.emit.apply(this.serviceFrameworkEventEmitter,
          [event.name].concat(event.args));
      return;
    }

    if (channel === SERVICE_FRAMEWORK3_CHANNEL) {
      var {requestId, hadError, error, result} = message;
      this._serviceFramework3Emitter.emit(requestId.toString(), hadError, error, result);
      return;
    }
  }

  _subscribeEventOnServer(serviceName: string, methodName: string, serviceOptions: any): Promise<any> {
    return this.callServiceFrameworkMethod(
      'serviceFramework',
      'subscribeEvent',
      /*methodArgs*/ [this.socket.id, serviceName, methodName],
      serviceOptions
   );
  }

  _unsubscribeEventFromServer(serviceName: string, methodName: string, serviceOptions: any): Promise<any> {
    return this.callServiceFrameworkMethod(
      'serviceFramework',
      'unsubscribeEvent',
      /*methodArgs*/ [this.socket.id, serviceName, methodName],
      serviceOptions
   );
  }

  registerEventListener(
    localEventName: string,
    callback: (...args: Array<any>) => void,
    serviceOptions: any
  ): Disposable {
    const [serviceName, eventMethodName] = localEventName.split('/');
    const remoteEventName = getRemoteEventName(serviceName, eventMethodName, serviceOptions);
    this.serviceFrameworkEventEmitter.on(remoteEventName, callback);
    const subscribePromise = this._subscribeEventOnServer(serviceName, eventMethodName, serviceOptions);
    return new Disposable(() => {
      this.serviceFrameworkEventEmitter.removeListener(remoteEventName, callback);
      return subscribePromise.then(
          () => this._unsubscribeEventFromServer(serviceName, eventMethodName, serviceOptions));
    });
  }

  async callMethod(
      serviceName: string,
      methodName: string,
      methodArgs: ?Array<any>,
      extraOptions: ?any
    ): Promise<any> {
    if (!this.socket) {
      logger.error('RemoteEventBus closed - callMethod:', serviceName, methodName);
      // Error condition that should never happen, return `undefined`.
      return;
    }
    const {args, argTypes} = serializeArgs(methodArgs || []);
    try {
      return await this.socket.xhrRequest(object.assign({
        uri: serviceName + '/' + methodName,
        qs: {
          args,
          argTypes,
        },
        method: 'GET', // default request method is 'GET'.
      }, extraOptions || {}));
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }

  async callServiceFrameworkMethod(
      serviceName: string,
      methodName: string,
      methodArgs: Array<any>,
      serviceOptions: any,
      timeout: number =SERVICE_FRAMEWORK_RPC_TIMEOUT_MS
    ): Promise<any> {

    const requestId = this._rpcRequestId ++;

    this.socket.send({
      serviceName,
      methodName,
      methodArgs,
      serviceOptions,
      requestId,
    });

    return new Promise((resolve, reject) => {
      this._serviceFrameworkRpcEmitter.once(requestId.toString(), (error, result) => {
        error ? reject(error) : resolve(result);
      });

      setTimeout(() => {
        this._serviceFrameworkRpcEmitter.removeAllListeners(requestId.toString());
        reject(`Timeout after ${timeout} for ${serviceName}/${methodName}`);
      }, timeout);
    });
  }

  // Delegate RPC functions to ServiceFramework.ClientComponent
  callRemoteFunction(...args: Array<any>): any {
    return this._clientComponent.callRemoteFunction.apply(this._clientComponent, args);
  }
  createRemoteObject(...args: Array<any>): Promise<number> {
    return this._clientComponent.createRemoteObject.apply(this._clientComponent, args);
  }
  callRemoteMethod(...args: Array<any>): any {
    return this._clientComponent.callRemoteMethod.apply(this._clientComponent, args);
  }
  disposeRemoteObject(...args: Array<any>): Promise<void> {
    return this._clientComponent.disposeRemoteObject.apply(this._clientComponent, args);
  }

  // Delegate marshalling to the ServiceFramework.ClientComponent class.
  marshal(...args): any {
    return this._clientComponent.marshal(...args);
  }
  unmarshal(...args): any {
    return this._clientComponent.unmarshal(...args);
  }
  registerType(...args): void {
    return this._clientComponent.registerType(...args);
  }

  close(): void {
    this.socket.close();
    this.socket = null;
  }
}

module.exports = NuclideRemoteEventbus;
