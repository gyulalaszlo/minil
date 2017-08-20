"use strict";

const t                     = require("tcomb");
const {State, AtomState}    = require("../base/statementTypes");
const SequenceStates        = require("../base/sequences");
const {BlockState, kRETURN} = require("../base/block");

const {toJs, manyToJs} = require("../base/toJs");

const FnState0 = t.struct({}, "Fn/0");
const FnState1 = FnState0.extend({args: t.list(State)}, "Fn/1");
const FnState2 = FnState1.extend({body: BlockState}, "Fn/2");

FnState0.prototype.append = function(what) {
  if (!SequenceStates.Square.is(what)) {
    throw new Error("First argument for `fn` must be a square");
  }
  return FnState1({args: what.elements});
};

FnState1.prototype.append = function(what) {
  return FnState2(
      {args: this.args, body: BlockState({exitType: kRETURN}).append(what)});
};

FnState2.prototype.append = function(what) {
  return FnState2({args: this.args, body: this.body.append(what)});
};

FnState2.prototype.toJs = function(indent = "") {
  return `function(${this.args.map(v => toJs(v, indent))
                         .join(", ")})${toJs(this.body, indent)}`;
};

module.exports = {
  empty: FnState0({}),
  union: t.union([FnState0, FnState1, FnState2])
};
