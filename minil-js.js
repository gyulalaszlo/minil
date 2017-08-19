pegjs   = require("pegjs");
program = require("commander");
fs      = require("fs");
t       = require("tcomb");

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

// Helper for camel-casing an identifier
const camelize = (function() {

  const CHAR_NAME_MAP = [

    [/\+/g, " Plus "],
    [/^-$/g, " Minus "],
    //[/-/g, '_'],
    [/=/g, " Equal "],
    [/[^a-zA-Z0-9_\$\.]+/g, " "]
  ];

  function camelizeWord(str) {
    return str.substr(0, 1).toUpperCase() + str.substr(1);
  }

  function camelize(str) {
    let renamed = CHAR_NAME_MAP.reduce(function(built, [rx, renameTo]) {
      return built.replace(rx, renameTo);
    }, str);

    let words      = renamed.split(/ +/g);
    let fromSecond = words.slice(1).map(camelizeWord);
    return words.slice(0, 1).concat(fromSecond).join("");
  }

  return camelize;
}());

function tupleBuilderTypes(baseName, stepTypeExtensions, stepFns) {

  let steps                 = [t.struct({}, `${baseName}/0`)];
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

let Token = t.struct({
                       $type : t.String,
                       $value: t.Any
                     }, "Token");

function tokenType(token) { return Token(token).$type; }

function tokenValue(token) { return Token(token).$value; }

let TokenList     = t.list(Token);
let SequenceToken = t.refinement(Token, t => TokenList.is(t.$value),
                                 "SequenceToken");
let ParenToken    = t.refinement(SequenceToken, t => t.$type === "paren",
                                 "ParenToken");
let SquareToken   = t.refinement(SequenceToken, t => t.$type === "square",
                                 "SquareToken");

let AtomToken = t.refinement(Token, t => t.$type === "atom", "AtomToken");
let PairToken = t.refinement(Token, t => t.$type === "pair", "PairToken");

let Out   = {};
Out.Local = t.struct({name: t.String, boundTo: t.Any}, "Out.Local");
Out.Block = t.struct({steps: t.list(t.Any), locals: t.list(Out.Local)},
                     "Out.Block");

// ## State stack stuff

const State           = t.declare("State");
const AppendToStateFn = t.func([State], State, "AppendToStateFn");

const AtomState   = t.struct({atom: t.String}, "AtomState");
const IntState    = t.struct({intValue: t.Integer}, "IntState");
const StringState = t.struct({stringValue: t.String}, "StringState");

AtomState.prototype.toJs   = function() { return camelize(this.atom); };
IntState.prototype.toJs    = function() { return this.intValue.toString(); };
StringState.prototype.toJs = function() {
  return JSON.stringify(this.stringValue);
};

// ### Key-value pairs for dicts

const KeyValuePair0 = t.struct({}, {name: "KeyValuePair/0", defaultProps: {}});
const KeyValuePair1 = t.struct({value: State}, {name: "KeyValuePair/1"});
const KeyValuePair2 = t.struct({key: State, value: State},
                               {name: "KeyValuePair/2"});

const KeyValuePair = t.union([KeyValuePair0, KeyValuePair1, KeyValuePair2],
                             "KeyValuePair");

KeyValuePair0.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair1({value: what});
});

KeyValuePair1.prototype.append = AppendToStateFn.of(function(what) {
  return KeyValuePair2({key: what, value: this.value});
});

KeyValuePair2.prototype.toJs = function(i) {
  return `${this.key.toJs(i)} : ${this.value.toJs(i + "\t")}`;
};

// ### Built-in expressions

const ExpressionState = t.struct({}, "ExpressionState");

// ### BlockState: inside a statement block
const kNO_EXIT      = "NoExit";
const kRETURN       = "Return";
const BlockExitType = t.enums.of([kNO_EXIT, kRETURN], "BlockExitType");

const LocalBinding = t.struct({name: t.String, value: State}, "Local Binding");
const BlockState   = t.struct({
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

const ReturnStatement = t.struct({returns: State}, "ReturnStatement");

ReturnStatement.prototype.toJs = function(i) {
  return `return ${this.returns.toJs(i)}`;
};

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
      body.map(v => v.toJs(indent + "\t"))
  ));
  //let letStr   = lines(
  //    this.locals.map(l => `let ${l.name} = ${l.value.toJs(indent + "\t")}`));
  //let body     = lines(this.statements.map(v => v.toJs(indent + "\t")));
  return `{${contents}\n${indent}}`;
};

function toJs(v) { return v.toJs(); }

// ### Sequence types

const SequenceStates = (function() {

  const SquareState = t.struct({
                                 elements: t.list(State)
                               }, {
                                 name        : "SquareState",
                                 defaultProps: {elements: []}
                               });

  const CurlyState = t.struct({
                                elements: t.list(State)
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

  SquareState.prototype.toJs = function() {
    return "[" + this.elements.map(toJs).join(", ") + "]";
  };

  CurlyState.prototype.toJs = function() {
    return "{" + this.elements.map(toJs).join(", ") + "}";
  };

  return {
    Square: SquareState,
    Curly : CurlyState
  };

}());

// ### Paren: calls & specials

const ParenStates = (function() {
  const ParenState0 = t.struct({}, "ParenState/0");
  const ParenState1 = t.struct({head: State}, "ParenState/1");

  const ParenState2 = t.struct({head: State, tail: t.list(State)},
                               {
                                 name        : "ParenState/2",
                                 defaultProps: {tail: []}
                               });

  ParenState0.prototype.append = function(what) {
    if (AtomState.is(what)) {
      switch (what.atom) {
        case "with-local":
          return LetStates[0]({});
        case "fn":
          return FnStates.empty;
        case "def":
          return DefStates.empty;
        case "defn":
          return DefnStates.empty;
        case "if":
          return IfStates.empty;
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

  ParenState1.prototype.toJs = function(indent) {
    if (!AtomState.is(this.head)) {
      return `(${this.head.toJs(indent)}())`;
    }
    return `${this.head.toJs(indent)}()`;
  };

  ParenState2.prototype.toJs = function(indent = "\t") {
    return `${this.head.toJs()}(${this.tail.map(v => v.toJs(indent + "\t"))
                                      .join(", ")})`;
  };

  return {
    empty: ParenState0({}),
    union: t.union([ParenState0, ParenState1, ParenState2])
  };
}());

// #### `(let [...] ...)`

if (false) {

  const LetBlockStates = (function() {

    const Let0 = t.struct({}, "Let/0");
    const Let1 = Let0.extend({bindings: t.list(LocalBinding)}, "Let/1");

    const LetBinding0 = t.struct({}, "LetBinding/0");
    const LetBinding1 = LetBinding0.extend({name: String}, "LetBinding/1");

    Let0.prototype.append = function(bindings) {
      let pairs = groupsOf(2, SquareState(bindings).elements, false);

      return Let1({bindings: toLocalBinding});
    };

    LetBinding0.prototype.append = function(name) {
      if (!AtomToken.is(name)) {
        throw new Error("Binding in `let` requires an atom for name");
      }

      return LetBinding1({name: AtomToken(name).atom});
    };

    LetBinding1.prototype.append = function(val) {
      return LocalBinding({name: this.name, value: val});
    };

    return {
      baseType: Let0
    };
  }());
}

const LetStates = tupleBuilderTypes(
    "Builtins.Let",
    [{name: t.String}, {value: State}],
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

// #### `(fn [...] ...)`

const FnStates = (function() {

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
    return `function(${this.args.map(v => v.atom)
                           .join(", ")})${this.body.toJs(indent)}`;
  };

  return {
    empty: FnState0({}),
    union: t.union([FnState0, FnState1, FnState2])
  };
}());
// #### `(def <name> ...)`

const DefStates = (function() {
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

  DefState2.prototype.toJs = function(indent = "") {
    return `\n${indent}const ${this.name.toJs()} = ${this.value.toJs(indent)}`;
  };

  return {
    empty: DefState0({}),
    union: t.union([DefState0, DefState1, DefState2])
  };
}());

const DefnStates = (function() {

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

  DefnState3.prototype.toJs = function(indent = "") {
    let argList = this.args.elements.map(toJs).join(", ");
    let bodyStr = this.body.toJs(indent);
    return `\n${indent}function ${this.name.toJs()}(${argList})${bodyStr}`;
  };

  return {
    empty: DefnState0({}),
    union: t.union([DefnState0, DefnState1, DefnState2, DefnState3])
  };
}());

const IfStates = (function() {

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

  return {
    empty: If0({}),
    union: t.union([If0, If1, If2, If3], "If")
  };
}());
// ### State definition

State.define(t.union([
                       BlockState,
                       ExpressionState,
                       AtomState,
                       IntState,
                       StringState,
                       SequenceStates.Square,
                       SequenceStates.Curly,
                       KeyValuePair,

                       ParenStates.union,
                       FnStates.union,
                       DefStates.union,
                       DefnStates.union,

                       IfStates.union
                     ]));

//
function concatJsCode(sExprs) {

  // ## Wrapped stuff
  // single expression
  function expr(state, e) {
    let {$type, $value} = Token(e);

    switch ($type) {
      case "paren":
        return state.append($value.reduce(expr, ParenStates.empty));

      case "square":
        return state.append($value.reduce(expr, SequenceStates.Square({})));

      case "curly":
        return state.append($value.reduce(pair, SequenceStates.Curly({})));

      case "atom":
        return state.append(AtomState({atom: $value}));

      case "integer":
        let intValue = parseInt($value);
        return state.append(IntState({intValue}));

      case "string":
        return state.append(StringState({stringValue: $value}));

      case "key":
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
