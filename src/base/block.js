"use strict";

const t                          = require("tcomb");
const Statements                 = require("../base/statementTypes");
const {toJs, manyToJs, OutToken} = require("./toJs");
const atomToJsSymbol             = require("../base/atomToJsSymbol");

const {State, AppendToStateFn, BlockExitType, kNO_EXIT, kRETURN} = Statements;

const ReturnStatement = t.struct({returns: State}, "ReturnStatement");

ReturnStatement.prototype.toJs = function(i) {
  return `return ${this.returns.toJs(i)}`;
};

const LocalBinding = t.struct({name: t.String, value: State}, "Local Binding");

LocalBinding.prototype.toJs = function(i) {
  let {name, value} = this;
  let o             = [
    "let",
    atomToJsSymbol(name),
    "=",
    toJs(value, i)
  ].join(" ");
  return o;
};

// ### BlockState: inside a statement block
//const kNO_EXIT      = "NoExit";
//const kRETURN       = "Return";
//const BlockExitType = t.enums.of([kNO_EXIT, kRETURN], "BlockExitType");

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

const BlockStateOut = OutToken.template(
    [
      {text: "{", tags: ["brace-open"]},
      {path: ["locals"]},
      {path: ["statements"]},
      {text: "}", tags: ["brace-close"]}
    ]);

BlockState.prototype.toJs = function(opts = {}) {
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

  let toJsOpts = {
    indent : (opts.indent || 0) + 1,
    prefix : "",
    postfix: "",
    joiner : ";"
  };
  console.log(BlockStateOut(this))
  let contents = manyToJs([].concat(this.locals, body), toJsOpts); //.map(l =>
                                                                   // manyToJs(l,
                                                                   // toJsOpts)).join("\n");
  console.log(contents);
  return "{" + contents + "\n}";
};

module.exports = {
  BlockState,
  ReturnStatement
};
