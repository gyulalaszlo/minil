
{
const CURLY_O = "{";
const CURLY_I = "}";

const token = (name,v) => ({$type:name, $value:v});
/* const token = (name,v) => v; */


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

}

Program = a:AtomList { return a; }

AtomList = WS* l:AtomListBase? { return l === null ? [] : l; }

AtomListBase
	= h:AtomListElement  t:(WS+ a:AtomListElement { return a; })* WS* {
    	return t ? [h].concat(t) : [h];
    }

AtomListElement
	= Key
    / Atom
    / Integer
//    / Macro
    / String
    / Comment
    / Paren
    / Curly
    / Square
//    / Lambda



Comment
	= ';'+ comment:$[^\n\r]* { return token("comment", comment); }


Paren = '(' p:ParenInner ')'  { return token("paren", p); }

ParenInner = l:AtomList { return l; }

Square = '[' square:AtomList ']' { return token("square", square); }
Curly = '{' curly:AtomList '}' { return token("curly", groupsOf(2, curly, false).map(p => token("pair", p))); }

//Lambda = '#' p:Paren { return { lambda:p.paren }; }

/* LetExpr */
/* 	= Let WS* '[' exprs:(n:Atom WS* expr:AtomListElement WS* { return "let " + n + "=" + expr + ";" } )+ ']'  a:AtomList { */
/*     	return exprs.concat(a).join('\n'); */
/*     } */

/* DefExpr */
/* 	= Def WS* name:Atom WS+ a:AtomListElement { */
/*     	return ["const" , name, '=' ].concat(a, [';']).join(' '); */
/*     } */

/* FnExpr */
/* 	= Fn WS* '[' WS* args:AtomList? WS* ']' WS* a:AtomList { */
/*         return ['function(' + (args || "") + ') {\n\t'].concat(a, ['}']).join(' '); */
/*     } */


/* Path */
/*   = a:Exportable b:('/' e:Exportable {return e})* { return [a].concat(b).join('.'); } */

/* Exportable */
/*   = Atom // / Macro */

/* Let = 'let' */
/* Def = 'def' */
/* Fn = 'fn' */

Atom = ![#0-9] atom:$AtomChar+ { return token("atom", atom); }
Key = ':' key:$AtomChar+ { return token("key", key); }
//Macro = '#' macro:$AtomChar+ { return { macro }; }
String = '"' string:$[^"]* '"' { return token("string", JSON.parse('"' + string + '"')); }
Integer = val:$[0-9]+ { return token("integer", val); }

AtomChar = [^(){}\[\]:^\t\n\r,;" ]

WS = [\t\r\n, ]
