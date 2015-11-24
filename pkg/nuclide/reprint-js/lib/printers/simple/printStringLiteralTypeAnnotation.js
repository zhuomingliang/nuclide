'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Lines, Print} from '../../types/common';
import type {StringLiteralTypeAnnotation} from 'ast-types-flow';

const escapeStringLiteral = require('../../utils/escapeStringLiteral');

function printStringLiteralTypeAnnotation(
  print: Print,
  node: StringLiteralTypeAnnotation,
): Lines {
  return [escapeStringLiteral(node.value, {quotes: 'single'})];
}

module.exports = printStringLiteralTypeAnnotation;
