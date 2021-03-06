"use strict";

const t                     = require("tcomb");
const {State, AtomState}    = require("../base/statementTypes");
const SequenceStates        = require("../base/sequences");
const {BlockState, kRETURN} = require("../base/block");

const {toJs, manyToJs, OutToken} = require("../base/toJs");

//// #### `(defn <name> ...)`
//
const DefnState0 = t.struct({}, "Defn/0");
const DefnState1 = DefnState0.extend({name: AtomState}, "Defn/1");
const DefnState2 = DefnState1.extend({args: SequenceStates.Square}, "Defn/2");
const DefnState3 = DefnState2.extend({body: BlockState}, "Defn/3");

DefnState0.prototype.append = function(what) {
  if (!AtomState.is(what)) {
    throw new Error("First argument for `def` must be an atom");
  }
  return DefnState1({name: what});
};

DefnState1.prototype.append = function(what) {
  return DefnState2({name: this.name, args: what});
};

DefnState2.prototype.append = function(what) {
  return DefnState3(
      {
        name: this.name,
        args: this.args,
        body: BlockState({exitType: kRETURN}).append(what)
      });
};

DefnState3.prototype.append = function(what) {
  return DefnState3.update(this, {body: {$set: this.body.append(what)}});
};

const Defn3Template = OutToken.template(
    [
      {text: "function", tags: ["keyword"]},
      {path: ["name"]},
      {text: "(", tags: ["paren-open"]},
      {path: ["args", "elemenents"]},
      {text: ")", tags: ["paren-close"]},
      {path: ["body"]}
    ]);

DefnState3.prototype.toJs = function(opts) {
  opts        = Object.assign(opts, {joiner: ","});
  let argList = manyToJs(this.args.elements, opts);
  let bodyStr = toJs(this.body, opts);
  let o = Defn3Template(this)
  //let o       = OutToken.concat([
  //                                {tags: [], text: "function"}
  //                                //...([].concat(toJs(this.name, opts),
  //                                //              argList,
  //                                //              bodyStr))
  //
  //                              ], OutToken.empty);
  return `\nfunction ${toJs(this.name, opts)}(${argList})${bodyStr}`;
};

module.exports = {
  empty: DefnState0({}),
  union: t.union([DefnState0, DefnState1, DefnState2, DefnState3])
};
