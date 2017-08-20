"use strict";

const t = require('tcomb');
const {State} = require('../base/statementTypes');

const If0 = t.struct({}, "If/0");
const If1 = If0.extend({condition: State}, "If/1");
const If2 = If1.extend({onTrue: State}, "If/2");
const If3 = If2.extend({onFalse: State}, "If/3");

If0.prototype.append = function(what) {
  if (BlockState.is(what)) {
    throw new Error("Cannot add statement(s) as conditions to `(if)` block. Got:" +
        JSON.stringify(what));
  }
  return If1({condition: what});
};

If1.prototype.append = function(what) {
  return If2({condition: this.condition, onTrue: what});
};
If2.prototype.append = function(what) {
  return If3({condition: this.condition, onTrue: this.onTrue, onFalse: what});
};

If3.prototype.toJs = function(indent = "") {
  return `if (${this.condition.toJs(indent)}) ${this.onTrue.toJs(
      indent)} else ${this.onFalse.toJs(indent)}`;
};

module.exports = {
  empty: If0({}),
  union: t.union([If0, If1, If2, If3], "If")
};