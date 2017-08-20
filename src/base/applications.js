"use strict";

const t                  = require("tcomb");
const {State, AtomState} = require("../base/statementTypes");
const {toJs, manyToJs}   = require("./toJs");

module.exports = function(emptyBuiltinsByNameMap = {}) {
  const ParenState0 = t.struct({}, "ParenState/0");
  const ParenState1 = ParenState0.extend({head: State}, "ParenState/1");
  const ParenState2 = ParenState1.extend({tail: t.list(State)},
                                         {
                                           name        : "ParenState/2",
                                           defaultProps: {tail: []}
                                         });

  ParenState0.prototype.append = function(what) {
    if (AtomState.is(what)) {
      let name         = what.atom;
      let maybeBuiltin = emptyBuiltinsByNameMap[name];

      if (maybeBuiltin) {
        return maybeBuiltin;
      }

      //switch (what.atom) {
      //  case "with-local":
      //    return LetStates[0]({});
      //  case "fn":
      //    return FnStates.empty;
      //  case "def":
      //    return DefStates.empty;
      //  case "defn":
      //    return DefnStates.empty;
      //  case "if":
      //    return IfStates.empty;
      //  default:
      //    break;
      //}
    }
    return ParenState1({head: what});
  };

  ParenState1.prototype.append = function(what) {
    return ParenState2({head: this.head, tail: [what]});
  };

  ParenState2.prototype.append = function(what) {
    return ParenState2.update(this, {tail: {$push: [what]}});
  };

  ParenState0.prototype.toJs = function() {
    throw new Error("Empty call found in code");
  };

  ParenState1.prototype.toJs = function(indent) {
    if (!AtomState.is(this.head)) {
      return `(${this.head.toJs(indent)}())`;
    }
    return `${this.head.toJs(indent)}()`;
  };

  ParenState2.prototype.toJs = function(indent = "\t") {
    let args = manyToJs(this.tail, {indent: indent, joiner: ", "});
    return toJs(this.head, indent) + "(" + args + ")";
  };

  return {
    empty: ParenState0({}),
    union: t.union([ParenState0, ParenState1, ParenState2])
  };
};
