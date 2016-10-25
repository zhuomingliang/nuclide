'use strict';
'use babel';

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

// TODO @jxg export debugger typedefs from main module. (t11406963)

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LazyNestedValueComponent = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _reactForAtom = require('react-for-atom');

var _bindObservableAsProps;

function _load_bindObservableAsProps() {
  return _bindObservableAsProps = require('./bindObservableAsProps');
}

var _highlightOnUpdate;

function _load_highlightOnUpdate() {
  return _highlightOnUpdate = require('./highlightOnUpdate');
}

var _ValueComponentClassNames;

function _load_ValueComponentClassNames() {
  return _ValueComponentClassNames = require('./ValueComponentClassNames');
}

var _Tree;

function _load_Tree() {
  return _Tree = require('./Tree');
}

var _LoadingSpinner;

function _load_LoadingSpinner() {
  return _LoadingSpinner = require('./LoadingSpinner');
}

const SPINNER_DELAY = 100; /* ms */
const NOT_AVAILABLE_MESSAGE = '<not available>';

function isObjectValue(result) {
  return result.objectId != null;
}

function TreeItemWithLoadingSpinner() {
  return _reactForAtom.React.createElement(
    (_Tree || _load_Tree()).TreeItem,
    null,
    _reactForAtom.React.createElement((_LoadingSpinner || _load_LoadingSpinner()).LoadingSpinner, { size: 'EXTRA_SMALL', delay: SPINNER_DELAY })
  );
}

/**
 * A wrapper that renders a (delayed) spinner while the list of child properties is being loaded.
 * Otherwise, it renders ValueComponent for each property in `children`.
 */
const LoadableValueComponent = props => {
  const children = props.children;
  const fetchChildren = props.fetchChildren;
  const path = props.path;
  const expandedValuePaths = props.expandedValuePaths;
  const onExpandedStateChange = props.onExpandedStateChange;
  const simpleValueComponent = props.simpleValueComponent;
  const shouldCacheChildren = props.shouldCacheChildren;
  const getCachedChildren = props.getCachedChildren;
  const setCachedChildren = props.setCachedChildren;

  if (children == null) {
    return TreeItemWithLoadingSpinner();
  }
  if (shouldCacheChildren) {
    setCachedChildren(path, children);
  }
  return _reactForAtom.React.createElement(
    'span',
    null,
    children.map(child => _reactForAtom.React.createElement(
      (_Tree || _load_Tree()).TreeItem,
      { key: child.name },
      _reactForAtom.React.createElement(ValueComponent, {
        evaluationResult: child.value,
        fetchChildren: fetchChildren,
        expression: child.name,
        expandedValuePaths: expandedValuePaths,
        onExpandedStateChange: onExpandedStateChange,
        path: path + '.' + child.name,
        simpleValueComponent: simpleValueComponent,
        shouldCacheChildren: shouldCacheChildren,
        getCachedChildren: getCachedChildren,
        setCachedChildren: setCachedChildren
      })
    ))
  );
};

// TODO allow passing action components (edit button, pin button) here
function renderValueLine(expression, value) {
  if (expression == null) {
    return _reactForAtom.React.createElement(
      'div',
      { className: 'nuclide-ui-lazy-nested-value-container' },
      value
    );
  } else {
    // TODO @jxg use a text editor to apply proper syntax highlighting for expressions (t11408154)
    return _reactForAtom.React.createElement(
      'div',
      { className: 'nuclide-ui-lazy-nested-value-container' },
      _reactForAtom.React.createElement(
        'span',
        { className: (_ValueComponentClassNames || _load_ValueComponentClassNames()).ValueComponentClassNames.identifier },
        expression
      ),
      ': ',
      value
    );
  }
}

/**
 * A component that knows how to render recursive, interactive expression/evaluationResult pairs.
 * The rendering of non-expandable "leaf" values is delegated to the SimpleValueComponent.
 */
let ValueComponent = class ValueComponent extends _reactForAtom.React.Component {

  constructor(props) {
    super(props);
    this.state = {
      isExpanded: false,
      children: null
    };
    this._toggleExpand = this._toggleExpand.bind(this);
  }

  componentDidMount() {
    var _props = this.props;
    const path = _props.path;
    const expandedValuePaths = _props.expandedValuePaths;
    const fetchChildren = _props.fetchChildren;
    const evaluationResult = _props.evaluationResult;

    const nodeData = expandedValuePaths.get(path);
    if (!this.state.isExpanded && nodeData != null && nodeData.isExpanded && this._shouldFetch() && evaluationResult != null && evaluationResult.objectId != null && fetchChildren != null) {
      if (!(evaluationResult.objectId != null)) {
        throw new Error('Invariant violation: "evaluationResult.objectId != null"');
      }

      this.setState({
        children: fetchChildren(evaluationResult.objectId),
        isExpanded: true
      });
    }
  }

  componentWillReceiveProps(nextProps) {
    if (this._shouldFetch() && this.state.isExpanded && nextProps.evaluationResult != null && nextProps.fetchChildren != null) {
      const objectId = nextProps.evaluationResult.objectId;

      if (objectId == null) {
        return;
      }
      this.setState({
        children: nextProps.fetchChildren(objectId)
      });
    }
  }

  _shouldFetch() {
    var _props2 = this.props;
    const shouldCacheChildren = _props2.shouldCacheChildren;
    const getCachedChildren = _props2.getCachedChildren;
    const path = _props2.path;

    const children = getCachedChildren(path);
    return !shouldCacheChildren || children == null;
  }

  _toggleExpand(event) {
    var _props3 = this.props;
    const fetchChildren = _props3.fetchChildren;
    const evaluationResult = _props3.evaluationResult;
    const onExpandedStateChange = _props3.onExpandedStateChange;
    const path = _props3.path;

    const newState = {
      children: null,
      isExpanded: !this.state.isExpanded
    };
    if (!this.state.isExpanded) {
      if (this._shouldFetch() && typeof fetchChildren === 'function' && evaluationResult != null && evaluationResult.objectId != null) {
        newState.children = fetchChildren(evaluationResult.objectId);
      }
    }
    onExpandedStateChange(path, newState.isExpanded);
    this.setState(newState);
    event.stopPropagation();
  }

  render() {
    var _props4 = this.props;
    const evaluationResult = _props4.evaluationResult;
    const expression = _props4.expression;
    const fetchChildren = _props4.fetchChildren;
    const isRoot = _props4.isRoot;
    const path = _props4.path;
    const expandedValuePaths = _props4.expandedValuePaths;
    const onExpandedStateChange = _props4.onExpandedStateChange;
    const shouldCacheChildren = _props4.shouldCacheChildren;
    const getCachedChildren = _props4.getCachedChildren;
    const setCachedChildren = _props4.setCachedChildren;
    const SimpleValueComponent = _props4.simpleValueComponent;

    if (evaluationResult == null) {
      return renderValueLine(expression, NOT_AVAILABLE_MESSAGE);
    }
    if (!isObjectValue(evaluationResult)) {
      const simpleValueElement = _reactForAtom.React.createElement(SimpleValueComponent, {
        expression: expression,
        evaluationResult: evaluationResult,
        simpleValueComponent: SimpleValueComponent
      });
      return isRoot ? simpleValueElement : _reactForAtom.React.createElement(
        (_Tree || _load_Tree()).TreeItem,
        null,
        simpleValueElement
      );
    }
    const description = evaluationResult.description || '<no description provided>';
    var _state = this.state;
    const children = _state.children;
    const isExpanded = _state.isExpanded;

    let childListElement = null;
    if (isExpanded) {
      const cachedChildren = getCachedChildren(path);
      if (shouldCacheChildren && cachedChildren != null) {
        childListElement = _reactForAtom.React.createElement(LoadableValueComponent, {
          children: cachedChildren,
          fetchChildren: fetchChildren,
          path: path,
          expandedValuePaths: expandedValuePaths,
          onExpandedStateChange: onExpandedStateChange,
          simpleValueComponent: SimpleValueComponent,
          shouldCacheChildren: shouldCacheChildren,
          getCachedChildren: getCachedChildren,
          setCachedChildren: setCachedChildren
        });
      } else if (children == null) {
        childListElement = _reactForAtom.React.createElement(TreeItemWithLoadingSpinner, null);
      } else {
        const ChildrenComponent = (0, (_bindObservableAsProps || _load_bindObservableAsProps()).bindObservableAsProps)(children.map(childrenValue => ({ children: childrenValue })).startWith({ children: null }), LoadableValueComponent);
        childListElement = _reactForAtom.React.createElement(ChildrenComponent, {
          fetchChildren: fetchChildren,
          path: path,
          expandedValuePaths: expandedValuePaths,
          onExpandedStateChange: onExpandedStateChange,
          simpleValueComponent: SimpleValueComponent,
          shouldCacheChildren: shouldCacheChildren,
          getCachedChildren: getCachedChildren,
          setCachedChildren: setCachedChildren
        });
      }
    }
    const title = renderValueLine(expression, description);
    return _reactForAtom.React.createElement(
      (_Tree || _load_Tree()).TreeList,
      { showArrows: true, className: 'nuclide-ui-lazy-nested-value-treelist' },
      _reactForAtom.React.createElement(
        (_Tree || _load_Tree()).NestedTreeItem,
        {
          collapsed: !this.state.isExpanded,
          onClick: this._toggleExpand,
          title: title },
        childListElement
      )
    );
  }
};


/**
 * TopLevelValueComponent wraps all expandable value components. It is in charge of keeping track
 * of the set of recursively expanded values. The set is keyed by a "path", which is a string
 * containing the concatenated object keys of all recursive parent object for a given item. This
 * is necessary to preserve the expansion state while the values are temporarily unavailable, such
 * as after stepping in the debugger, which triggers a recursive re-fetch.
 */
let TopLevelLazyNestedValueComponent = class TopLevelLazyNestedValueComponent extends _reactForAtom.React.Component {

  constructor(props) {
    super(props);
    this.expandedValuePaths = new Map();
    this.handleExpansionChange = this.handleExpansionChange.bind(this);
    this.getCachedChildren = this.getCachedChildren.bind(this);
    this.setCachedChildren = this.setCachedChildren.bind(this);
    this.shouldCacheChildren = this.props.shouldCacheChildren == null ? false : this.props.shouldCacheChildren;
  }
  // $FlowIssue `evaluationResult` gets injected via HOC.


  handleExpansionChange(expandedValuePath, isExpanded) {
    const nodeData = this.expandedValuePaths.get(expandedValuePath) || { isExpanded: isExpanded, cachedChildren: null };
    if (isExpanded) {
      this.expandedValuePaths.set(expandedValuePath, _extends({}, nodeData, { isExpanded: true }));
    } else {
      this.expandedValuePaths.set(expandedValuePath, _extends({}, nodeData, { isExpanded: false }));
    }
  }

  getCachedChildren(path) {
    const nodeData = this.expandedValuePaths.get(path);
    if (nodeData == null) {
      return null;
    } else {
      return nodeData.cachedChildren;
    }
  }

  setCachedChildren(path, children) {
    const nodeData = this.expandedValuePaths.get(path);
    if (nodeData != null) {
      this.expandedValuePaths.set(path, _extends({}, nodeData, { cachedChildren: children }));
    }
  }

  render() {
    const className = this.props.className != null ? this.props.className : 'nuclide-ui-lazy-nested-value';
    return _reactForAtom.React.createElement(
      'span',
      { className: className },
      _reactForAtom.React.createElement(ValueComponent, _extends({}, this.props, {
        isRoot: true,
        expandedValuePaths: this.expandedValuePaths,
        onExpandedStateChange: this.handleExpansionChange,
        path: 'root',
        shouldCacheChildren: this.shouldCacheChildren,
        getCachedChildren: this.getCachedChildren,
        setCachedChildren: this.setCachedChildren
      }))
    );
  }
};


function arePropsEqual(p1, p2) {
  const evaluationResult1 = p1.evaluationResult;
  const evaluationResult2 = p2.evaluationResult;
  if (evaluationResult1 === evaluationResult2) {
    return true;
  }
  if (evaluationResult1 == null || evaluationResult2 == null) {
    return false;
  }
  return evaluationResult1.value === evaluationResult2.value && evaluationResult1.type === evaluationResult2.type && evaluationResult1.description === evaluationResult2.description;
}
const LazyNestedValueComponent = exports.LazyNestedValueComponent = (0, (_highlightOnUpdate || _load_highlightOnUpdate()).highlightOnUpdate)(TopLevelLazyNestedValueComponent, arePropsEqual, undefined, /* custom classname */
undefined);