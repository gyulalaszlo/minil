"use strict";

const t                  = require("tcomb");
const {State, AtomState} = require("../base/statementTypes");
const {BlockState}       = require("../base/block");
const {toJs, manyToJs}   = require("../base/toJs");

const DefState0 = t.struct({}, "Def/0");
const DefState1 = DefState0.extend({name: AtomState}, "Def/1");
const DefState2 = DefState1.extend({value: State}, "Def/2");

DefState0.prototype.append = function(what) {
  if (!AtomState.is(what)) {
    throw new Error("First argument for `def` must be an atom");
  }
  return DefState1({name: what});
};

DefState1.prototype.append = function(what) {
  return DefState2({name: this.name, value: what});
};

DefState2.prototype.append = function(what) {
  throw new Error("Excess arguments for def: (def NAME VALUE >>>" +
      JSON.stringify(what) + "<<<<)");
};

DefState2.prototype.toJs = function(opts={}) {
  opts = Object.assign({indent: 1}, opts);
  let nameJs    = toJs(this.name, opts);
  let exportDef = ["module.exports.", nameJs, "=", nameJs];
  let defLine   = ["const", nameJs, "=", toJs(this.value, opts)];
  return [defLine, exportDef].map(l => l.join(" ")).join("\n");

};

module.exports = {
  empty: DefState0({}),
  union: t.union([DefState0, DefState1, DefState2])
};
