"use strict";

const t = require("tcomb");
const {State, AppendToStateFn, AtomState}   = require("../base/statementTypes");
const {toJs, manyToJs} = require('./toJs');

const ReturnStatement = t.struct({returns: State}, "ReturnStatement");

ReturnStatement.prototype.toJs = function(i) {
  return `return ${this.returns.toJs(i)}`;
};


const LocalBinding = t.struct({name: t.String, value: State}, "Local Binding");

// ### BlockState: inside a statement block
const kNO_EXIT      = "NoExit";
const kRETURN       = "Return";
const BlockExitType = t.enums.of([kNO_EXIT, kRETURN], "BlockExitType");

const BlockState = t.struct({
                              locals    : t.list(LocalBinding),
                              statements: t.list(State),
                              exitType  : BlockExitType
                            }, {
                              name        : "BlockState",
                              defaultProps: {
                                locals    : [],
                                statements: [],
                                exitType  : kNO_EXIT
                              }
                            });

// appends something to the end of
BlockState.prototype.append = AppendToStateFn.of(function(what) {

  // we should concat blocks that have defined locals until now
  if (BlockState.is(what) && this.statements.length === 0) {
    return BlockState.update(this, {
      locals    : {$push: what.locals},
      statements: {$push: what.statements}
    });
  }

  return BlockState.update(this, {statements: {$push: [what]}});
});

BlockState.prototype.toJs = function(indent = "") {
  if (this.locals.length === 0 && this.statements.length === 0) {
    return "{}";
  }

  // return-type-dependent

  let body = this.statements;
  switch (this.exitType) {

    case kRETURN:
      if (body.length > 0) {
        body          = body.slice(0);
        let lastIdx   = body.length - 1;
        body[lastIdx] = ReturnStatement({returns: body[lastIdx]});
      } else {
      }
      break;

    default:
      break;
  }

  let line     = s => `\n${indent}\t${s};`;
  let lines    = (ls) => ls.map(v => line(v)).join("");
  let contents = lines([].concat(
      this.locals.map(l => `let ${l.name} = ${l.value.toJs(indent + "\t")}`),
      body.map(v => toJs(v, indent + "\t"))
  ));
  //let letStr   = lines(
  //    this.locals.map(l => `let ${l.name} = ${l.value.toJs(indent +
  // "\t")}`)); let body     = lines(this.statements.map(v => v.toJs(indent +
  // "\t")));
  return `{${contents}\n${indent}}`;
};

module.exports = { BlockState, ReturnStatement, BlockExitType, kRETURN, kNO_EXIT };
