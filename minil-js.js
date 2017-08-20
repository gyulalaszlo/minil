#!/usr/bin/env node
const pegjs   = require("pegjs");
const program = require("commander");
const fs      = require("fs");
const t       = require("tcomb");

const atomToJsSymbol   = require("./src/base/atomToJsSymbol");
const Token            = require("./src/base/tokenTypes");
const {groupsOf}       = require("./src/base/arrayHelpers");
const StatementTypes   = require("./src/base/statementTypes");
const SequenceStates   = require("./src/base/sequences");
const {toJs, manyToJs} = require("./src/base/toJs");
const LetStates        = require("./src/builtins/let");
const IfStates         = require("./src/builtins/if");
const DefStates        = require("./src/builtins/def");
const DefnStates       = require("./src/builtins/defn");
const FnStates         = require("./src/builtins/fn");
const Get              = require("./src/builtins/get");
const NumericInfix     = require("./src/builtins/numeric-infix-operators");
const Mutate           = require("./src/builtins/mutate");

const {State, AtomState, StringState, IntState, PrimitiveStates} = StatementTypes;

const {BlockState} = require("./src/base/block");

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

  function wrappedParse(filename, source) {
    try {
      console.log("[%s]", filename);
      return parser.parse(source);
    } catch (e) {
      printParserError(e, filename, source);
      throw e;
    }
  }

  function printParserError(
      {location, expected, found, message}, filename = "<UNNAMED>", source = "")
  {
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

  function writeFile(source, fn, data) {
    return new Promise((resolve, reject) => {
      fs.writeFile(fn, data, "utf-8", function(err, val) {
        let bytes = data.length;
        return err ? reject(err) : resolve(
            {ok: {action: "written", bytes, source, compiled: fn}});
      });
    });
  }

  return fileList.reduce(function(m, f) {
    return readFile(f)
    //.then(parser.parse)
        .then(src => wrappedParse(f, src))
        .then(concatJsCode)
        .then(toJs)
        .then(v => writeFile(f, f + ".js", v))
        .then(console.log)
        .catch(e => {
          console.error(e);
          process.exit(-12);
        });
  }, []);

}

// ### Paren: calls & specials

const ParenStates = require("./src/base/applications")(
    Object.assign(
        {
          "with-local": LetStates[0]({}),
          "fn"        : FnStates.empty,
          "def"       : DefStates.empty,
          "defn"      : DefnStates.empty,
          "if"        : IfStates.empty,
          "get"       : Get.empty
        },
        NumericInfix.empties,
        Mutate.empties
    ));

// ### State definition

State.define(t.union([
                       BlockState,
                       PrimitiveStates.union,
                       SequenceStates.union,

                       ParenStates.union,
                       FnStates.union,
                       DefStates.union,
                       DefnStates.union,

                       IfStates.union,
                       Get.union,
                       NumericInfix.union,
                       Mutate.union
                     ]));

//
function concatJsCode(sExprs) {

  function expr(state, expr) {
    try {
      return _expr(state, expr);
    } catch (e) {
      //let debugValue   = function(expr) {
      //  try { return JSON.stringify(expr); }
      //  catch (e) { return expr.toString(); }
      //}(expr);
      let debugValue ="...";
      let MAX_JSON_LEN = 60;
      if (debugValue.length > MAX_JSON_LEN) {
        debugValue = debugValue.substr(0, MAX_JSON_LEN) + " ...";
      }
      let valCons = t.getTypeName(state.__proto__.constructor);
      e.message += `\n\t-> expr() \`${valCons}\`: ${debugValue}`;
      throw e;
    }
  }

  // ## Wrapped stuff
  // single expression
  function _expr(state, e) {
    if (Array.isArray(e)) {

      console.log('----------')
      e.forEach(v => console.log("==>", v));
    }
    let {$type, $value} = Token.Token(e);

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
        return state.append(StringState({stringValue: atomToJsSymbol($value)}));

      case "comment":
        return state;
      default:
        throw new Error("Unknown token type: " + $type);

    }
  }

  function pair(state, kv) {
    let [key, value] = Token.PairToken(kv).$value;
    return state.append(
        expr(expr(SequenceStates.emptyKeyValuePair, value), key));
  }

  return Token.preProcessRawTokens(sExprs) //.map(v => Token.preProcessRawTokens(v))
              //.map(v => { console.log(v); return v; })
              .reduce(expr, BlockState({}));

}
