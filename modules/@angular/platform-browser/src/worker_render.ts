/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {BaseException, ExceptionHandler, Injectable, Injector, NgZone, OpaqueToken, PLATFORM_INITIALIZER, PlatformRef, Provider, RootRenderer, Testability, createPlatformFactory, isDevMode, platformCore} from '@angular/core';

import {wtfInit} from '../core_private';

import {BROWSER_SANITIZATION_PROVIDERS} from './browser';
import {BrowserDomAdapter} from './browser/browser_adapter';
import {BrowserGetTestability} from './browser/testability';
import {AnimationDriver} from './dom/animation_driver';
import {getDOM} from './dom/dom_adapter';
import {DomRootRenderer, DomRootRenderer_} from './dom/dom_renderer';
import {DOCUMENT} from './dom/dom_tokens';
import {DomEventsPlugin} from './dom/events/dom_events';
import {EVENT_MANAGER_PLUGINS, EventManager} from './dom/events/event_manager';
import {HAMMER_GESTURE_CONFIG, HammerGestureConfig, HammerGesturesPlugin} from './dom/events/hammer_gestures';
import {KeyEventsPlugin} from './dom/events/key_events';
import {DomSharedStylesHost, SharedStylesHost} from './dom/shared_styles_host';
import {ON_WEB_WORKER} from './web_workers/shared/api';
import {ClientMessageBrokerFactory, ClientMessageBrokerFactory_} from './web_workers/shared/client_message_broker';
import {MessageBus} from './web_workers/shared/message_bus';
import {PostMessageBus, PostMessageBusSink, PostMessageBusSource} from './web_workers/shared/post_message_bus';
import {RenderStore} from './web_workers/shared/render_store';
import {Serializer} from './web_workers/shared/serializer';
import {ServiceMessageBrokerFactory, ServiceMessageBrokerFactory_} from './web_workers/shared/service_message_broker';
import {MessageBasedRenderer} from './web_workers/ui/renderer';



/**
 * Wrapper class that exposes the Worker
 * and underlying {@link MessageBus} for lower level message passing.
 *
 * @experimental WebWorker support is currently experimental.
 */
@Injectable()
export class WebWorkerInstance {
  public worker: Worker;
  public bus: MessageBus;

  /** @internal */
  public init(worker: Worker, bus: MessageBus) {
    this.worker = worker;
    this.bus = bus;
  }
}

/**
 * @experimental WebWorker support is currently experimental.
 */
export const WORKER_SCRIPT: OpaqueToken = new OpaqueToken('WebWorkerScript');

/**
 * A multiple providers used to automatically call the `start()` method after the service is
 * created.
 *
 * TODO(vicb): create an interface for startable services to implement
 * @experimental WebWorker support is currently experimental.
 */
export const WORKER_UI_STARTABLE_MESSAGING_SERVICE =
    new OpaqueToken('WorkerRenderStartableMsgService');

/**
 * @experimental WebWorker support is currently experimental.
 */
export const _WORKER_UI_PLATFORM_PROVIDERS: Provider[] = [
  {provide: NgZone, useFactory: createNgZone, deps: []},
  MessageBasedRenderer,
  {provide: WORKER_UI_STARTABLE_MESSAGING_SERVICE, useExisting: MessageBasedRenderer, multi: true},
  BROWSER_SANITIZATION_PROVIDERS,
  {provide: ExceptionHandler, useFactory: _exceptionHandler, deps: []},
  {provide: DOCUMENT, useFactory: _document, deps: []},
  // TODO(jteplitz602): Investigate if we definitely need EVENT_MANAGER on the render thread
  // #5298
  {provide: EVENT_MANAGER_PLUGINS, useClass: DomEventsPlugin, multi: true},
  {provide: EVENT_MANAGER_PLUGINS, useClass: KeyEventsPlugin, multi: true},
  {provide: EVENT_MANAGER_PLUGINS, useClass: HammerGesturesPlugin, multi: true},
  {provide: HAMMER_GESTURE_CONFIG, useClass: HammerGestureConfig},
  {provide: DomRootRenderer, useClass: DomRootRenderer_},
  {provide: RootRenderer, useExisting: DomRootRenderer},
  {provide: SharedStylesHost, useExisting: DomSharedStylesHost},
  {provide: ServiceMessageBrokerFactory, useClass: ServiceMessageBrokerFactory_},
  {provide: ClientMessageBrokerFactory, useClass: ClientMessageBrokerFactory_},
  {provide: AnimationDriver, useFactory: _resolveDefaultAnimationDriver, deps: []},
  Serializer,
  {provide: ON_WEB_WORKER, useValue: false},
  RenderStore,
  DomSharedStylesHost,
  Testability,
  EventManager,
  WebWorkerInstance,
  {
    provide: PLATFORM_INITIALIZER,
    useFactory: initWebWorkerRenderPlatform,
    multi: true,
    deps: [Injector]
  },
  {provide: MessageBus, useFactory: messageBusFactory, deps: [WebWorkerInstance]}
];

function initializeGenericWorkerRenderer(injector: Injector) {
  var bus = injector.get(MessageBus);
  let zone = injector.get(NgZone);
  bus.attachToZone(zone);

  // initialize message services after the bus has been created
  let services = injector.get(WORKER_UI_STARTABLE_MESSAGING_SERVICE);
  zone.runGuarded(() => { services.forEach((svc: any) => { svc.start(); }); });
}

function messageBusFactory(instance: WebWorkerInstance): MessageBus {
  return instance.bus;
}

function initWebWorkerRenderPlatform(injector: Injector): () => void {
  return () => {
    BrowserDomAdapter.makeCurrent();
    wtfInit();
    BrowserGetTestability.init();
    var scriptUri: string;
    try {
      scriptUri = injector.get(WORKER_SCRIPT);
    } catch (e) {
      throw new BaseException(
          'You must provide your WebWorker\'s initialization script with the WORKER_SCRIPT token');
    }

    let instance = injector.get(WebWorkerInstance);
    spawnWebWorker(scriptUri, instance);

    initializeGenericWorkerRenderer(injector);
  };
}

/**
 * @experimental WebWorker support is currently experimental.
 */
export const platformWorkerUi =
    createPlatformFactory(platformCore, 'workerUi', _WORKER_UI_PLATFORM_PROVIDERS);

function _exceptionHandler(): ExceptionHandler {
  return new ExceptionHandler(getDOM());
}

function _document(): any {
  return getDOM().defaultDoc();
}

function createNgZone(): NgZone {
  return new NgZone({enableLongStackTrace: isDevMode()});
}

/**
 * Spawns a new class and initializes the WebWorkerInstance
 */
function spawnWebWorker(uri: string, instance: WebWorkerInstance): void {
  var webWorker: Worker = new Worker(uri);
  var sink = new PostMessageBusSink(webWorker);
  var source = new PostMessageBusSource(webWorker);
  var bus = new PostMessageBus(sink, source);

  instance.init(webWorker, bus);
}

function _resolveDefaultAnimationDriver(): AnimationDriver {
  // web workers have not been tested or configured to
  // work with animations just yet...
  return AnimationDriver.NOOP;
}
