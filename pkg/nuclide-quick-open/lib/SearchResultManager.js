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
exports.__test__ = undefined;

var _asyncToGenerator = _interopRequireDefault(require('async-to-generator'));

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _nuclideAnalytics;

function _load_nuclideAnalytics() {
  return _nuclideAnalytics = require('../../nuclide-analytics');
}

var _nuclideLogging;

function _load_nuclideLogging() {
  return _nuclideLogging = require('../../nuclide-logging');
}

var _reactForAtom = require('react-for-atom');

var _atom = require('atom');

var _promise;

function _load_promise() {
  return _promise = require('../../commons-node/promise');
}

var _debounce;

function _load_debounce() {
  return _debounce = _interopRequireDefault(require('../../commons-node/debounce'));
}

var _QuickSelectionDispatcher;

function _load_QuickSelectionDispatcher() {
  return _QuickSelectionDispatcher = _interopRequireDefault(require('./QuickSelectionDispatcher'));
}

var _QuickSelectionDispatcher2;

function _load_QuickSelectionDispatcher2() {
  return _QuickSelectionDispatcher2 = require('./QuickSelectionDispatcher');
}

var _QuickSelectionActions;

function _load_QuickSelectionActions() {
  return _QuickSelectionActions = _interopRequireDefault(require('./QuickSelectionActions'));
}

var _FileResultComponent;

function _load_FileResultComponent() {
  return _FileResultComponent = _interopRequireDefault(require('./FileResultComponent'));
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _global = global;
const performance = _global.performance;


function getDefaultResult() {
  return {
    error: null,
    loading: false,
    results: []
  };
}

const AnalyticsEvents = Object.freeze({
  QUERY_SOURCE_PROVIDER: 'quickopen-query-source-provider'
});

const RESULTS_CHANGED = 'results_changed';
const PROVIDERS_CHANGED = 'providers_changed';
const MAX_OMNI_RESULTS_PER_SERVICE = 5;
const DEFAULT_QUERY_DEBOUNCE_DELAY = 200;
const LOADING_EVENT_DELAY = 200;
const OMNISEARCH_PROVIDER = {
  action: 'nuclide-quick-open:find-anything-via-omni-search',
  debounceDelay: DEFAULT_QUERY_DEBOUNCE_DELAY,
  name: 'OmniSearchResultProvider',
  prompt: 'Search for anything...',
  title: 'OmniSearch',
  priority: 0
};
// Number of elements in the cache before periodic cleanup kicks in. Includes partial query strings.
const MAX_CACHED_QUERIES = 100;
const CACHE_CLEAN_DEBOUNCE_DELAY = 5000;
const UPDATE_DIRECTORIES_DEBOUNCE_DELAY = 100;
const GLOBAL_KEY = 'global';
const DIRECTORY_KEY = 'directory';

function isValidProvider(provider) {
  return typeof provider.getProviderType === 'function' && typeof provider.getName === 'function' && typeof provider.getName() === 'string' && typeof provider.isRenderable === 'function' && typeof provider.executeQuery === 'function' && typeof provider.getTabTitle === 'function';
}

let searchResultManagerInstance = null;
/**
 * A singleton cache for search providers and results.
 */
let SearchResultManager = class SearchResultManager {
  // List of most recently used query strings, used for pruning the result cache.
  // Makes use of `Map`'s insertion ordering, so values are irrelevant and always set to `null`.
  static getInstance() {
    if (!searchResultManagerInstance) {
      searchResultManagerInstance = new SearchResultManager();
    }
    return searchResultManagerInstance;
  }
  // Cache the last query with results for each provider.
  // Display cached results for the last completed query until new data arrives.


  constructor() {
    this._isDisposed = false;
    this.RESULTS_CHANGED = RESULTS_CHANGED;
    this.PROVIDERS_CHANGED = PROVIDERS_CHANGED;
    this._registeredProviders = {};
    this._registeredProviders[DIRECTORY_KEY] = new Map();
    this._registeredProviders[GLOBAL_KEY] = new Map();
    this._providersByDirectory = new Map();
    this._directories = [];
    this._cachedResults = {};
    this._lastCachedQuery = new Map();
    this._debouncedCleanCache = (0, (_debounce || _load_debounce()).default)(() => this._cleanCache(), CACHE_CLEAN_DEBOUNCE_DELAY,
    /* immediate */false);
    // `updateDirectories` joins providers and directories, which don't know anything about each
    // other. Debounce this call to reduce churn at startup, and when new providers get activated or
    // a new directory gets mounted.
    this._debouncedUpdateDirectories = (0, (_debounce || _load_debounce()).default)(() => this._updateDirectories(), UPDATE_DIRECTORIES_DEBOUNCE_DELAY,
    /* immediate */false);
    this._queryLruQueue = new Map();
    this._emitter = new _atom.Emitter();
    this._subscriptions = new _atom.CompositeDisposable();
    this._dispatcher = (_QuickSelectionDispatcher || _load_QuickSelectionDispatcher()).default.getInstance();
    // Check is required for testing.
    if (atom.project) {
      this._subscriptions.add(atom.project.onDidChangePaths(this._debouncedUpdateDirectories.bind(this)));
      this._debouncedUpdateDirectories();
    }
    this._setUpFlux();
    this._activeProviderName = OMNISEARCH_PROVIDER.name;
  }

  _setUpFlux() {
    this._dispatcherToken = this._dispatcher.register(action => {
      switch (action.actionType) {
        case (_QuickSelectionDispatcher2 || _load_QuickSelectionDispatcher2()).ActionTypes.QUERY:
          this.executeQuery(action.query);
          break;
        case (_QuickSelectionDispatcher2 || _load_QuickSelectionDispatcher2()).ActionTypes.ACTIVE_PROVIDER_CHANGED:
          this._activeProviderName = action.providerName;
          this._emitter.emit(PROVIDERS_CHANGED);
          break;
      }
    });
  }

  getActiveProviderName() {
    return this._activeProviderName;
  }

  getRendererForProvider(providerName) {
    const provider = this._getProviderByName(providerName);
    if (!provider || !provider.getComponentForItem) {
      return (_FileResultComponent || _load_FileResultComponent()).default.getComponentForItem;
    }
    return provider.getComponentForItem;
  }

  dispose() {
    this._isDisposed = true;
    this._subscriptions.dispose();
  }

  /**
   * Renew the cached list of directories, as well as the cached map of eligible providers
   * for every directory.
   */
  _updateDirectories() {
    var _this = this;

    return (0, _asyncToGenerator.default)(function* () {
      const newDirectories = atom.project.getDirectories();
      const newProvidersByDirectories = new Map();
      const eligibilities = [];
      newDirectories.forEach(function (directory) {
        newProvidersByDirectories.set(directory, new Set());
        for (const provider of _this._registeredProviders[DIRECTORY_KEY].values()) {
          if (!(provider.isEligibleForDirectory != null)) {
            throw new Error(`Directory provider ${ provider.getName() } must provide \`isEligibleForDirectory()\`.`);
          }

          eligibilities.push(provider.isEligibleForDirectory(directory).then(function (isEligible) {
            return {
              isEligible: isEligible,
              provider: provider,
              directory: directory
            };
          }).catch(function (err) {
            (0, (_nuclideLogging || _load_nuclideLogging()).getLogger)().warn(`isEligibleForDirectory failed for directory provider ${ provider.getName() }`, err);
            return {
              isEligible: false,
              provider: provider,
              directory: directory
            };
          }));
        }
      });
      const resolvedEligibilities = yield Promise.all(eligibilities);
      for (const eligibility of resolvedEligibilities) {
        const provider = eligibility.provider;
        const isEligible = eligibility.isEligible;
        const directory = eligibility.directory;

        if (isEligible) {
          const providersForDirectory = newProvidersByDirectories.get(directory);

          if (!(providersForDirectory != null)) {
            throw new Error(`Providers for directory ${ directory.getPath() } not defined`);
          }

          providersForDirectory.add(provider);
        }
      }
      _this._directories = newDirectories;
      _this._providersByDirectory = newProvidersByDirectories;
      _this._emitter.emit(PROVIDERS_CHANGED);
    })();
  }

  on(name, value) {
    return this._emitter.on(name, value);
  }

  registerProvider(service) {
    if (!isValidProvider(service)) {
      const providerName = service.getName && service.getName() || '<unknown>';
      (0, (_nuclideLogging || _load_nuclideLogging()).getLogger)().error(`Quick-open provider ${ providerName } is not a valid provider`);
    }
    const isRenderableProvider = typeof service.isRenderable === 'function' && service.isRenderable();
    const isGlobalProvider = service.getProviderType() === 'GLOBAL';
    const targetRegistry = isGlobalProvider ? this._registeredProviders[GLOBAL_KEY] : this._registeredProviders[DIRECTORY_KEY];
    targetRegistry.set(service.getName(), service);
    if (!isGlobalProvider) {
      this._debouncedUpdateDirectories();
    }
    const disposable = new _atom.CompositeDisposable();
    disposable.add(new _atom.Disposable(() => {
      // This may be called after this package has been deactivated
      // and the SearchResultManager has been disposed.
      if (this._isDisposed) {
        return;
      }
      const serviceName = service.getName();
      targetRegistry.delete(serviceName);
      this._providersByDirectory.forEach((providers, dir) => {
        providers.delete(service);
      });
      // Reset the active provider to omnisearch if the disposed service is
      // the current active provider.
      if (serviceName === this._activeProviderName) {
        this._activeProviderName = OMNISEARCH_PROVIDER.name;
      }
      this._removeResultsForProvider(serviceName);
      this._emitter.emit(PROVIDERS_CHANGED);
    }));
    // If the provider is renderable and specifies a keybinding, wire it up with the toggle command.
    if (isRenderableProvider && typeof service.getAction === 'function') {
      const toggleAction = service.getAction();
      // TODO replace with computed property once Flow supports it.
      const actionSpec = {};
      actionSpec[toggleAction] = () => (_QuickSelectionActions || _load_QuickSelectionActions()).default.changeActiveProvider(service.getName());
      disposable.add(atom.commands.add('atom-workspace', actionSpec));
    }
    return disposable;
  }

  _removeResultsForProvider(providerName) {
    if (this._cachedResults[providerName]) {
      delete this._cachedResults[providerName];
      this._emitter.emit(RESULTS_CHANGED);
    }
    this._lastCachedQuery.delete(providerName);
  }

  setCacheResult(providerName, directory, query, result) {
    let loading = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
    let error = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : null;

    this.ensureCacheEntry(providerName, directory);
    this._cachedResults[providerName][directory][query] = {
      result: result,
      loading: loading,
      error: error
    };
    this._lastCachedQuery.set(providerName, query);
    // Refresh the usage for the current query.
    this._queryLruQueue.delete(query);
    this._queryLruQueue.set(query, null);
    setImmediate(this._debouncedCleanCache);
  }

  ensureCacheEntry(providerName, directory) {
    if (!this._cachedResults[providerName]) {
      this._cachedResults[providerName] = {};
    }
    if (!this._cachedResults[providerName][directory]) {
      this._cachedResults[providerName][directory] = {};
    }
  }

  cacheResult(query, result, directory, provider) {
    const providerName = provider.getName();
    this.setCacheResult(providerName, directory, query, result, false, null);
  }

  _setLoading(query, directory, provider) {
    const providerName = provider.getName();
    this.ensureCacheEntry(providerName, directory);
    const previousResult = this._cachedResults[providerName][directory][query];
    if (!previousResult) {
      this._cachedResults[providerName][directory][query] = {
        result: [],
        error: null,
        loading: true
      };
    }
  }

  /**
   * Release the oldest cached results once the cache is full.
   */
  _cleanCache() {
    const queueSize = this._queryLruQueue.size;
    if (queueSize <= MAX_CACHED_QUERIES) {
      return;
    }
    // Figure out least recently used queries, and pop them off of the `_queryLruQueue` Map.
    const expiredQueries = [];
    const keyIterator = this._queryLruQueue.keys();
    const entriesToRemove = queueSize - MAX_CACHED_QUERIES;
    for (let i = 0; i < entriesToRemove; i++) {
      const firstEntryKey = keyIterator.next().value;
      expiredQueries.push(firstEntryKey);

      if (!(firstEntryKey != null)) {
        throw new Error('Invariant violation: "firstEntryKey != null"');
      }

      this._queryLruQueue.delete(firstEntryKey);
    }

    // For each (provider|directory) pair, remove results for all expired queries from the cache.
    for (const providerName in this._cachedResults) {
      for (const directory in this._cachedResults[providerName]) {
        const queryResults = this._cachedResults[providerName][directory];
        expiredQueries.forEach(query => delete queryResults[query]);
      }
    }
    this._emitter.emit(RESULTS_CHANGED);
  }

  processResult(query, result, directory, provider) {
    this.cacheResult(...arguments);
    this._emitter.emit(RESULTS_CHANGED);
  }

  sanitizeQuery(query) {
    return query.trim();
  }

  executeQuery(rawQuery) {
    const query = this.sanitizeQuery(rawQuery);
    for (const globalProvider of this._registeredProviders[GLOBAL_KEY].values()) {
      const startTime = performance.now();
      const loadingFn = () => {
        this._setLoading(query, GLOBAL_KEY, globalProvider);
        this._emitter.emit(RESULTS_CHANGED);
      };
      (0, (_promise || _load_promise()).triggerAfterWait)(globalProvider.executeQuery(query), LOADING_EVENT_DELAY, loadingFn).then(result => {
        (0, (_nuclideAnalytics || _load_nuclideAnalytics()).track)(AnalyticsEvents.QUERY_SOURCE_PROVIDER, {
          'quickopen-source-provider': globalProvider.getName(),
          'quickopen-query-duration': (performance.now() - startTime).toString(),
          'quickopen-result-count': result.length.toString()
        });
        this.processResult(query, result, GLOBAL_KEY, globalProvider);
      });
    }
    if (this._providersByDirectory.size === 0) {
      return;
    }
    this._directories.forEach(directory => {
      const path = directory.getPath();
      const providers = this._providersByDirectory.get(directory);
      if (!providers) {
        // Special directories like "atom://about"
        return;
      }
      for (const directoryProvider of providers) {
        const startTime = performance.now();
        const loadingFn = () => {
          this._setLoading(query, path, directoryProvider);
          this._emitter.emit(RESULTS_CHANGED);
        };
        (0, (_promise || _load_promise()).triggerAfterWait)(directoryProvider.executeQuery(query, directory), LOADING_EVENT_DELAY, loadingFn).then(result => {
          (0, (_nuclideAnalytics || _load_nuclideAnalytics()).track)(AnalyticsEvents.QUERY_SOURCE_PROVIDER, {
            'quickopen-source-provider': directoryProvider.getName(),
            'quickopen-query-duration': (performance.now() - startTime).toString(),
            'quickopen-result-count': result.length.toString()
          });
          this.processResult(query, result, path, directoryProvider);
        });
      }
    });
  }

  _isGlobalProvider(providerName) {
    return this._registeredProviders[GLOBAL_KEY].has(providerName);
  }

  _getProviderByName(providerName) {
    let dirProviderName;
    if (this._isGlobalProvider(providerName)) {
      dirProviderName = this._registeredProviders[GLOBAL_KEY].get(providerName);
    } else {
      dirProviderName = this._registeredProviders[DIRECTORY_KEY].get(providerName);
    }

    if (!(dirProviderName != null)) {
      throw new Error(`Provider ${ providerName } is not registered with quick-open.`);
    }

    return dirProviderName;
  }

  _getResultsForProvider(query, providerName) {
    const providerPaths = this._isGlobalProvider(providerName) ? [GLOBAL_KEY] : this._directories.map(d => d.getPath());
    const provider = this._getProviderByName(providerName);
    const lastCachedQuery = this._lastCachedQuery.get(providerName);
    return {
      title: provider.getTabTitle(),
      results: providerPaths.reduce((results, path) => {
        let cachedPaths;
        let cachedQueries;
        let cachedResult;
        if (!((cachedPaths = this._cachedResults[providerName]) && (cachedQueries = cachedPaths[path]) && ((cachedResult = cachedQueries[query]) ||
        // If the current query hasn't returned anything yet, try the last cached result.
        lastCachedQuery != null && (cachedResult = cachedQueries[lastCachedQuery])))) {
          cachedResult = {};
        }
        const defaultResult = getDefaultResult();
        const resultList = cachedResult.result || defaultResult.results;
        results[path] = {
          results: resultList.map(result => _extends({}, result, { sourceProvider: providerName })),
          loading: cachedResult.loading || defaultResult.loading,
          error: cachedResult.error || defaultResult.error
        };
        return results;
      }, {})
    };
  }

  getResults(query, activeProviderName) {
    const sanitizedQuery = this.sanitizeQuery(query);
    if (activeProviderName === OMNISEARCH_PROVIDER.name) {
      const omniSearchResults = [{}];
      for (const providerName in this._cachedResults) {
        const resultForProvider = this._getResultsForProvider(sanitizedQuery, providerName);
        // TODO replace this with a ranking algorithm.
        for (const dir in resultForProvider.results) {
          resultForProvider.results[dir].results = resultForProvider.results[dir].results.slice(0, MAX_OMNI_RESULTS_PER_SERVICE);
        }
        // TODO replace `partial` with computed property whenever Flow supports it.
        const partial = {};
        partial[providerName] = resultForProvider;
        omniSearchResults.push(partial);
      }
      return Object.assign.apply(null, omniSearchResults);
    }
    // TODO replace `partial` with computed property whenever Flow supports it.
    const partial = {};
    partial[activeProviderName] = this._getResultsForProvider(sanitizedQuery, activeProviderName);
    return partial;
  }

  getProviderByName(providerName) {
    if (providerName === OMNISEARCH_PROVIDER.name) {
      return _extends({}, OMNISEARCH_PROVIDER);
    }
    return this._bakeProvider(this._getProviderByName(providerName));
  }

  /**
   * Turn a Provider into a plain "spec" object consumed by QuickSelectionComponent.
   */
  _bakeProvider(provider) {
    const providerName = provider.getName();
    const providerSpec = {
      action: provider.getAction && provider.getAction() || '',
      debounceDelay: typeof provider.getDebounceDelay === 'function' ? provider.getDebounceDelay() : DEFAULT_QUERY_DEBOUNCE_DELAY,
      name: providerName,
      prompt: provider.getPromptText && provider.getPromptText() || 'Search ' + providerName,
      title: provider.getTabTitle && provider.getTabTitle() || providerName
    };
    // $FlowIssue priority property is optional
    providerSpec.priority = typeof provider.getPriority === 'function' ? provider.getPriority() : Number.POSITIVE_INFINITY;
    return providerSpec;
  }

  getRenderableProviders() {
    // Only render tabs for providers that are eligible for at least one directory.
    const eligibleDirectoryProviders = Array.from(this._registeredProviders[DIRECTORY_KEY].values()).filter(provider => {
      for (const providers of this._providersByDirectory.values()) {
        if (providers.has(provider)) {
          return true;
        }
      }
      return false;
    });
    const tabs = Array.from(this._registeredProviders[GLOBAL_KEY].values()).concat(eligibleDirectoryProviders).filter(provider => provider.isRenderable()).map(this._bakeProvider).sort((p1, p2) => p1.name.localeCompare(p2.name));
    tabs.unshift(OMNISEARCH_PROVIDER);
    return tabs;
  }

};
exports.default = SearchResultManager;
const __test__ = exports.__test__ = {
  _getOmniSearchProviderSpec: function () {
    return OMNISEARCH_PROVIDER;
  }
};