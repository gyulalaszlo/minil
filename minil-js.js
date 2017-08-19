pegjs   = require("pegjs");
program = require("commander");
fs      = require("fs");
T       = require("tcomb");

program
    .version("0.0.5")
    .arguments("[sources]")
    .option("-g --grammar <PEGjs>", "PEGjs grammar to use", __dirname +
        "/minil.pegjs")
    .action(function(...args) {
      let sources = args.slice(0, args.length - 1);
      let opts    = args[args.length - 1];
      let parser  = pegjs.generate(fs.readFileSync(opts.grammar, "utf-8"));
      compile_files(parser, sources);
    })
    .parse(process.argv);

function compile_files(parser, fileList) {

  function printParserError({location, expected, found, message}) {
    console.log("---- %s ----", message);
    console.log("  location = ", location);
    console.log("  expected = ", expected);
    console.log("  found = ", found);
  }

  function readFile(fn) {
    return new Promise((resolve, reject) => {
      fs.readFile(fn, "utf-8", (err, val) => err ? reject(err) : resolve(val));
    });
  }

  return fileList.reduce(function(m, f) {
    return readFile(f)
        .then(parser.parse)
        .catch(printParserError)
        .then(concatJsCode)
        .then(toJs)
        //.then(v => JSON.stringify(v, null, "  "))
        .then(console.log)
        .catch(console.error);
  }, []);

}


function camelize(str) {
  return str.replace(/[^a-zA-Z0-9_\.]+/, ' ').replace(/(?:^\w|[A-Z]|\b\w)/g, function(letter, index) {
    return index === 0 ? letter.toLowerCase() : letter.toUpperCase();
  }).replace(/\s+/g, '');
}

function tupleBuilderTypes(baseName, stepTypeExtensions, stepFns) {

  let steps                 = [T.struct({}, `${baseName}/0`)];
  steps[0].prototype.append = stepFns[0];
  let last                  = stepFns.reduce(function(previousType, stepFn, i) {
    let extensionsThisRound      = stepTypeExtensions[i];
    let stepType                 = previousType.extend(extensionsThisRound,
                                                       `${baseName}/${i + 1}`);
    previousType.prototype.$next = stepType;
    stepType.prototype.append    = stepFns[i + 1];
    stepType.prototype.kind      = i;

    steps.push(stepType);
    return stepType;
  }, steps[0]);
  steps.last                = last;
  return steps;
}

// # Types

let Token = T.struct({
                       $type : T.String,
                       $value: T.Any
                     }, "Token");

function tokenType(token) { return Token(token).$type; }

function tokenValue(token) { return Token(token).$value; }

let TokenList     = T.list(Token);
let SequenceToken = T.refinement(Token, t => TokenList.is(t.$value),
                                 "SequenceToken");
let ParenToken    = T.refinement(SequenceToken, t => t.$type === "paren",
                                 "ParenToken");
let SquareToken   = T.refinement(SequenceToken, t => t.$type === "square",
                                 "SquareToken");

let AtomToken = T.refinement(Token, t => t.$type === "atom", "AtomToken");
let PairToken = T.refinement(Token, t => t.$type === "pair", "PairToken");

let Out   = {};
Out.Local = T.struct({name: T.String, boundTo: T.Any}, "Out.Local");
Out.Block = T.struct({steps: T.list(T.Any), locals: T.list(Out.Local)},
                     "Out.Block");

// ## State stack stuff

const State           = T.declare("State");
const AppendToStateFn = T.func([State], State, "AppendToStateFn");

const AtomState   = T.struct({atom: T.String}, "AtomState");
const IntState    = T.struct({intValue: T.Integer}, "IntState");
const StringState = T.struct({stringValue: T.String}, "StringState");

AtomState.prototype.toJs   = function() { return camelize(this.atom); };
IntState.prototype.toJs    = function() { return this.intValue.toString(); };
StringState.prototype.toJs = function() {
  return JSON.stringify(this.stringValue);
};

// ### Key-value pairs for dicts

const KeyValuePair0 = T.struct({}, {name: "KeyValuePair/0", defaultProps: {}});
const KeyValuePair1 = T.struct({value: State}, {name: "KeyValuePair/1"});
const KeyValuePair2 = T.struct({key: State, value: State},
                               {name: "KeyValuePair/2"});

const KeyValuePair = T.union([KeyValuePair0, KeyValuePair1, KeyValuePair2],
                             "KeyValuePair");

KeyValuePair0.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair1({value: what});
});

KeyValuePair1.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair2({key: what, value: this.value});
});

// ### Built-in expressions

const ExpressionState = T.struct({}, "ExpressionState");

// ### BlockState: inside a statement block

const BlockState = T.struct({
                              locals    : T.list(T.Any),
                              statements: T.list(State)
                            }, {
                              name        : "BlockState",
                              defaultProps: {
                                locals    : [],
                                statements: []
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
  let line   = s => `${indent}\t${s};\n`;
  let lines  = (ls) => ls.map(v => line(v)).join("");
  let letStr = lines(
      this.locals.map(l => `let ${l.name} = ${l.value.toJs(indent + "\t")}`));
  let body   = lines(this.statements.map(toJs));
  return `${indent}{\n${letStr}${body}${indent}}`;
};

// ### Sequence types

const SquareState = T.struct({
                               elements: T.list(State)
                             }, {
                               name        : "SquareState",
                               defaultProps: {elements: []}
                             });

const CurlyState = T.struct({
                              elements: T.list(State)
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
CurlyState.prototype.append  = _appendToElements(SquareState);

function toJs(v) { return v.toJs(); }

SquareState.prototype.toJs = function() {
  return "[" + this.elements.map(toJs).join(", ") + "]";
};

CurlyState.prototype.toJs = function() {
  return "{" + this.elements.map(toJs).join(", ") + "}";
};
// ### Paren: calls & specials

const ParenState0 = T.struct({}, "ParenState/0");
const ParenState1 = T.struct({head: State}, "ParenState/1");

const ParenState2 = T.struct({head: State, tail: T.list(State)},
                             {name: "ParenState/2", defaultProps: {tail: []}});

const ParenState = T.union([ParenState0, ParenState1, ParenState2],
                           "ParentState");

ParenState0.prototype.append = function(what) {
  if (AtomState.is(what)) {
    switch (what.atom) {
      case "let":
        return LetStates[0]({});
      case "fn":
        return FnState0({});
      case "def":
        return DefState0({});
      default:
        break;
    }
  }
  return ParenState1({head: what});
};

ParenState1.prototype.append = function(what) {
  return ParenState2({head: this.head, tail: [what]});
};

ParenState2.prototype.append = function(what) {
  return ParenState2.update(this, {tail: {$push: [what]}});
};

ParenState1.prototype.toJs = function(indent = "\t") {
  return `(${this.head.toJs()}())`;
};

ParenState2.prototype.toJs = function(indent = "\t") {
  return `${this.head.toJs()}( ${this.tail.map(v => v.toJs(indent + "\t"))
                                     .join(", ")} )`;
};

const LetStates = tupleBuilderTypes(
    "Builtins.Let",
    [{name: T.String}, {value: State}],
    [
      function(what) {
        if (!AtomState.is(what)) {
          throw new Error("First argument for `let` must be an atom");
        }
        return this.$next({name: what.atom});
      },
      function(what) {
        return BlockState({locals: [{name: this.name, value: what}]});
      }

    ]);

const FnState0 = T.struct({}, "Fn/0");
const FnState1 = FnState0.extend({args: T.list(State)}, "Fn/1");
const FnState2 = FnState1.extend({body: BlockState}, "Fn/2");

FnState0.prototype.append = function(what) {
  if (!SquareState.is(what)) {
    throw new Error("First argument for `fn` must be a square");
  }
  return FnState1({args: what.elements});
};

FnState1.prototype.append = function(what) {
  return FnState2({args: this.args, body: BlockState({}).append(what)});
};

FnState2.prototype.append = function(what) {
  return FnState2({args: this.args, body: this.body.append(what)});
};

FnState2.prototype.toJs = function(indent = "") {
  return `function(${this.args.map(v => v.atom)
                         .join(", ")})\n${this.body.toJs(indent + "\t")}`;
};

const DefState0 = T.struct({}, "Def/0");
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

DefState2.prototype.toJs = function(indent = "") {
  return `const ${this.name.toJs()} = ${this.value.toJs(indent + "\t")}`;
};

//const FunctionStates = tupleBuilderTypes(
//    "Builtins.Fn",
//    [{arguments: SquareState}, {body: BlockState}],
//    [
//      function(what) {
//        if (!SquareState.is(what)) {
//          throw new Error("First argument for `fn` must be a square");
//        }
//        return this.$next({name: what.atom});
//      },
//      function(what) {
//        return BlockState({locals: [{name: this.name, value: what}]});
//      }
//
//    ]);

// ### State definition

State.define(T.union([
                       BlockState,
                       ExpressionState,
                       AtomState,
                       IntState,
                       StringState,
                       SquareState,
                       KeyValuePair,

                       ParenState,
                       FnState2,
                       DefState2]));

//
function concatJsCode(sExprs) {
  const noPreprocessor = null;

  // ## Wrapped stuff

  // puts `what` between the elements of `seq`
  function interpose(what, seq) {
    let o    = [], len = seq.length;
    o.length = len * 2 - 1;
    for (let i = 0; i < len; ++i) {
      o[i * 2] = seq[i];
      if (i + 1 < len) { o[i * 2 + 1] = what; }
    }
    return o;
  }

  // returns the contents of seq grouped into n-tuples
  function groupsOf(n, seq, includeIncomplete = true) {
    let o           = [], len = seq.length;
    let preferedLen = (includeIncomplete ? Math.floor : Math.ceil)(seq.length /
        n);

    o.length = preferedLen;

    for (let i = 0; i < preferedLen; ++i) {
      let g = [];
      o[i]  = g;

      for (let j = 0; j < n; ++j) {
        let seqIdx = i * n + j;
        // stop if over the end
        if (seqIdx >= len) {
          break;
        }
        g.push(seq[seqIdx]);
      }
    }

    return o;
  }

  // single expression
  function expr(state, e) {
    let {$type, $value} = Token(e);

    switch ($type) {
      case "paren":
        return state.append($value.reduce(expr, ParenState0({})));

      case "square":
        return state.append($value.reduce(expr, SquareState({})));

      case "curly":
        return state.append($value.reduce(pair, CurlyState({})));

      case "atom":
        return state.append(AtomState({atom: $value}));

      case "integer":
        let intValue = parseInt($value);
        return state.append(IntState({intValue}));

      case "string":
        return state.append(StringState({stringValue: $value}));

      case "comment":
        return state;
      default:
        throw new Error("Unknown token type: " + $type);

    }
  }

  function pair(state, kv) {
    let [key, value] = PairToken(kv).$value;
    return state.append(expr(expr(KeyValuePair0({}), value), key));
  }

  function _withParsedExpression(callback, e, state) {

    state           = expr(state, e);
    let parsedValue = peek(state.stack);
    popFrom(state.stack);

    return callback(state, parsedValue);
  }

  function addStatements(statements, state) {
    state.statements.push(...statements);
    return state;
  }

  const specialForms = {
    "let": (state, e) => {
      let {$value} = e;

      //T.assert($value.length > 2,
      //    "Missing let bindings and/or body: (let [...] >>...<<)");

      //T.assert($value[1].$type === "square",
      //    "Expected the bindings to be a square: (let >>[...]<< ...)");

      let bindingsPairs = groupsOf(2, SequenceToken($value[1]).$value, false);

      // fold each binding into the state
      let bindingsState = bindingsPairs.reduce(function(state, [name, value]) {
        let boundToName = AtomToken(name).$value;
        return _withParsedExpression(function(state, parsedValue) {
          return addStatements(
              [Out.Local({name: boundToName, boundTo: parsedValue})],
              state);
        }, value, state);
      }, newState());

      // fold the body into the state
      let body      = $value.slice(2);
      let bodyState = body.reduce(function(state, step) {
        return _withParsedExpression(function(state, parsedValue) {
          return addStatements([parsedValue], state);
        }, step, state);
        //}, newState());
      }, BlockState({statements: [], locals: [], stack: [], stackStates: []}));

      let bodyBlock = Out.Block({
                                  steps : bodyState.statements,
                                  locals: bindingsState.statements
                                });
      state         = addStatements([bodyBlock], state);

      return state;
    },
    "if" : {}
  };

  // Ensure all tokens are of proper type
  function preProcessRawTokens(raw) {
    let {$type, $value} = raw;
    switch (raw.$type) {
      case "square":
      case "paren":
      case "curly":
        return Token({$type, $value: $value.map(preProcessRawTokens)});
      default:
        return Token(raw);
    }
  }

  let parsedState = sExprs.map(preProcessRawTokens)
                          .reduce(expr, BlockState({}));

  return parsedState;

}
