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
        .then(v => JSON.stringify(v, null, "  "))
        .then(console.log)
        .catch(console.error);
  }, []);

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
BlockState.prototype.append = AppendToStateFn.of(function(...what) {
  return BlockState.update(this, {statements: {$push: what}});
});

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

// ### Paren: calls & specials

const ParenState0 = T.struct({}, "ParenState/0");
const ParenState1 = T.struct({head: State}, "ParenState/1");

const ParenState2 = T.struct({head: State, tail: T.list(State)},
                             {name: "ParenState", defaultProps: {tail: []}});

const ParenState = T.union([ParenState0, ParenState1, ParenState2],
                           "ParentState");

ParenState0.prototype.append = function(what) {
  return ParenState1({head: what});
};

ParenState1.prototype.append = function(what) {
  return ParenState2({head: this.head, tail: [what]});
};

ParenState2.prototype.append = function(what) {
  return ParenState2.update(this, {tail: {$push: [what]}});
};
// ### State definition

State.define(T.union([
                       BlockState,
                       ExpressionState,
                       AtomState,
                       IntState,
                       StringState,
                       SquareState,
                       KeyValuePair,

                       ParenState]));

//
function concatJsCode(sExprs) {

  function newState() {
    return {
      statements : [],
      stack      : [],
      stackStates: []
    };
  }

  // saves the curent stack
  function saveStack(state) {
    //state.stackStates.push(state.stack);
    //state.stack = [];

    return state;
  }

  function restoreStack(state) {
    //let {stackStates} = state;
    //state.stack       = stackStates[stackStates.length - 1];
    //state.stackStates.pop();

    return state;
  }

  function pushTo(stack, what) {
    stack.push(what);
    return stack;
  }

  function popFrom(stack) {
    stack.pop();
    return stack;
  }

  function peek(stack) {
    if (stack.length === 0) return null;
    return stack[stack.length - 1];
  }

  function paraseList(state, e) {
    let values         = TokenList(tokenValue(e).map(v => Token(v)));
    state              = saveStack(state);
    state              = values.reduce(expr, state);
    let parsedElements = state.stack;
    state              = restoreStack(state);

    pushTo(state.stack, parsedElements);
    return state;
  }

  const noPreprocessor = null;

  // Transforms a parsed seqence and pushes the result to the stack of the state
  function mapParsedSeqence(preprocessor, callback, state, e) {
    if (preprocessor) {
      state = preprocessor(saveStack(state), e);
      e     = state.stack;
      state = restoreStack(state);
    }

    state      = paraseList(state, e);
    let parsed = peek(state.stack);

    popFrom(state.stack);
    let transformed = callback(state, parsed, e);
    pushTo(state.stack, transformed);
    return state;
  }

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

  function paren(state, parsed, e) {
    if (e.length === 0) { throw new Error("Empty () encountered");}
    let first = parsed[0];

    if (specialForms[first]) {
      state = specialForms[first](state, e);
      return [];
    } else {
      //let parsed = toParse
      let args = interpose(",", parsed.slice(1));
      return [parsed[0], "(", ...args, ")"];
    }

  }

  /*
  function square(state, parsed, e) {
    let elements = interpose(",", parsed);
    return ["[", ...elements, "]"];
  }

  function curly(state, parsed, e) {
    if (parsed.length % 2 !== 0) {
      throw new Error("Unpaired key in key-value pairs");
    }

    let pairs    = groupsOf(2, parsed, false).map(([k, v]) => [k, ":", v]);
    let elements = interpose(",", pairs);
    return ["{", ...elements, "}"];
  }

  */
  ///

  // single expression
  function expr(state, e) {
    let {$type, $value} = Token(e);

    switch ($type) {
      case "paren":
        return state.append($value.reduce(expr, ParenState0({})));
        //return mapParsedSeqence(noPreprocessor, paren, state, e);

      case "square":
        return state.append($value.reduce(expr, SquareState({})));
        //return mapParsedSeqence(noPreprocessor, square, state, e);
        //
      case "curly":
        return state.append($value.reduce(pair, CurlyState({})));
        //return mapParsedSeqence(noPreprocessor, curly, state, e);

      case "atom":
        return state.append(AtomState({atom: $value}));

      case "integer":
        let intValue = parseInt($value.join(""));
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
