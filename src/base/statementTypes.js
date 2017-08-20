"use strict";

const t = require("tcomb");
const atomToJsSymbol   = require("./atomToJsSymbol");

const State           = t.declare("State");
const AppendToStateFn = t.func([State], State, "AppendToStateFn");

const AtomState   = t.struct({atom: t.String}, "AtomState");
const IntState    = t.struct({intValue: t.Integer}, "IntState");
const StringState = t.struct({stringValue: t.String}, "StringState");

AtomState.prototype.toJs   = function() { return atomToJsSymbol(this.atom); };
IntState.prototype.toJs    = function() { return this.intValue.toString(); };
StringState.prototype.toJs = function() {
  return JSON.stringify(this.stringValue);
};

module.exports = {
  State, AppendToStateFn,
  AtomState, StringState, IntState,

  PrimitiveStates: { union: t.union([ AtomState, StringState, IntState ]) }
};