"use strict";

const t                                   = require("tcomb");
const {State, AppendToStateFn, AtomState} = require("../base/statementTypes");
const {toJs, manyToJs}                    = require("./toJs");

// ------------------------------------------

const KeyValuePair0 = t.struct({}, {name: "KeyValuePair/0", defaultProps: {}});
const KeyValuePair1 = t.struct({value: State}, {name: "KeyValuePair/1"});
const KeyValuePair2 = t.struct({key: State, value: State},
                               {name: "KeyValuePair/2"});

const KeyValuePair = t.union([KeyValuePair0, KeyValuePair1, KeyValuePair2],
                             "KeyValuePair");


// ------------------------------------------

KeyValuePair0.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair1({value: what});
});

KeyValuePair1.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair2({key: what, value: this.value});
});

KeyValuePair2.prototype.toJs = function(i) {
  return `${toJs(this.key, i)} : ${toJs(this.value, i + "\t")}`;
};


// ------------------------------------------

const SquareState = t.struct({
                               elements: t.list(State)
                             }, {
                               name        : "SquareState",
                               defaultProps: {elements: []}
                             });

const CurlyState = t.struct({
                              elements: t.list(KeyValuePair2)
                            }, {
                              name        : "CurlyState",
                              defaultProps: {elements: []}
                            });

// ###
const _appendToElements = function(type) {
  return AppendToStateFn.of(function(...what) {
    return type.update(this, {elements: {$push: what}});
  });
};

SquareState.prototype.append = _appendToElements(SquareState);
CurlyState.prototype.append  = _appendToElements(CurlyState);

SquareState.prototype.toJs = function(i) {
  return "[" + manyToJs(this.elements, {indent: i, joiner: ", "}) + "]";
};

CurlyState.prototype.toJs = function(i) {
  return "{" +
      manyToJs(this.elements, {indent: 0, joiner: `,`, prefix: `\n`}) +
      "\n" +
      i + "}";
};

module.exports = {
  Square: SquareState,
  Curly : CurlyState,
  union: t.union([SquareState, CurlyState, KeyValuePair]),
  emptyKeyValuePair: KeyValuePair0({})
};

